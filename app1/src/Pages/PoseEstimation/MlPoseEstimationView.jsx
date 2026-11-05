import React, { useEffect, useState, useRef, useCallback } from "react";
import mlPoseService from "../../services/mlPoseService";
import { usePoseWebcam } from "../../hooks/usePoseWebcam";
import "./PoseEstimation.css";

const STATUS_LABELS = {
  starting: "Initializing Camera & MediaPipe Pose...",
  detected: "Pose Confidently Classified",
  unknown: "Transitional / Low Confidence Pose",
  no_person: "No Person Detected — Stand in Front of Camera",
  full_body_not_detected: "Step Back — Full Body Must Be Visible",
  camera_error: "Camera Error — Check Webcam Connection",
  connection_error: "ML Backend Offline — Port 5006 Unreachable",
};

const MlPoseEstimationView = ({ onBack }) => {
  const [health, setHealth] = useState({ status: "checking" });
  const [inputMode, setInputMode] = useState("browser"); // "browser" (default) or "backend"
  const [poseData, setPoseData] = useState({
    current: {
      status: "starting",
      level_6: { class: null, class_id: null, confidence: 0 },
      level_20: { class: null, class_id: null, confidence: 0 },
      level_82: { class: null, class_id: null, confidence: 0 },
      timestamp: null,
      camera: 0,
    },
    last_detected: {
      level_6: null,
      level_20: null,
      level_82: null,
      timestamp: null,
    },
  });
  const [streamError, setStreamError] = useState(false);
  const [history, setHistory] = useState([]);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const pollIntervalRef = useRef(null);

  // Check backend service health
  useEffect(() => {
    let mounted = true;
    const checkServiceHealth = async () => {
      const h = await mlPoseService.checkHealth();
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
      const preds = await mlPoseService.classifyLandmarks(landmarks);
      if (!preds || preds.error) return;

      const l6 = preds.level_6 || { class: "Unknown", confidence: 0 };
      const l20 = preds.level_20 || { class: "Unknown", confidence: 0 };
      const l82 = preds.level_82 || { class: "Unknown", confidence: 0 };

      const hasDetected = l82.confidence >= 0.30;
      const status = hasDetected ? "detected" : "unknown";

      setPoseData((prev) => ({
        current: {
          status,
          level_6: l6,
          level_20: l20,
          level_82: l82,
          timestamp: Date.now() / 1000,
          camera: "browser",
        },
        last_detected:
          l82.confidence >= 0.35
            ? { level_6: l6, level_20: l20, level_82: l82, timestamp: Date.now() / 1000 }
            : prev.last_detected,
      }));

      // Update history if confident
      if (l82.class && l82.class !== "Unknown / Transition" && l82.confidence >= 0.35) {
        setHistory((prev) => {
          const last = prev[0];
          if (!last || last.name !== l82.class || Date.now() - last.time > 5000) {
            return [
              {
                name: l82.class,
                group: l20.class || "",
                category: l6.class || "",
                confidence: l82.confidence,
                timeStr: new Date().toLocaleTimeString(),
                time: Date.now(),
              },
              ...prev.slice(0, 5),
            ];
          }
          return prev;
        });
      }
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
    classifyIntervalMs: 120,
  });

  // Polling for backend MJPEG mode
  useEffect(() => {
    if (inputMode !== "backend") return;

    let mounted = true;
    void mlPoseService.acquireCamera();

    const fetchPose = async () => {
      const data = await mlPoseService.getLatestPose();
      if (mounted && data) {
        setPoseData(data);
      }
    };

    fetchPose();
    pollIntervalRef.current = setInterval(fetchPose, 350);

    return () => {
      mounted = false;
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      void mlPoseService.releaseCamera();
    };
  }, [inputMode]);

  const current = poseData?.current || {};
  const lastDetected = poseData?.last_detected || {};
  const isOnline = health?.status === "ok";

  let statusKey = current.status || (isOnline ? "starting" : "connection_error");
  if (inputMode === "browser" && !personDetected) {
    statusKey = "no_person";
  }
  const statusMessage = STATUS_LABELS[statusKey] || statusKey;

  const l6 = current.level_6 || {};
  const l20 = current.level_20 || {};
  const l82 = current.level_82 || {};

  const l82ConfidencePct = Math.round((l82.confidence || 0) * 100);
  const l20ConfidencePct = Math.round((l20.confidence || 0) * 100);
  const l6ConfidencePct = Math.round((l6.confidence || 0) * 100);

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
              background: inputMode === "browser" ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.08)",
              borderColor: inputMode === "browser" ? "rgba(16, 185, 129, 0.5)" : "rgba(255, 255, 255, 0.2)",
              color: inputMode === "browser" ? "#34d399" : "#cbd5e1",
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
                  border: "1px solid rgba(16, 185, 129, 0.4)",
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
                background: "rgba(16, 185, 129, 0.25)",
                borderColor: "rgba(16, 185, 129, 0.5)",
                color: "#6ee7b7",
                cursor: "pointer",
              }}
              onClick={async () => {
                const nextCam = health?.camera === 1 ? 0 : 1;
                await mlPoseService.switchCamera(nextCam);
                setTimeout(async () => {
                  const h = await mlPoseService.checkHealth();
                  setHealth(h);
                }, 400);
              }}
            >
              📷 Backend Cam {health?.camera ?? 0}
            </button>
          )}

          {/* ML Status Pill */}
          <div
            className={`dl-status-pill ${isOnline ? "online" : "offline"}`}
            style={{
              borderColor: isOnline ? "rgba(16, 185, 129, 0.4)" : "rgba(239, 68, 68, 0.4)",
              background: isOnline ? "rgba(6, 78, 59, 0.4)" : "rgba(127, 29, 29, 0.4)",
            }}
          >
            <span
              className="dl-status-dot"
              style={{ background: isOnline ? "#10b981" : "#ef4444" }}
            />
            <span style={{ color: isOnline ? "#6ee7b7" : "#fca5a5" }}>
              {isOnline ? "ML LightGBM (Port 5006)" : "ML Disconnected"}
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
                      style={{ background: "rgba(16, 185, 129, 0.2)", color: "#34d399" }}
                      onClick={restartCamera}
                    >
                      ↻ Reconnect Camera
                    </button>
                  </div>
                )}
                {cameraActive && (
                  <div
                    className="dl-stream-overlay"
                    style={{
                      background: "rgba(6, 78, 59, 0.8)",
                      borderColor: "rgba(16, 185, 129, 0.4)",
                    }}
                  >
                    <span className="dl-status-dot" style={{ background: "#10b981" }} />
                    <span>BROWSER WEBCAM (DIRECT) + 59-D GEOMETRY</span>
                  </div>
                )}
              </>
            ) : isOnline && !streamError ? (
              <>
                <img
                  src={mlPoseService.getCameraPreviewUrl()}
                  alt="Real-Time ML Pose Stream with 15-Joint Skeleton"
                  className="dl-video-stream"
                  onError={() => setStreamError(true)}
                />
                <div
                  className="dl-stream-overlay"
                  style={{
                    background: "rgba(6, 78, 59, 0.8)",
                    borderColor: "rgba(16, 185, 129, 0.4)",
                  }}
                >
                  <span className="dl-status-dot" style={{ background: "#10b981" }} />
                  <span>PYTHON OPENCV (Cam {health?.camera ?? 0}) + 59-D GEOMETRY</span>
                </div>
              </>
            ) : (
              <div className="dl-stream-fallback">
                <h4 style={{ color: "#34d399" }}>ML Classification Service Offline</h4>
                <p>The LightGBM pose classification service is not running on port 5006.</p>
                <code>python run_ml_service.py</code>
                <p className="small text-muted mt-2">
                  or double click <strong>start_ml_service.bat</strong>
                </p>
              </div>
            )}
          </div>

          {/* Model Specification Card */}
          <div className="dl-spec-footer">
            <div className="dl-spec-item">
              <small>Hierarchy Levels</small>
              <strong style={{ color: "#34d399" }}>3 Levels (6 / 20 / 82 classes)</strong>
            </div>
            <div className="dl-spec-item">
              <small>Feature Vector</small>
              <strong>59 Floats (39 Coords + 7 Angles + 13 Distances)</strong>
            </div>
            <div className="dl-spec-item">
              <small>Classifiers</small>
              <strong>LightGBM Boosted Trees (Sub-3ms Latency)</strong>
            </div>
          </div>
        </div>

        {/* Right: Live Hierarchical Inference Telemetry */}
        <div className="dl-card">
          {/* Main Detected Asana (Level 82) */}
          <div
            className="dl-result-box"
            style={{
              background: "linear-gradient(135deg, rgba(6, 78, 59, 0.35) 0%, rgba(15, 23, 42, 0.8) 100%)",
              borderColor: "rgba(16, 185, 129, 0.35)",
            }}
          >
            <div
              className="dl-result-label"
              style={{ color: "#6ee7b7", textTransform: "uppercase", letterSpacing: "0.08em" }}
            >
              Level 3: Individual Asana (82 Classes)
            </div>
            <div
              className={`dl-result-pose ${current.status === "detected" ? "detected" : ""}`}
              style={{ color: l82.class ? "#34d399" : "#ffffff" }}
            >
              {current.status === "detected" && l82.class && l82.class !== "Unknown / Transition"
                ? l82.class
                : inputMode === "browser" && !personDetected
                ? "No Person in View"
                : current.status === "full_body_not_detected"
                ? "Step Back — Full Body Needed"
                : current.status === "no_person"
                ? "No Person in View"
                : "Evaluating Posture..."}
            </div>

            {/* Confidence Gauge */}
            <div className="dl-confidence-row">
              <span className="small text-muted">Asana Confidence:</span>
              <div className="dl-confidence-bar-bg">
                <div
                  className="dl-confidence-bar-fill"
                  style={{
                    width: `${l82ConfidencePct}%`,
                    background: "linear-gradient(90deg, #10b981, #34d399)",
                  }}
                />
              </div>
              <span className="dl-confidence-val" style={{ color: "#34d399" }}>
                {l82ConfidencePct}%
              </span>
            </div>
          </div>

          {/* Level 2: Pose Group (20 Classes) */}
          <div
            style={{
              background: "rgba(15, 23, 42, 0.6)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "14px",
              padding: "16px 20px",
              marginBottom: "16px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontSize: "0.82rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
                Level 2: Pose Group (20 Classes)
              </span>
              <span style={{ fontSize: "0.9rem", color: "#38bdf8", fontWeight: 700 }}>
                {l20ConfidencePct}%
              </span>
            </div>
            <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#e2e8f0", marginBottom: "8px" }}>
              {l20.class || "—"}
            </div>
            <div className="dl-confidence-bar-bg" style={{ height: "6px" }}>
              <div
                className="dl-confidence-bar-fill"
                style={{
                  width: `${l20ConfidencePct}%`,
                  background: "linear-gradient(90deg, #38bdf8, #60a5fa)",
                }}
              />
            </div>
          </div>

          {/* Level 1: Broad Category (6 Classes) */}
          <div
            style={{
              background: "rgba(15, 23, 42, 0.6)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "14px",
              padding: "16px 20px",
              marginBottom: "16px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontSize: "0.82rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
                Level 1: Broad Category (6 Classes)
              </span>
              <span style={{ fontSize: "0.9rem", color: "#fbbf24", fontWeight: 700 }}>
                {l6ConfidencePct}%
              </span>
            </div>
            <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#e2e8f0", marginBottom: "8px" }}>
              {l6.class || "—"}
            </div>
            <div className="dl-confidence-bar-bg" style={{ height: "6px" }}>
              <div
                className="dl-confidence-bar-fill"
                style={{
                  width: `${l6ConfidencePct}%`,
                  background: "linear-gradient(90deg, #f59e0b, #fbbf24)",
                }}
              />
            </div>
          </div>

          {/* Status Message Banner */}
          <div className={`dl-status-banner ${statusKey}`}>
            <span>{statusMessage}</span>
          </div>

          {/* Last Confirmed Pose */}
          {lastDetected?.level_82?.class && (
            <div className="small text-muted mb-3 d-flex justify-content-between">
              <span>Last confirmed asana:</span>
              <strong style={{ color: "#34d399" }}>
                {lastDetected.level_82.class} ({Math.round(lastDetected.level_82.confidence * 100)}%)
              </strong>
            </div>
          )}

          {/* Recent Detection History */}
          <div className="dl-probs-section" style={{ maxHeight: "200px" }}>
            <h4>Recent Classified Asanas</h4>
            {history.length === 0 ? (
              <p className="small text-muted" style={{ margin: "10px 0" }}>
                Classified asanas will appear here as you practice in front of the camera.
              </p>
            ) : (
              history.map((item, idx) => (
                <div
                  className="dl-prob-row"
                  key={idx}
                  style={{ gridTemplateColumns: "1.5fr 1fr auto" }}
                >
                  <div className="dl-prob-name" style={{ color: "#ffffff", fontWeight: 600 }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {item.group}
                  </div>
                  <div className="dl-prob-score" style={{ color: "#34d399" }}>
                    {Math.round(item.confidence * 100)}%
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MlPoseEstimationView;
