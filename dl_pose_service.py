"""
YogaTwin-AI Deep Learning (DL) Pose Estimation Service.
Runs task3_video_only.keras on dedicated port 5005.

Endpoints:
- GET  /api/health           -> Service health and model info
- GET  /api/pose             -> Current real-time DL predictions
- POST /api/classify         -> Client landmark classification (Direct Browser WebCam)
- GET  /api/camera-preview   -> MJPEG stream from server-side camera
- POST /api/camera/switch    -> Switch active camera index
- POST /api/camera/acquire   -> Acquire camera for active session
- POST /api/camera/release   -> Release camera to free hardware
"""

import os
import sys
import time
import threading
from collections import deque
from typing import Dict, Any, Optional

import cv2
import mediapipe as mp
import numpy as np
import tensorflow as tf
from flask import Flask, jsonify, Response, request
from flask_cors import CORS

# ── Configuration ─────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_MODEL_PATH = r"D:\CMRG\DL\DL\models\task3_video_only.keras"
MODEL_PATH = os.environ.get("DL_MODEL_PATH", DEFAULT_MODEL_PATH)
PORT = int(os.environ.get("DL_PORT", "5005"))
CAMERA_INDEX = int(os.environ.get("CAMERA_INDEX", "0"))

SEQUENCE_LENGTH = 60
FEATURE_COUNT = 132
CONFIDENCE_THRESHOLD = 0.50
PREDICTION_EVERY_N_FRAMES = 5
FULL_BODY_VISIBILITY_THRESHOLD = 0.50
ENABLE_DEBUG_PREVIEW = True

CLASS_NAMES = [
    "Ardha Chakrasana",
    "Ardha Katichakrasana",
    "Padahastasana",
    "Parivritta Trikonasana",
    "Tadasana",
    "Trikonasana",
    "Vakrasana",
    "Vrikshasana"
]

IMPORTANT_LANDMARKS = [
    11, 12,   # shoulders
    23, 24,   # hips
    25, 26,   # knees
    27, 28    # ankles
]

# ── Flask App Setup ───────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)

# ── Model Loading ─────────────────────────────────────────────────────────────
print("=" * 65)
print("YOGATWIN-AI -- DEEP LEARNING POSE ESTIMATION SERVICE (PORT 5005)")
print("=" * 65)
print(f"Loading DL model from: {MODEL_PATH}")

model = None
try:
    model = tf.keras.models.load_model(MODEL_PATH)
    print("[DL Service] Model loaded successfully.")
    print("[DL Service] Model input shape:", model.input_shape)
except Exception as e:
    print(f"[DL Service] Warning: Failed to load model from {MODEL_PATH}: {e}")

# ── Global State & Threading ───────────────────────────────────────────────────
sequence = deque(maxlen=SEQUENCE_LENGTH)
client_sequence = deque(maxlen=SEQUENCE_LENGTH)
client_seq_lock = threading.Lock()

latest_frame = None
target_camera_index = None
camera_enabled = False
last_activity_time = 0.0
IDLE_RELEASE_TIMEOUT = 12.0

frame_lock = threading.Lock()
result_lock = threading.Lock()
running = True

current_result = {
    "pose": None,
    "confidence": 0.0,
    "status": "starting",
    "frames_collected": 0,
    "frames_required": SEQUENCE_LENGTH,
    "timestamp": time.time(),
    "probabilities": {name: 0.0 for name in CLASS_NAMES}
}

last_detected_result = {
    "pose": None,
    "confidence": 0.0,
    "timestamp": None
}

def mark_activity():
    global camera_enabled, last_activity_time
    camera_enabled = True
    last_activity_time = time.time()

def full_body_visible(results):
    if results.pose_landmarks is None:
        return False
    landmarks = results.pose_landmarks.landmark
    for idx in IMPORTANT_LANDMARKS:
        lm = landmarks[idx]
        if lm.visibility < FULL_BODY_VISIBILITY_THRESHOLD:
            return False
        if not (0.0 <= lm.x <= 1.0 and 0.0 <= lm.y <= 1.0):
            return False
    return True

