"""
YogaTwin-AI Machine Learning Pose Classification Service
Runs MediaPipe Pose + Multi-Level LightGBM Classifiers (Level 6, 20, 82)
on dedicated port 5006.

Endpoints:
- GET  /api/health           -> Service health and model status
- GET  /api/pose             -> Current real-time classification results across 3 levels
- GET  /api/camera-preview   -> MJPEG live camera stream with skeleton + classification HUD
- POST /api/camera/switch    -> Switch active camera index (0 <-> 1)
- POST /api/classify         -> Directly classify a 33-landmark payload from client
"""

import os
import sys
import time
import threading
from typing import Dict, Any, Optional

import cv2
import mediapipe as mp
import numpy as np
import joblib
from flask import Flask, jsonify, Response, request
from flask_cors import CORS

from feature_extractor import (
    extract_features_from_mediapipe,
    extract_features_from_dict_list,
    JOINT_INDICES
)
from labels import LABEL_6_NAMES, LABEL_20_NAMES, LABEL_82_NAMES

# ── Configuration ─────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")
PORT = int(os.environ.get("ML_PORT", "5006"))
DEFAULT_CAMERA = int(os.environ.get("ML_CAMERA_INDEX", "0"))

# Thresholds per classification level
THRESHOLDS = {
    "6": 0.40,
    "20": 0.35,
    "82": 0.30
}

# ── Flask App Setup ───────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)

# ── Global State & Threading ───────────────────────────────────────────────────
classifiers: Dict[str, Any] = {}
label_encoders: Dict[str, Any] = {}
models_loaded = False

active_camera_index = DEFAULT_CAMERA
target_camera_index = DEFAULT_CAMERA
switch_camera_requested = False

camera_enabled = False
last_activity_time = 0.0
IDLE_RELEASE_TIMEOUT = 12.0  # seconds of no client activity before releasing camera

def mark_camera_activity():
    global camera_enabled, last_activity_time
    camera_enabled = True
    last_activity_time = time.time()

running = True
latest_frame = None
frame_lock = threading.Lock()
result_lock = threading.Lock()
camera_lock = threading.Lock()

current_result: Dict[str, Any] = {
    "status": "starting",
    "level_6": {"class": None, "class_id": None, "confidence": 0.0},
    "level_20": {"class": None, "class_id": None, "confidence": 0.0},
    "level_82": {"class": None, "class_id": None, "confidence": 0.0},
    "torso_scale": 0.0,
    "timestamp": time.time(),
    "camera": DEFAULT_CAMERA,
}

last_detected_result: Dict[str, Any] = {
    "level_6": None,
    "level_20": None,
    "level_82": None,
    "timestamp": None,
}


def load_classifiers():
    """Load all 3 LightGBM classifiers and label encoders from models/."""
    global classifiers, label_encoders, models_loaded
    print("=" * 65)
    print("YOGATWIN-AI -- MACHINE LEARNING CLASSIFIER SERVICE")
    print("=" * 65)
    print(f"Loading ML models from: {MODELS_DIR}")

    loaded_count = 0
    for level in ["6", "20", "82"]:
        path = os.path.join(MODELS_DIR, f"classifier_{level}.joblib")
        if not os.path.exists(path):
            # Try alternate path
            alt = os.path.join(MODELS_DIR, f"classifier_{level}_full.joblib")
            if os.path.exists(alt):
                path = alt

        if os.path.exists(path):
            try:
                data = joblib.load(path)
                classifiers[level] = data["model"]
                label_encoders[level] = data["label_encoder"]
                n_classes = len(data["label_encoder"].classes_)
                print(f"  [OK] Level {level:2s} Classifier loaded ({n_classes} classes)")
                loaded_count += 1
            except Exception as e:
                print(f"  [FAIL] Failed to load Level {level}: {e}")
        else:
            print(f"  [FAIL] Level {level} model not found at {path}")

    models_loaded = (loaded_count > 0)
    print(f"Total ML Models Loaded: {loaded_count}/3")
    print("=" * 65)


