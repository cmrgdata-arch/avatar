import { useEffect, useRef, useState } from "react";
import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "@mediapipe/tasks-vision";
import {
  classifyLiveAsana,
  computeEightAngles,
  diffCompareAngle,
  getCorrections,
  minJointVisibility,
  POSE_LM,
} from "../utils/practicePoseAnalysis";
import { getTargetAnglesForPoseName } from "../data/practicePoseTargets";

const WASM_BASE = "/assets/mediapipe/wasm";
const MODEL_PATH = "/assets/mediapipe/models/pose_landmarker_lite.task";

const CORE_INDICES = [
  POSE_LM.LEFT_SHOULDER,
  POSE_LM.RIGHT_SHOULDER,
  POSE_LM.LEFT_HIP,
  POSE_LM.RIGHT_HIP,
];

const UI_UPDATE_MS = 120;

function syncCanvasToVideo(canvas, video) {
  if (!canvas || !video || !video.videoWidth) return;
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const rw = video.getBoundingClientRect().width;
  const rh = video.getBoundingClientRect().height;
  const sw = `${rw}px`;
  const sh = `${rh}px`;
  if (canvas.style.width !== sw) canvas.style.width = sw;
  if (canvas.style.height !== sh) canvas.style.height = sh;
}

/**
 * Loads MediaPipe PoseLandmarker, draws skeleton on canvas, updates practice context (throttled).
 * Callbacks are stored in refs so React state updates never reinitialize PoseLandmarker.
 */
export function usePracticePoseDetection({
  videoRef,
  canvasRef,
  enabled,
  practicePoseName,
  setDetectedPose,
  setConfidence,
  setCorrections,
  onRawLandmarks,
}) {
  const [mediapipeError, setMediapipeError] = useState(null);
  const lastVideoTimeRef = useRef(-1);
  const lastTimestampMsRef = useRef(0);
  const lastUiUpdateRef = useRef(0);
  const practicePoseNameRef = useRef(practicePoseName);
  const onRawLandmarksRef = useRef(onRawLandmarks);
  const setDetectedPoseRef = useRef(setDetectedPose);
  const setConfidenceRef = useRef(setConfidence);
  const setCorrectionsRef = useRef(setCorrections);

  practicePoseNameRef.current = practicePoseName;
  onRawLandmarksRef.current = onRawLandmarks;
  setDetectedPoseRef.current = setDetectedPose;
  setConfidenceRef.current = setConfidence;
  setCorrectionsRef.current = setCorrections;

  useEffect(() => {
    if (!enabled) {
      setMediapipeError(null);
      return undefined;
    }

    let cancelled = false;
    let landmarker = null;
    let rafId = 0;
    let drawingUtils = null;
    let lastValidLandmarks = null;
    let lastValidTs = 0;

    (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
        landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_PATH,
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      } catch (e) {
        if (!cancelled) {
          setMediapipeError(
            e?.message ||
              "Could not load pose model. Check your network and try again."
          );
        }
        return;
      }

      if (cancelled) {
        landmarker?.close();
        return;
      }

      setMediapipeError(null);

      const loop = () => {
        if (cancelled) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!landmarker || !video || !canvas) {
          rafId = requestAnimationFrame(loop);
          return;
        }

        if (video.readyState < 2 || video.videoWidth <= 0) {
          rafId = requestAnimationFrame(loop);
          return;
        }

        syncCanvasToVideo(canvas, video);

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          rafId = requestAnimationFrame(loop);
          return;
        }

        if (!drawingUtils) {
          drawingUtils = new DrawingUtils(ctx);
        }

        if (video.currentTime === lastVideoTimeRef.current) {
          rafId = requestAnimationFrame(loop);
          return;
        }
        lastVideoTimeRef.current = video.currentTime;

        // Enforce strictly monotonic integer timestamp for MediaPipe PoseLandmarker
        const now = performance.now();
        const ts = Math.max(
          lastTimestampMsRef.current + 1,
          Math.floor(now)
        );
        lastTimestampMsRef.current = ts;

        let result;
        try {
          result = landmarker.detectForVideo(video, ts);
        } catch {
          rafId = requestAnimationFrame(loop);
          return;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const landmarks = result?.landmarks?.[0];
        const worldLandmarks = result?.worldLandmarks?.[0] || null;

        if (
          landmarks &&
          minJointVisibility(landmarks, CORE_INDICES) >= 0.35
        ) {
          lastValidLandmarks = landmarks;
          lastValidTs = now;

          if (typeof onRawLandmarksRef.current === "function") {
            onRawLandmarksRef.current(landmarks, worldLandmarks);
          }

          drawingUtils.drawConnectors(
            landmarks,
            PoseLandmarker.POSE_CONNECTIONS,
            { color: "#00c853", lineWidth: 4 }
          );
          drawingUtils.drawLandmarks(landmarks, {
            color: "#ff1744",
            lineWidth: 2,
            radius: 5,
          });

          const angles = computeEightAngles(landmarks);
          const tAngles = getTargetAnglesForPoseName(
            practicePoseNameRef.current,
            angles
          );
          const corrections = tAngles ? getCorrections(angles, tAngles) : [];
          const aScore = tAngles ? diffCompareAngle(angles, tAngles) : 0.5;
          const conf = Math.round(
            Math.max(0, Math.min(100, (1 - aScore) * 100))
          );
          const liveClass = classifyLiveAsana(landmarks, angles);

          if (now - lastUiUpdateRef.current >= UI_UPDATE_MS) {
            lastUiUpdateRef.current = now;
            setCorrectionsRef.current?.(corrections);
            setConfidenceRef.current?.(conf);
            setDetectedPoseRef.current?.(liveClass.detectedPose);
          }
        } else {
          // Short 160ms anti-blink overlay persistence for single missed frame
          if (lastValidLandmarks && now - lastValidTs <= 160) {
            drawingUtils.drawConnectors(
              lastValidLandmarks,
              PoseLandmarker.POSE_CONNECTIONS,
              { color: "#00c853", lineWidth: 4 }
            );
            drawingUtils.drawLandmarks(lastValidLandmarks, {
              color: "#ff1744",
              lineWidth: 2,
              radius: 5,
            });
          } else {
            lastValidLandmarks = null;
            if (typeof onRawLandmarksRef.current === "function") {
              onRawLandmarksRef.current(null, null);
            }
            if (now - lastUiUpdateRef.current >= UI_UPDATE_MS) {
              lastUiUpdateRef.current = now;
              setDetectedPoseRef.current?.("—");
              setConfidenceRef.current?.(0);
              setCorrectionsRef.current?.([
                "Position your full body inside the camera frame",
              ]);
            }
          }
        }

        rafId = requestAnimationFrame(loop);
      };

      rafId = requestAnimationFrame(loop);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      lastVideoTimeRef.current = -1;
      landmarker?.close();
      landmarker = null;
      drawingUtils = null;
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
  }, [enabled, videoRef, canvasRef]);

  return { mediapipeError };
}