def extract_features_from_mp(results):
    if results.pose_landmarks is None:
        return None
    landmarks = results.pose_landmarks.landmark
    if len(landmarks) != 33:
        return None
    features = []
    for lm in landmarks:
        features.extend([lm.x, lm.y, lm.z, lm.visibility])
    features = np.asarray(features, dtype=np.float32)
    if features.shape[0] != FEATURE_COUNT or not np.all(np.isfinite(features)):
        return None
    return features

def predict_from_sequence(seq):
    if model is None:
        return {
            "pose": "Model Offline",
            "confidence": 0.0,
            "status": "error",
            "probabilities": {name: 0.0 for name in CLASS_NAMES}
        }
    input_data = np.asarray(seq, dtype=np.float32)
    input_data = np.expand_dims(input_data, axis=0)
    probabilities = model.predict(input_data, verbose=0)[0]
    predicted_index = int(np.argmax(probabilities))
    confidence = float(probabilities[predicted_index])
    predicted_pose = CLASS_NAMES[predicted_index]

    prob_dict = {
        CLASS_NAMES[i]: round(float(probabilities[i]), 4)
        for i in range(len(CLASS_NAMES))
    }

    if confidence < CONFIDENCE_THRESHOLD:
        return {
            "pose": "Unknown / Transition",
            "confidence": round(confidence, 4),
            "status": "unknown",
            "probabilities": prob_dict
        }

    return {
        "pose": predicted_pose,
        "confidence": round(confidence, 4),
        "status": "detected",
        "probabilities": prob_dict
    }

def open_camera(cam_idx: int) -> cv2.VideoCapture:
    cap = cv2.VideoCapture(cam_idx, cv2.CAP_DSHOW)
    if not cap.isOpened():
        cap.release()
        cap = cv2.VideoCapture(cam_idx)
    if cap.isOpened():
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        cap.set(cv2.CAP_PROP_FPS, 30)
    return cap