def predict_hierarchy(features: np.ndarray) -> Dict[str, Any]:
    """Run inference across all available classification levels."""
    output = {}
    for level in ["6", "20", "82"]:
        if level in classifiers:
            clf = classifiers[level]
            le = label_encoders[level]
            pred = clf.predict(features)[0]
            proba = clf.predict_proba(features)[0]
            conf = float(np.max(proba))
            class_id = int(le.inverse_transform([pred])[0])

            if conf < THRESHOLDS.get(level, 0.3):
                class_name = "Unknown / Transition"
            elif level == "6":
                class_name = LABEL_6_NAMES.get(class_id, f"Category {class_id}")
            elif level == "20":
                class_name = LABEL_20_NAMES.get(class_id, f"Group {class_id}")
            else:
                class_name = LABEL_82_NAMES.get(class_id, f"Pose {class_id}")

            output[f"level_{level}"] = {
                "class": class_name,
                "class_id": class_id,
                "confidence": round(conf, 4),
            }
    return output


def open_camera(cam_idx: int) -> cv2.VideoCapture:
    """Open camera with DirectShow on Windows, fallback to default backend."""
    cap = cv2.VideoCapture(cam_idx, cv2.CAP_DSHOW)
    if not cap.isOpened():
        cap.release()
        cap = cv2.VideoCapture(cam_idx)
    if cap.isOpened():
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        cap.set(cv2.CAP_PROP_FPS, 30)
    return cap


