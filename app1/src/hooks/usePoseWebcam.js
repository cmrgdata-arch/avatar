import { useState, useEffect, useRef, useCallback } from "react";
import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "@mediapipe/tasks-vision";

const WASM_BASE = "/assets/mediapipe/wasm";
const MODEL_PATH = "/assets/mediapipe/models/pose_landmarker_lite.task";

export function usePoseWebcam({
  videoRef,
  canvasRef,
  enabled = true,
  onLandmarks = null,
  classifyIntervalMs = 150,
}) {
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [modelReady, setModelReady] = useState(false);
  const [personDetected, setPersonDetected] = useState(false);

  const streamRef = useRef(null);
  const landmarkerRef = useRef(null);
  const drawingUtilsRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);
  const lastClassifyTimeRef = useRef(0);
  const onLandmarksRef = useRef(onLandmarks);
  onLandmarksRef.current = onLandmarks;

  // Enumerate video devices
  const updateDeviceList = useCallback(async () => {
    try {
      if (navigator.mediaDevices?.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === "videoinput");
        setVideoDevices(videoInputs);
        if (videoInputs.length > 0 && !selectedDeviceId) {
          // Default to first non-Iriun camera if possible
          const nonVirtual = videoInputs.find(
            (d) => !d.label.toLowerCase().includes("iriun")
          );
          setSelectedDeviceId(
            nonVirtual ? nonVirtual.deviceId : videoInputs[0].deviceId
          );
        }
      }
    } catch (err) {
      console.warn("Could not enumerate camera devices:", err);
    }
  }, [selectedDeviceId]);

  // Start webcam
  const startCamera = useCallback(
    async (deviceId = null) => {
      setCameraError(null);
      const targetId = deviceId || selectedDeviceId;

      // Stop previous tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      try {
        let stream = null;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: targetId
              ? { deviceId: { exact: targetId }, width: { ideal: 1280 }, height: { ideal: 720 } }
              : { width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          });
        } catch {
          // Fallback to basic video constraints
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCameraActive(true);
        void updateDeviceList();
      } catch (err) {
        console.error("Camera access error:", err);
        setCameraActive(false);
        setCameraError(
          err.name === "NotReadableError"
            ? "Camera is locked by another application. Try selecting another camera port from the dropdown."
            : err.message || "Failed to access webcam."
        );
      }
    },
    [selectedDeviceId, updateDeviceList, videoRef]
  );

  // Switch camera port/device
  const switchCameraDevice = useCallback(
    (newDeviceId) => {
      setSelectedDeviceId(newDeviceId);
      void startCamera(newDeviceId);
    },
    [startCamera]
  );

  // Initialize MediaPipe PoseLandmarker
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
        const lm = await PoseLandmarker.createFromOptions(vision, {
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
        if (!cancelled) {
          landmarkerRef.current = lm;
          setModelReady(true);
        }
      } catch (e) {
        console.warn("MediaPipe model loading warning:", e);
      }
    })();

    return () => {
      cancelled = true;
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
      }
    };
  }, []);

  // Manage camera lifecycle
  useEffect(() => {
    if (!enabled) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setCameraActive(false);
      return;
    }

    void startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setCameraActive(false);
    };
  }, [enabled, startCamera]);

  // Frame processing loop
  useEffect(() => {
    if (!enabled || !cameraActive) return;

    let rafId = 0;
    let cancelled = false;

    const loop = () => {
      if (cancelled) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const landmarker = landmarkerRef.current;

      if (!video || !canvas || !landmarker || video.readyState < 2) {
        rafId = requestAnimationFrame(loop);
        return;
      }

      // Sync canvas resolution to video
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        rafId = requestAnimationFrame(loop);
        return;
      }

      if (!drawingUtilsRef.current) {
        drawingUtilsRef.current = new DrawingUtils(ctx);
      }

      if (video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;
        let result = null;
        try {
          result = landmarker.detectForVideo(video, performance.now());
        } catch {
          // ignore detection glitch
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const landmarks = result?.landmarks?.[0];

        if (landmarks && landmarks.length >= 29) {
          setPersonDetected(true);
          const du = drawingUtilsRef.current;

          // Draw neon green skeleton connections
          du.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
            color: "#10b981",
            lineWidth: 3,
          });

          // Draw neon coral joint landmarks
          du.drawLandmarks(landmarks, {
            color: "#f43f5e",
            fillColor: "#ffffff",
            lineWidth: 2,
            radius: 4,
          });

          // Send landmarks for classification
          const now = performance.now();
          if (now - lastClassifyTimeRef.current >= classifyIntervalMs) {
            lastClassifyTimeRef.current = now;
            if (onLandmarksRef.current) {
              onLandmarksRef.current(landmarks);
            }
          }
        } else {
          setPersonDetected(false);
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [enabled, cameraActive, classifyIntervalMs, canvasRef, videoRef]);

  return {
    videoDevices,
    selectedDeviceId,
    switchCameraDevice,
    cameraActive,
    cameraError,
    modelReady,
    personDetected,
    restartCamera: () => startCamera(selectedDeviceId),
  };
}