def processing_loop():
    global latest_frame, current_result, last_detected_result
    global running, CAMERA_INDEX, target_camera_index
    global camera_enabled, last_activity_time

    camera = None
    mp_pose = mp.solutions.pose
    mp_drawing = mp.solutions.drawing_utils

    with mp_pose.Pose(
        static_image_mode=False,
        model_complexity=1,
        smooth_landmarks=True,
        enable_segmentation=False,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    ) as pose_detector:
        print("[DL Service] MediaPipe Pose ready.")
        frame_counter = 0

        while running:
            now = time.time()
            if not camera_enabled or (now - last_activity_time > IDLE_RELEASE_TIMEOUT):
                if camera is not None:
                    if camera.isOpened():
                        camera.release()
                    camera = None
                    print("[DL Service] Camera released to standby (webcam free for browser).")
                with result_lock:
                    current_result = {
                        "pose": None,
                        "confidence": 0.0,
                        "status": "camera_standby",
                        "frames_collected": 0,
                        "frames_required": SEQUENCE_LENGTH,
                        "timestamp": now,
                        "probabilities": {name: 0.0 for name in CLASS_NAMES}
                    }
                time.sleep(0.3)
                continue

            if target_camera_index is not None and target_camera_index != CAMERA_INDEX:
                print(f"[DL Service] Switching camera to {target_camera_index}...")
                if camera is not None and camera.isOpened():
                    camera.release()
                time.sleep(0.1)
                CAMERA_INDEX = target_camera_index
                target_camera_index = None
                camera = open_camera(CAMERA_INDEX)
                sequence.clear()

            if camera is None or not camera.isOpened():
                camera = open_camera(CAMERA_INDEX)
                if not camera.isOpened():
                    alt = 1 if CAMERA_INDEX == 0 else 0
                    camera = open_camera(alt)
                    if camera.isOpened():
                        CAMERA_INDEX = alt
                    else:
                        with result_lock:
                            current_result = {
                                "pose": None,
                                "confidence": 0.0,
                                "status": "camera_error",
                                "frames_collected": 0,
                                "frames_required": SEQUENCE_LENGTH,
                                "timestamp": time.time(),
                                "probabilities": {name: 0.0 for name in CLASS_NAMES}
                            }
                        time.sleep(1.0)
                        continue

            success, frame = camera.read()
            if not success or frame is None:
                time.sleep(0.04)
                continue

            frame_counter += 1
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            rgb_frame.flags.writeable = False
            results = pose_detector.process(rgb_frame)
            rgb_frame.flags.writeable = True

            preview_frame = frame.copy()
            if results.pose_landmarks is not None:
                mp_drawing.draw_landmarks(
                    preview_frame,
                    results.pose_landmarks,
                    mp_pose.POSE_CONNECTIONS,
                    mp_drawing.DrawingSpec(color=(0, 255, 0), thickness=2, circle_radius=2),
                    mp_drawing.DrawingSpec(color=(255, 128, 0), thickness=2)
                )

            with frame_lock:
                latest_frame = preview_frame

            if results.pose_landmarks is None:
                sequence.clear()
                with result_lock:
                    current_result = {
                        "pose": None,
                        "confidence": 0.0,
                        "status": "no_person",
                        "frames_collected": 0,
                        "frames_required": SEQUENCE_LENGTH,
                        "timestamp": time.time(),
                        "probabilities": {name: 0.0 for name in CLASS_NAMES}
                    }
                continue

            if not full_body_visible(results):
                sequence.clear()
                with result_lock:
                    current_result = {
                        "pose": None,
                        "confidence": 0.0,
                        "status": "full_body_not_detected",
                        "frames_collected": 0,
                        "frames_required": SEQUENCE_LENGTH,
                        "timestamp": time.time(),
                        "probabilities": {name: 0.0 for name in CLASS_NAMES}
                    }
                continue

            features = extract_features_from_mp(results)
            if features is None:
                sequence.clear()
                continue

            sequence.append(features)
            if len(sequence) < SEQUENCE_LENGTH:
                with result_lock:
                    current_result = {
                        "pose": None,
                        "confidence": 0.0,
                        "status": "collecting_frames",
                        "frames_collected": len(sequence),
                        "frames_required": SEQUENCE_LENGTH,
                        "timestamp": time.time(),
                        "probabilities": {name: 0.0 for name in CLASS_NAMES}
                    }
                continue

            if frame_counter % PREDICTION_EVERY_N_FRAMES == 0:
                prediction = predict_from_sequence(sequence)
                now = time.time()
                with result_lock:
                    current_result = {
                        **prediction,
                        "frames_collected": SEQUENCE_LENGTH,
                        "frames_required": SEQUENCE_LENGTH,
                        "timestamp": now
                    }
                    if prediction["status"] == "detected":
                        last_detected_result = {
                            "pose": prediction["pose"],
                            "confidence": prediction["confidence"],
                            "timestamp": now
                        }

    if camera is not None and camera.isOpened():
        camera.release()
    print("[DL Service] Camera released.")

def generate_preview():
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

@app.route("/")
def home():
    return jsonify({
        "service": "YogaTwin-AI DL Pose Estimation API",
        "status": "running",
        "port": PORT,
        "model": "task3_video_only",
        "classes": CLASS_NAMES,
    })

@app.route("/api/health")
def health():
    return jsonify({
        "status": "ok" if model is not None else "no_model",
        "service": "DL Pose Estimation Service (Keras Task-3)",
        "model": "task3_video_only",
        "port": PORT,
        "camera": CAMERA_INDEX,
        "sequence_length": SEQUENCE_LENGTH,
        "classes": CLASS_NAMES,
    })

@app.route("/api/pose")
def pose_result():
    mark_activity()
    with result_lock:
        return jsonify({
            "current": dict(current_result),
            "last_detected": dict(last_detected_result),
            "camera": CAMERA_INDEX,
        })