def camera_loop():
    """On-demand webcam frame acquisition, MediaPipe extraction, and ML inference.
    Automatically releases the camera when idle to avoid locking hardware from other apps.
    """
    global latest_frame, current_result, last_detected_result
    global running, switch_camera_requested, target_camera_index, active_camera_index
    global camera_enabled, last_activity_time

    current_cam = active_camera_index
    camera = None

    mp_pose = mp.solutions.pose
    mp_draw = mp.solutions.drawing_utils

    with mp_pose.Pose(
        static_image_mode=False,
        model_complexity=1,
        smooth_landmarks=True,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    ) as pose_detector:
        print("[ML Service] MediaPipe Pose ready (on-demand camera mode).")

        while running:
            # Check if camera should be released (explicit release or idle timeout)
            now = time.time()
            if not camera_enabled or (now - last_activity_time > IDLE_RELEASE_TIMEOUT):
                if camera is not None:
                    if camera.isOpened():
                        camera.release()
                    camera = None
                    print("[ML Service] Camera released to standby (hardware free for other apps).")
                with result_lock:
                    current_result = {
                        "status": "camera_standby",
                        "level_6": {"class": None, "class_id": None, "confidence": 0.0},
                        "level_20": {"class": None, "class_id": None, "confidence": 0.0},
                        "level_82": {"class": None, "class_id": None, "confidence": 0.0},
                        "timestamp": now,
                        "camera": current_cam,
                    }
                time.sleep(0.3)
                continue

            # Handle dynamic camera switch request
            if switch_camera_requested:
                with camera_lock:
                    new_cam = target_camera_index
                    switch_camera_requested = False
                print(f"[ML Service] Switching camera to index {new_cam}...")
                if camera is not None and camera.isOpened():
                    camera.release()
                camera = open_camera(new_cam)
                if camera.isOpened():
                    current_cam = new_cam
                    active_camera_index = new_cam
                    print(f"[ML Service] Successfully switched to Camera {new_cam}.")
                else:
                    print(f"[ML Service] Failed to open Camera {new_cam}. Reverting to Camera {current_cam}...")
                    camera = open_camera(current_cam)

            # Ensure camera is opened if active
            if camera is None or not camera.isOpened():
                camera = open_camera(current_cam)
                if not camera.isOpened():
                    alt_cam = 1 if current_cam == 0 else 0
                    camera = open_camera(alt_cam)
                    if camera.isOpened():
                        current_cam = alt_cam
                        active_camera_index = alt_cam
                        print(f"[ML Service] Connected to fallback Camera {current_cam}.")
                    else:
                        with result_lock:
                            current_result = {
                                "status": "camera_error",
                                "level_6": {"class": None, "class_id": None, "confidence": 0.0},
                                "level_20": {"class": None, "class_id": None, "confidence": 0.0},
                                "level_82": {"class": None, "class_id": None, "confidence": 0.0},
                                "timestamp": time.time(),
                                "camera": current_cam,
                            }
                        time.sleep(1.0)
                        continue

            success, frame = camera.read()
            if not success or frame is None:
                time.sleep(0.04)
                continue

            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            rgb_frame.flags.writeable = False
            results = pose_detector.process(rgb_frame)
            rgb_frame.flags.writeable = True

            preview_frame = frame.copy()

            if results.pose_landmarks is None:
                with result_lock:
                    current_result = {
                        "status": "no_person",
                        "level_6": {"class": None, "class_id": None, "confidence": 0.0},
                        "level_20": {"class": None, "class_id": None, "confidence": 0.0},
                        "level_82": {"class": None, "class_id": None, "confidence": 0.0},
                        "timestamp": time.time(),
                        "camera": current_cam,
                    }
                cv2.putText(preview_frame, "No Person Detected", (20, 40),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 165, 255), 2)
            else:
                # Draw skeleton connections
                mp_draw.draw_landmarks(
                    preview_frame,
                    results.pose_landmarks,
                    mp_pose.POSE_CONNECTIONS,
                    mp_draw.DrawingSpec(color=(0, 255, 0), thickness=2, circle_radius=2),
                    mp_draw.DrawingSpec(color=(255, 128, 0), thickness=2)
                )

                # Extract 59-float feature vector
                features = extract_features_from_mediapipe(results.pose_landmarks)
                now = time.time()

                if features is None:
                    with result_lock:
                        current_result = {
                            "status": "full_body_not_detected",
                            "level_6": {"class": None, "class_id": None, "confidence": 0.0},
                            "level_20": {"class": None, "class_id": None, "confidence": 0.0},
                            "level_82": {"class": None, "class_id": None, "confidence": 0.0},
                            "timestamp": now,
                            "camera": current_cam,
                        }
                    cv2.putText(preview_frame, "Step Back - Full Body Needed", (20, 40),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 140, 255), 2)
                else:
                    # Run LightGBM hierarchical inference
                    preds = predict_hierarchy(features)
                    with result_lock:
                        current_result = {
                            "status": "detected",
                            "level_6": preds.get("level_6", {"class": "Unknown", "confidence": 0.0}),
                            "level_20": preds.get("level_20", {"class": "Unknown", "confidence": 0.0}),
                            "level_82": preds.get("level_82", {"class": "Unknown", "confidence": 0.0}),
                            "timestamp": now,
                            "camera": current_cam,
                        }
                        if preds.get("level_82", {}).get("confidence", 0.0) >= 0.35:
                            last_detected_result = {
                                "level_6": preds.get("level_6"),
                                "level_20": preds.get("level_20"),
                                "level_82": preds.get("level_82"),
                                "timestamp": now,
                            }

                    # Render Multi-Level HUD on Camera Frame
                    l6 = preds.get("level_6", {})
                    l20 = preds.get("level_20", {})
                    l82 = preds.get("level_82", {})

                    l82_text = f"Asana: {l82.get('class', 'Unknown')} ({l82.get('confidence', 0)*100:.1f}%)"
                    l20_text = f"Group: {l20.get('class', 'Unknown')} ({l20.get('confidence', 0)*100:.1f}%)"
                    l6_text = f"Category: {l6.get('class', 'Unknown')} ({l6.get('confidence', 0)*100:.1f}%)"

                    cv2.putText(preview_frame, l82_text, (20, 36), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 255, 0), 2)
                    cv2.putText(preview_frame, l20_text, (20, 66), cv2.FONT_HERSHEY_SIMPLEX, 0.60, (0, 230, 255), 2)
                    cv2.putText(preview_frame, l6_text, (20, 94), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 200, 100), 1)

            with frame_lock:
                latest_frame = preview_frame

            time.sleep(0.033)  # ~30 FPS

    if camera.isOpened():
        camera.release()
    print("[ML Service] Camera released.")


