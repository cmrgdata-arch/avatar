import React, { useEffect, useState, useRef, useCallback } from "react";
import dlPoseService from "../../services/dlPoseService";
import { usePoseWebcam } from "../../hooks/usePoseWebcam";
import "./PoseEstimation.css";

const DEFAULT_CLASSES = [
  "Ardha Chakrasana",
  "Ardha Katichakrasana",
  "Padahastasana",
  "Parivritta Trikonasana",
  "Tadasana",
  "Trikonasana",
  "Vakrasana",
  "Vrikshasana",
];

const STATUS_LABELS = {
  starting: "Initializing Camera & MediaPipe Pose...",
  detected: "Pose Confidently Detected",
  collecting_frames: "Collecting Temporal Window (60 Frames)...",
  unknown: "Transitional / Low Confidence Pose",
  no_person: "No Person Detected — Stand in Front of Camera",
  full_body_not_detected: "Step Back — Full Body Must Be Visible",
  camera_error: "Camera Error — Check Webcam Connection",
  connection_error: "DL Backend Offline — Port 5005 Unreachable",
};

const DlPoseEstimationView = ({ onBack }) => {
  const [health, setHealth] = useState({ status: "checking" });
  const [inputMode, setInputMode] = useState("browser"); // "browser" (default) or "backend"
  const [poseData, setPoseData] = useState({
    current: {
      pose: null,
      confidence: 0.0,
      status: "starting",
      frames_collected: 0,
      frames_required: 60,
      timestamp: null,
      probabilities: {},
    },
    last_detected: {
      pose: null,
      confidence: 0.0,
      timestamp: null,
    },
  });
  const [streamError, setStreamError] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const pollIntervalRef = useRef(null);

  // Check health and initialize stream
  useEffect(() => {
    let mounted = true;

    const checkServiceHealth = async () => {
      const h = await dlPoseService.checkHealth();
      if (mounted) {
        setHealth(h);
        if (h.status === "ok") {
          setStreamError(false);
        } else {
          setStreamError(true);
        }
      }
    };

    checkServiceHealth();
    const healthInterval = setInterval(checkServiceHealth, 5000);

    return () => {
      mounted = false;
      clearInterval(healthInterval);
    };
  }, []);

  // Handle classification of browser webcam landmarks
  const handleClientLandmarks = useCallback(
    async (landmarks) => {
      const result = await dlPoseService.classifyLandmarks(landmarks);
      if (!result || result.error) return;

      const hasPose = result.status === "detected";
      setPoseData((prev) => ({
        current: {
          pose: result.pose,
          confidence: result.confidence || 0,
          status: result.status,
          frames_collected: result.frames_collected || 60,
          frames_required: result.frames_required || 60,
          timestamp: result.timestamp || Date.now() / 1000,
          probabilities: result.probabilities || {},
          camera: "browser",
        },
        last_detected:
          hasPose && result.confidence >= 0.50
            ? { pose: result.pose, confidence: result.confidence, timestamp: Date.now() / 1000 }
            : prev.last_detected,
      }));
    },
    []
  );

  // Hook for browser webcam
  const {
    videoDevices,
    selectedDeviceId,
    switchCameraDevice,
    cameraActive,
    cameraError,
    personDetected,
    restartCamera,
  } = usePoseWebcam({
    videoRef,
    canvasRef,
    enabled: inputMode === "browser",
    onLandmarks: handleClientLandmarks,
    classifyIntervalMs: 140,
  });

  // Poll pose inference results for backend MJPEG mode
  useEffect(() => {
    if (inputMode !== "backend") return;

    let mounted = true;
    void dlPoseService.acquireCamera();

    const fetchPose = async () => {
      const data = await dlPoseService.getLatestPose();
      if (mounted && data) {
        setPoseData(data);
      }
    };

    fetchPose();
    pollIntervalRef.current = setInterval(fetchPose, 350);

    return () => {
      mounted = false;
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      void dlPoseService.releaseCamera();
    };
  }, [inputMode]);

  const current = poseData?.current || {};
  const lastDetected = poseData?.last_detected || {};
  const probabilities = current.probabilities || {};
  const isOnline = health?.status === "ok";

  let statusKey = current.status || (isOnline ? "starting" : "connection_error");
  if (inputMode === "browser" && !personDetected) {
    statusKey = "no_person";
  }
  const statusMessage = STATUS_LABELS[statusKey] || statusKey;

  const currentConfidencePct = Math.round((current.confidence || 0) * 100);

  return (
    <div className="dl-view-container">
      {/* Top action bar */}
      <div className="dl-top-bar">
        <button className="dl-back-btn" onClick={onBack}>
          <span>←</span> Back to Selection
        </button>

        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          {/* Mode Switcher */}
          <button
            type="button"
            className="dl-back-btn"
            style={{
              background: inputMode === "browser" ? "rgba(59, 130, 246, 0.2)" : "rgba(255, 255, 255, 0.08)",
              borderColor: inputMode === "browser" ? "rgba(59, 130, 246, 0.5)" : "rgba(255, 255, 255, 0.2)",
              color: inputMode === "browser" ? "#93c5fd" : "#cbd5e1",
              cursor: "pointer",
            }}
            onClick={() => setInputMode((prev) => (prev === "browser" ? "backend" : "browser"))}
            title="Switch between Direct Browser WebCam and Python OpenCV Stream"
          >
            {inputMode === "browser" ? "🌐 Browser WebCam (Any Port)" : "🐍 Python Stream"}
          </button>

          {/* Camera Device Dropdown for Browser Mode */}
          {inputMode === "browser" && videoDevices.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "0.82rem", color: "#94a3b8" }}>Port:</span>
              <select
                className="form-select form-select-sm"
                style={{
                  background: "rgba(15, 23, 42, 0.85)",
                  color: "#e2e8f0",
                  border: "1px solid rgba(59, 130, 246, 0.4)",
                  borderRadius: "8px",
                  padding: "6px 10px",
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  maxWidth: "220px",
                }}
                value={selectedDeviceId}
                onChange={(e) => switchCameraDevice(e.target.value)}
              >
                {videoDevices.map((dev, idx) => (
                  <option key={dev.deviceId || idx} value={dev.deviceId}>
                    {dev.label || `Camera Device ${idx + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Camera Switcher for Backend Mode */}
          {inputMode === "backend" && isOnline && (
            <button
              type="button"
              className="dl-back-btn"
              style={{
                background: "rgba(59, 130, 246, 0.25)",
                borderColor: "rgba(59, 130, 246, 0.5)",
                color: "#93c5fd",
                cursor: "pointer",
              }}
              onClick={async () => {
                const nextCam = health?.camera === 1 ? 0 : 1;
                await dlPoseService.switchCamera(nextCam);
                setTimeout(async () => {
                  const h = await dlPoseService.checkHealth();
                  setHealth(h);
                }, 400);
              }}
            >
              📷 Backend Cam {health?.camera ?? 0}
            </button>
          )}

          {/* DL Status Pill */}
          <div className={`dl-status-pill ${isOnline ? "online" : "offline"}`}>
            <span className="dl-status-dot" />
            <span>
              {isOnline ? "DL Engine (Port 5005)" : "DL Disconnected"}
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid: Video Stream + Inference Telemetry */}
      <div className="dl-main-grid">
        {/* Left: Camera Feed with Landmark Skeleton */}
        <div className="dl-card">
          <div className="dl-video-wrapper">
            {inputMode === "browser" ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="dl-video-stream"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: cameraActive ? "block" : "none",
                  }}
                />
                <canvas
                  ref={canvasRef}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    pointerEvents: "none",
                  }}
                />
                {!cameraActive && (
                  <div className="dl-stream-fallback">
                    <h4 style={{ color: "#f87171" }}>Webcam Access Notice</h4>
                    <p>{cameraError || "Waiting for camera authorization..."}</p>
                    <button
                      className="dl-back-btn mt-2"
                      style={{ background: "rgba(59, 130, 246, 0.2)", color: "#93c5fd" }}
                      onClick={restartCamera}
                    >
                      ↻ Reconnect Camera
                    </button>
                  </div>
                )}
                {cameraActive && (
                  <div className="dl-stream-overlay">
                    <span className="dl-status-dot" style={{ color: "#22c55e" }} />
                    <span>BROWSER WEBCAM (DIRECT) + MEDIAPIPE</span>
                  </div>
                )}
              </>
            ) : isOnline && !streamError ? (
              <>
                <img
                  src={dlPoseService.getCameraPreviewUrl()}
                  alt="Real-Time Pose Stream with MediaPipe Skeleton"
                  className="dl-video-stream"
                  onError={() => setStreamError(true)}
                />
                <div className="dl-stream-overlay">
                  <span className="dl-status-dot" style={{ color: "#22c55e" }} />
                  <span>PYTHON OPENCV (Cam {health?.camera ?? 1}) + SKELETON</span>
                </div>
              </>
            ) : (
              <div className="dl-stream-fallback">
                <h4>DL Inference Service Offline</h4>
                <p>The deep learning inference service is not running on port 5005.</p>
                <code>python run_dl_service.py</code>
                <p className="small text-muted mt-2">or double click <strong>start_dl_service.bat</strong></p>
                <button
                  className="dl-back-btn mt-3"
                  style={{ display: "inline-flex" }}
                  onClick={async () => {
                    const h = await dlPoseService.checkHealth();
                    setHealth(h);
                    if (h.status === "ok") setStreamError(false);
                  }}
                >
                  ↻ Retry Connection
                </button>
              </div>
            )}
          </div>

          {/* Model Specification Card */}
          <div className="dl-spec-footer">
            <div className="dl-spec-item">
              <small>Loaded Model</small>
              <strong>{health?.model || "task3_video_only.keras"}</strong>
            </div>
            <div className="dl-spec-item">
              <small>Temporal Window</small>
              <strong>{health?.sequence_length || 60} Frames (2.0s @ 30fps)</strong>
            </div>
            <div className="dl-spec-item">
              <small>Feature Vector</small>
              <strong>132 dims (33 landmarks × 4)</strong>
            </div>
          </div>
        </div>

        {/* Right: Live Inference Telemetry */}
        <div className="dl-card">
          {/* Main Detected Asana */}
          <div className="dl-result-box">
            <div className="dl-result-label">Predicted Yoga Asana</div>
            <div
              className={`dl-result-pose ${
                current.status === "detected" ? "detected" : ""
              }`}
            >
              {current.status === "detected" && current.pose
                ? current.pose
                : inputMode === "browser" && !personDetected
                ? "No Person in View"
                : current.status === "collecting_frames"
                ? "Analyzing..."
                : current.status === "unknown"
                ? "Pose In Transition"
                : "Awaiting Pose"}
            </div>

            {/* Confidence Gauge */}
            <div className="dl-confidence-row">
              <span className="small text-muted">Confidence:</span>
              <div className="dl-confidence-bar-bg">
                <div
                  className="dl-confidence-bar-fill"
                  style={{ width: `${currentConfidencePct}%` }}
                />
              </div>
              <span className="dl-confidence-val">
                {currentConfidencePct}%
              </span>
            </div>
          </div>

          {/* Status Message Banner */}
          <div className={`dl-status-banner ${statusKey}`}>
            <span>{statusMessage}</span>
            {current.status === "collecting_frames" && (
              <small>
                {current.frames_collected} / {current.frames_required || 60}
              </small>
            )}
          </div>

          {/* Last Confirmed Pose */}
          {lastDetected?.pose && (
            <div className="small text-muted mb-3 d-flex justify-content-between">
              <span>Last confirmed pose:</span>
              <strong style={{ color: "#38bdf8" }}>
                {lastDetected.pose} ({Math.round(lastDetected.confidence * 100)}%)
              </strong>
            </div>
          )}

          {/* Real Class Probabilities */}
          <div className="dl-probs-section">
            <h4>Real-Time Asana Class Probabilities</h4>
            {DEFAULT_CLASSES.map((className) => {
              const prob = probabilities[className] || 0;
              const probPct = Math.round(prob * 100);
              const isActive = current.pose === className && current.status === "detected";

              return (
                <div className="dl-prob-row" key={className}>
                  <div
                    className={`dl-prob-name ${isActive ? "active" : ""}`}
                    title={className}
                  >
                    {className}
                  </div>
                  <div className="dl-prob-track">
                    <div
                      className={`dl-prob-fill ${isActive ? "active" : ""}`}
                      style={{ width: `${probPct}%` }}
                    />
                  </div>
                  <div className={`dl-prob-score ${isActive ? "active" : ""}`}>
                    {probPct}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DlPoseEstimationView;