@app.route("/api/classify", methods=["POST"])
def classify_external():
    """Real-time classification of 33 landmarks from client browser camera."""
    mark_activity()
    data = request.get_json(force=True, silent=True) or {}
    landmarks = data.get("landmarks", None)
    if not landmarks or len(landmarks) < 29:
        return jsonify({"error": "Missing or insufficient landmarks"}), 400

    features = []
    for lm in landmarks:
        if isinstance(lm, dict):
            x = float(lm.get("x", 0.0))
            y = float(lm.get("y", 0.0))
            z = float(lm.get("z", 0.0))
            v = float(lm.get("visibility", lm.get("presence", 1.0)))
        elif hasattr(lm, "x"):
            x = float(lm.x)
            y = float(lm.y)
            z = float(lm.z)
            v = float(getattr(lm, "visibility", 1.0))
        elif isinstance(lm, (list, tuple)) and len(lm) >= 3:
            x, y, z = float(lm[0]), float(lm[1]), float(lm[2])
            v = float(lm[3]) if len(lm) >= 4 else 1.0
        else:
            x, y, z, v = 0.0, 0.0, 0.0, 0.0
        features.extend([x, y, z, v])

    features = np.asarray(features, dtype=np.float32)
    if features.shape[0] != FEATURE_COUNT:
        if features.shape[0] < FEATURE_COUNT:
            features = np.pad(features, (0, FEATURE_COUNT - features.shape[0]), mode='constant')
        else:
            features = features[:FEATURE_COUNT]

    if not np.all(np.isfinite(features)):
        return jsonify({"error": "Non-finite features"}), 400

    with client_seq_lock:
        client_sequence.append(features)
        cur_len = len(client_sequence)
        seq_array = list(client_sequence)
        # Pad with initial frame so prediction starts immediately
        if cur_len < SEQUENCE_LENGTH:
            seq_array = [seq_array[0]] * (SEQUENCE_LENGTH - cur_len) + seq_array

        prediction = predict_from_sequence(seq_array)
        return jsonify({
            **prediction,
            "frames_collected": cur_len,
            "frames_required": SEQUENCE_LENGTH,
            "timestamp": time.time()
        })

@app.route("/api/camera/acquire", methods=["GET", "POST"])
def acquire_camera_dl():
    mark_activity()
    return jsonify({"status": "acquired", "camera": CAMERA_INDEX})

@app.route("/api/camera/release", methods=["GET", "POST"])
def release_camera_dl():
    global camera_enabled, last_activity_time
    camera_enabled = False
    last_activity_time = 0.0
    return jsonify({"status": "released", "message": "DL camera released to standby"})

@app.route("/api/camera/switch", methods=["GET", "POST"])
def switch_camera_route():
    global target_camera_index, CAMERA_INDEX
    mark_activity()
    req_data = {}
    if request.is_json:
        req_data = request.get_json(silent=True) or {}
    cam_param = request.args.get("camera", req_data.get("camera", None))
    if cam_param is None:
        new_idx = 0 if CAMERA_INDEX == 1 else 1
    else:
        new_idx = int(cam_param)

    target_camera_index = new_idx
    print(f"[DL Service] Camera switch requested to index {new_idx}")
    return jsonify({
        "status": "ok",
        "current_camera": CAMERA_INDEX,
        "switching_to": new_idx
    })

@app.route("/api/camera-preview")
def camera_preview():
    mark_activity()
    return Response(
        generate_preview(),
        mimetype="multipart/x-mixed-replace; boundary=frame"
    )

def start_server():
    thread = threading.Thread(target=processing_loop, daemon=True)
    thread.start()

    print(f"\n[DL Service] Running HTTP API on http://127.0.0.1:{PORT}")
    print(f"  Health Check    : http://127.0.0.1:{PORT}/api/health")
    print(f"  Pose Inference  : http://127.0.0.1:{PORT}/api/pose")
    print(f"  Camera Preview  : http://127.0.0.1:{PORT}/api/camera-preview")
    print("=" * 65 + "\n")
    app.run(host="0.0.0.0", port=PORT, debug=False, threaded=True, use_reloader=False)

if __name__ == "__main__":
    start_server()