def generate_mjpeg_stream():
    """MJPEG streaming generator for /api/camera-preview."""
    while running:
        with frame_lock:
            frame = None if latest_frame is None else latest_frame.copy()

        if frame is None:
            time.sleep(0.04)
            continue

        ret, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        if not ret:
            continue

        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n"
            + buffer.tobytes()
            + b"\r\n"
        )
        time.sleep(0.033)


# ── HTTP API Routes ───────────────────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok" if models_loaded else "no_models",
        "service": "ML Pose Classification Service (Yoga-82 LightGBM)",
        "port": PORT,
        "camera": active_camera_index,
        "levels": list(classifiers.keys()),
        "level_counts": {
            "6": len(LABEL_6_NAMES),
            "20": len(LABEL_20_NAMES),
            "82": len(LABEL_82_NAMES),
        }
    })


@app.route("/api/pose", methods=["GET"])
def get_pose():
    mark_camera_activity()
    with result_lock:
        return jsonify({
            "current": dict(current_result),
            "last_detected": dict(last_detected_result),
            "camera": active_camera_index,
        })


@app.route("/api/camera-preview", methods=["GET"])
def camera_preview():
    mark_camera_activity()
    return Response(
        generate_mjpeg_stream(),
        mimetype="multipart/x-mixed-replace; boundary=frame"
    )


@app.route("/api/camera/acquire", methods=["GET", "POST"])
def acquire_camera():
    mark_camera_activity()
    return jsonify({
        "status": "acquired",
        "camera": active_camera_index,
    })


@app.route("/api/camera/release", methods=["GET", "POST"])
def release_camera():
    global camera_enabled, last_activity_time
    camera_enabled = False
    last_activity_time = 0.0
    return jsonify({
        "status": "released",
        "message": "Camera released to standby; other apps and browser can access webcam freely."
    })


@app.route("/api/camera/switch", methods=["GET", "POST"])
def switch_camera():
    global switch_camera_requested, target_camera_index
    mark_camera_activity()
    data = {}
    if request.is_json:
        data = request.get_json(silent=True) or {}
    cam_param = request.args.get("camera", data.get("camera", None))
    if cam_param is None:
        target_idx = 0 if active_camera_index == 1 else 1
    else:
        target_idx = int(cam_param)

    with camera_lock:
        target_camera_index = target_idx
        switch_camera_requested = True
    return jsonify({
        "status": "switching",
        "target_camera": target_camera_index,
    })


@app.route("/api/classify", methods=["POST"])
def classify_external():
    """Direct REST classification endpoint accepting 33 landmarks from client."""
    data = request.get_json(force=True, silent=True)
    if not data or "landmarks" not in data:
        return jsonify({"error": "Missing 'landmarks' array (33 points)"}), 400

    landmarks = data["landmarks"]
    features = extract_features_from_dict_list(landmarks)
    if features is None:
        return jsonify({"error": "Degenerate or invalid landmarks"}), 400

    preds = predict_hierarchy(features)
    return jsonify(preds)


# ── Service Entrypoint ────────────────────────────────────────────────────────

def start_server():
    load_classifiers()
    thread = threading.Thread(target=camera_loop, daemon=True)
    thread.start()

    print(f"\n[ML Service] Running HTTP API on http://127.0.0.1:{PORT}")
    print(f"  Health Check    : http://127.0.0.1:{PORT}/api/health")
    print(f"  Pose Inference  : http://127.0.0.1:{PORT}/api/pose")
    print(f"  Camera Preview  : http://127.0.0.1:{PORT}/api/camera-preview")
    print("=" * 65 + "\n")
    app.run(host="0.0.0.0", port=PORT, debug=False, threaded=True, use_reloader=False)


if __name__ == "__main__":
    start_server()
