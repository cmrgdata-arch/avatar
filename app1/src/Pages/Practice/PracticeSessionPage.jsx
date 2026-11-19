import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { usePractice } from "../../context/PracticeContext";
import { usePracticePoseDetection } from "../../hooks/usePracticePoseDetection";
import { useCorrectionEngine, CORRECTION_STATUS } from "../../hooks/useCorrectionEngine";
import {
  useSessionTrackingState,
  SESSION_STATE,
} from "../../hooks/useSessionTrackingState";
import TwinViewer from "../../Components/twins/TwinViewer";
import { startRecording, stopRecording } from "../../utils/recorder";
import { createSessionZip } from "../../utils/sessionExport";
import { checkRecorderHealth } from "../../utils/sessionRecorderApi";
import { getPoseMessages } from "../../data/poseMessages";
import PoseInstructionDialog from "../../Components/PoseInstructionDialog";
import { useCorrectiveTts } from "../../hooks/useCorrectiveTts";
import mlPoseService from "../../services/mlPoseService";
import dlPoseService from "../../services/dlPoseService";
import "./PracticeSessionPage.css";

const MAX_RECORDING_SECONDS = 180;

const CORRECTION_STATUS_META = {
  idle: { label: "Ready — Press Start Recording", cls: "is-detecting" },
  detecting: { label: "Detecting Pose", cls: "is-detecting" },
  good_form: { label: "Good Form", cls: "is-good" },
  adjust: { label: "Adjust Your Posture", cls: "is-adjust" },
  not_detected: { label: "Pose Not Detected", cls: "is-nodetect" },
  unavailable: { label: "Active Angle Analysis", cls: "is-detecting" },
  error: { label: "Correction Offline", cls: "is-error" },
};

const PracticeSessionPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const pose = location.state?.pose;
  const { currentUser } = useAuth();

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const countdownRef = useRef(null);
  const recordingRef = useRef(null);
  const elapsedRef = useRef(0);

  // Live landmark refs for 60fps TwinViewer consumption
  const liveLandmarksRef = useRef(null);
  const liveWorldLandmarksRef = useRef(null);

  const {
    setSelectedPose,
    detectedPose,
    confidence,
    corrections,
    setIsSessionActive,
    setDetectedPose,
    setConfidence,
    setCorrections,
  } = usePractice();

  const [cameraError, setCameraError] = useState(null);
  const [sessionPhase, setSessionPhase] = useState("idle");
  const [countdownValue, setCountdownValue] = useState(3);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [recordingData, setRecordingData] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [backendReady, setBackendReady] = useState(false);
  const [instructionPhase, setInstructionPhase] = useState(null);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [releasingServices, setReleasingServices] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  const userGender = useMemo(() => currentUser?.gender || null, [currentUser?.gender]);

  // Central Session & Full-Body Tracking State Machine (Single Source of Truth)
  const isActivelyRecording =
    !cameraError && Boolean(pose) && sessionPhase === "recording";

  const {
    sessionState,
    isRecording,
    isFullBodyDetected,
    isTrackingStable,
    isMirroringEnabled,
    isFeedbackEnabled,
    isVoiceEnabled,
    statusMessage: trackingStatusMessage,
    processFrame: processTrackingFrame,
    markSessionStopped,
    reset: resetTrackingState,
  } = useSessionTrackingState({
    isRecording: isActivelyRecording,
    voiceEnabled,
  });

  const isFeedbackEnabledRef = useRef(isFeedbackEnabled);
  isFeedbackEnabledRef.current = isFeedbackEnabled;

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const playBuzzer = useCallback(() => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.4);
    } catch (e) {
      console.warn("Buzzer sound failed:", e);
    }
  }, []);

  const {
    pushLandmarks,
    status: correctionStatus,
    supported: correctionSupported,
    engineOnline,
    matchConfidence,
    feedback: correctionFeedback,
    corrections: engineCorrections,
    stepText: correctionStepText,
    idealLandmarks,
    targetAngles,
    liveAngles,
    descriptorDeviations,
    ytAngleScore,
    ollamaCoaching,
    ageGroup,
    asanaReference,
  } = useCorrectionEngine({
    active: isFeedbackEnabled,
    appPoseName: pose?.name || "",
    poseId: pose?.id || null,
    trackingState: sessionState,
    currentStepIndex: 0,
    age: currentUser?.age ?? null,
    userName: currentUser?.full_name || currentUser?.username,
  });

  const engineUsable =
    isFeedbackEnabled &&
    correctionSupported &&
    engineOnline &&
    correctionStatus !== CORRECTION_STATUS.ERROR;

  const shownCorrections = useMemo(() => {
    if (!isFeedbackEnabled) return [];
    if (engineUsable && engineCorrections?.length > 0) return engineCorrections;
    return corrections || [];
  }, [isFeedbackEnabled, engineUsable, engineCorrections, corrections]);

  const twinCorrectionState = useMemo(
    () => ({
      appPoseName: pose?.name || "",
      poseId: pose?.id || null,
      status: !isFeedbackEnabled
        ? CORRECTION_STATUS.IDLE
        : engineUsable
        ? correctionStatus
        : shownCorrections.length > 0
        ? CORRECTION_STATUS.ADJUST
        : CORRECTION_STATUS.GOOD_FORM,
      supported: correctionSupported,
      engineOnline,
      matchConfidence: isFeedbackEnabled ? matchConfidence : null,
      feedback: isFeedbackEnabled ? correctionFeedback : null,
      corrections: shownCorrections,
      stepText: isFeedbackEnabled ? correctionStepText : null,
      idealLandmarks: isFeedbackEnabled ? idealLandmarks : null,
      targetAngles: isFeedbackEnabled ? targetAngles : null,
      liveAngles: isFeedbackEnabled ? liveAngles : null,
      descriptorDeviations: isFeedbackEnabled ? descriptorDeviations : null,
      ytAngleScore: isFeedbackEnabled ? ytAngleScore : null,
      ollamaCoaching: isFeedbackEnabled ? ollamaCoaching : null,
    }),
    [
      pose?.name,
      pose?.id,
      isFeedbackEnabled,
      engineUsable,
      correctionStatus,
      shownCorrections,
      correctionSupported,
      engineOnline,
      matchConfidence,
      correctionFeedback,
      correctionStepText,
      idealLandmarks,
      targetAngles,
      liveAngles,
      descriptorDeviations,
      ytAngleScore,
      ollamaCoaching,
    ]
  );

  // Text-To-Speech (TTS) Voice Output — strictly active ONLY when isVoiceEnabled is true
  const currentTtsFeedback = useMemo(() => {
    if (!isVoiceEnabled) return null;
    if (engineUsable && correctionStatus === CORRECTION_STATUS.GOOD_FORM) {
      return correctionFeedback || "Looking good, hold the position";
    }
    if (shownCorrections && shownCorrections.length > 0) {
      return shownCorrections;
    }
    return correctionFeedback || null;
  }, [
    isVoiceEnabled,
    engineUsable,
    correctionStatus,
    correctionFeedback,
    shownCorrections,
  ]);

  const { stop: stopVoiceTts } = useCorrectiveTts({
    active: isVoiceEnabled,
    feedback: currentTtsFeedback,
  });

  useEffect(() => {
    if (!isFeedbackEnabled) {
      setDetectedPose("—");
      setConfidence(0);
      setCorrections([]);
    }
    if (!isVoiceEnabled) {
      stopVoiceTts();
    }
  }, [isFeedbackEnabled, isVoiceEnabled, setDetectedPose, setConfidence, setCorrections, stopVoiceTts]);

  const finalizeRecording = useCallback(
    async (reason = "manual") => {
      window.clearInterval(timerRef.current);
      window.clearInterval(countdownRef.current);
      timerRef.current = null;
      countdownRef.current = null;
      stopVoiceTts();
      markSessionStopped();
      liveLandmarksRef.current = null;
      liveWorldLandmarksRef.current = null;
      setIsSessionActive(false);

      const duration = Math.max(1, elapsedRef.current || 1);
      let videoBlob = null;
      let storedOffline = false;

      if (recordingRef.current) {
        const result = await stopRecording({
          poseId: pose?.id,
          poseName: pose?.name,
          persistOffline: false,
        });
        videoBlob = result.videoBlob;
        storedOffline = result.storedOffline;
        recordingRef.current = null;
      }

      const entry = {
        poseId: pose.id,
        poseName: pose.name,
        sanskrit: pose.sanskrit,
        category: pose.category || "general",
        variation: pose.variation || "",
        videoBlob: storedOffline ? null : videoBlob,
        imuPackets: [],
        landmarks: [],
        storedOffline: Boolean(storedOffline),
        recordedAt: new Date().toISOString(),
        duration,
        skipped: false,
      };

      setRecordingData(entry);
      setSessionPhase("done");
      if (getPoseMessages(pose)?.after?.length) {
        setInstructionPhase("after");
      }
      stopCamera();

      if (reason === "timeout" || reason === "manual") {
        setDetectedPose("—");
        setConfidence(0);
        setCorrections([]);
      }
    },
    [
      pose,
      stopVoiceTts,
      markSessionStopped,
      setConfidence,
      setCorrections,
      setDetectedPose,
      setIsSessionActive,
      stopCamera,
    ]
  );

  const stopSession = useCallback(
    (reason = "manual") => {
      void finalizeRecording(reason);
    },
    [finalizeRecording]
  );

  const startRecordingTimer = useCallback(() => {
    elapsedRef.current = 0;
    timerRef.current = window.setInterval(() => {
      elapsedRef.current += 1;
      setElapsedSeconds(elapsedRef.current);
      if (elapsedRef.current >= MAX_RECORDING_SECONDS) {
        void finalizeRecording("timeout");
      }
    }, 1000);
  }, [finalizeRecording]);

  const initCamera = useCallback(
    async (forcedDeviceId = null) => {
      try {
        void mlPoseService.releaseCamera();
        void dlPoseService.releaseCamera();

        let devices = [];
        try {
          if (navigator.mediaDevices?.enumerateDevices) {
            const allDevs = await navigator.mediaDevices.enumerateDevices();
            devices = allDevs.filter((d) => d.kind === "videoinput");
            setVideoDevices(devices);
          }
        } catch (devErr) {
          console.warn("Could not enumerate camera devices:", devErr);
        }

        const activeDevId =
          forcedDeviceId || selectedDeviceId || (devices[0]?.deviceId || undefined);

        let stream = null;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: activeDevId
              ? {
                  deviceId: { exact: activeDevId },
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                }
              : { width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          });
        } catch {
          if (devices.length > 1) {
            for (const dev of devices) {
              if (dev.deviceId && dev.deviceId !== activeDevId) {
                try {
                  stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                      deviceId: { exact: dev.deviceId },
                      width: { ideal: 1280 },
                      height: { ideal: 720 },
                    },
                    audio: false,
                  });
                  setSelectedDeviceId(dev.deviceId);
                  break;
                } catch {
                  continue;
                }
              }
            }
          }
          if (!stream) {
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
          }
        }

        streamRef.current = stream;
        setCameraError(null);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        return stream;
      } catch (e) {
        const isDeviceInUse =
          e?.name === "NotReadableError" ||
          String(e?.message || "").toLowerCase().includes("in use");
        const errorMsg = isDeviceInUse
          ? "Device in use: Your webcam is locked by another process or background service. Click 'Release & Reconnect' below to free the camera."
          : e?.message ||
            "Camera access was denied or is unavailable. Allow camera permission to practice.";
        setCameraError(errorMsg);
        setSessionPhase("idle");
        setIsSessionActive(false);
        window.clearInterval(countdownRef.current);
        countdownRef.current = null;
        return null;
      }
    },
    [selectedDeviceId, setIsSessionActive]
  );

  const handleReleaseAndRetry = useCallback(async () => {
    setReleasingServices(true);
    setCameraError(null);
    try {
      await mlPoseService.releaseCamera();
      await dlPoseService.releaseCamera();
    } catch (err) {
      console.warn("Camera release call:", err);
    }
    setTimeout(() => {
      setReleasingServices(false);
      void initCamera();
    }, 600);
  }, [initCamera]);

  const beginRecording = useCallback(async () => {
    if (!pose || sessionPhase !== "idle") return;

    setCameraError(null);
    setSaveStatus(null);
    setRecordingData(null);
    setSessionPhase("countdown");
    setCountdownValue(3);
    setDetectedPose(null);
    setConfidence(0);
    setCorrections([]);

    const stream = streamRef.current || (await initCamera());
    if (!stream) {
      setSessionPhase("idle");
      return;
    }

    let count = 3;
    countdownRef.current = window.setInterval(() => {
      count -= 1;
      setCountdownValue(count);
      if (count <= 0) {
        window.clearInterval(countdownRef.current);
        countdownRef.current = null;
        playBuzzer();

        void (async () => {
          startRecording(stream, { persistOffline: false });
          recordingRef.current = true;
          setIsSessionActive(true);
          setSessionPhase("recording");
          elapsedRef.current = 0;
          setElapsedSeconds(0);
          startRecordingTimer();
        })();
      }
    }, 1000);
  }, [
    pose,
    sessionPhase,
    setCorrections,
    setConfidence,
    setDetectedPose,
    setIsSessionActive,
    initCamera,
    playBuzzer,
    startRecordingTimer,
  ]);

  const handleStartRecording = useCallback(() => {
    if (getPoseMessages(pose)?.before?.length) {
      setInstructionPhase("before");
      return;
    }
    void beginRecording();
  }, [beginRecording, pose]);

  useEffect(() => {
    if (!pose) {
      navigate("/practice", { replace: true });
    }
  }, [pose, navigate]);

  useEffect(() => {
    if (!pose) return;

    resetTrackingState();
    setSelectedPose(pose);
    setDetectedPose(null);
    setConfidence(0);
    setCorrections([]);

    void initCamera();

    let cancelled = false;
    (async () => {
      const ok = await checkRecorderHealth();
      if (cancelled) return;
      setBackendReady(ok);
    })();

    return () => {
      cancelled = true;
      stopVoiceTts();
      stopCamera();
      setIsSessionActive(false);
      setSelectedPose(null);
      setDetectedPose(null);
      setConfidence(0);
      setCorrections([]);
      window.clearInterval(timerRef.current);
      window.clearInterval(countdownRef.current);
    };
  }, [
    pose,
    resetTrackingState,
    stopVoiceTts,
    setSelectedPose,
    setIsSessionActive,
    setDetectedPose,
    setConfidence,
    setCorrections,
    initCamera,
    stopCamera,
  ]);

  const poseDetectionEnabled =
    !cameraError && !!pose && (sessionPhase === "recording" || sessionPhase === "idle");

  const handleRawLandmarks = useCallback(
    (landmarks, worldLandmarks) => {
      const snap = processTrackingFrame(landmarks, worldLandmarks);
      if (snap.isMirroringEnabled && landmarks) {
        liveLandmarksRef.current = landmarks;
        liveWorldLandmarksRef.current = worldLandmarks || null;
      } else {
        liveLandmarksRef.current = null;
        liveWorldLandmarksRef.current = null;
      }

      if (snap.isFeedbackEnabled && landmarks) {
        pushLandmarks(landmarks);
      }
    },
    [processTrackingFrame, pushLandmarks]
  );

  const handleSetCorrections = useCallback(
    (newCorrections) => {
      if (isFeedbackEnabledRef.current) {
        setCorrections(newCorrections);
      } else {
        setCorrections([]);
      }
    },
    [setCorrections]
  );

  const handleSetConfidence = useCallback(
    (conf) => {
      if (isFeedbackEnabledRef.current) {
        setConfidence(conf);
      } else {
        setConfidence(0);
      }
    },
    [setConfidence]
  );

  const handleSetDetectedPose = useCallback(
    (detected) => {
      if (isFeedbackEnabledRef.current) {
        setDetectedPose(detected);
      } else {
        setDetectedPose("—");
      }
    },
    [setDetectedPose]
  );

  const { mediapipeError } = usePracticePoseDetection({
    videoRef,
    canvasRef,
    enabled: poseDetectionEnabled,
    practicePoseName: pose?.name ?? "",
    setDetectedPose: handleSetDetectedPose,
    setConfidence: handleSetConfidence,
    setCorrections: handleSetCorrections,
    onRawLandmarks: handleRawLandmarks,
  });

  const remaining = Math.max(0, MAX_RECORDING_SECONDS - elapsedSeconds);
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const timeDisplay = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const progressPercent = (elapsedSeconds / MAX_RECORDING_SECONDS) * 100;

  const handleDownload = async () => {
    if (!recordingData) return;
    setSaving(true);
    setSaveStatus(null);
    try {
      const { zipBlob, zipFileName } = await createSessionZip(
        recordingData,
        { username: "practice_user", sessionNumber: 1 },
        `practice_${Date.now()}`
      );
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = zipFileName;
      a.click();
      URL.revokeObjectURL(url);
      setSaveStatus({ ok: true, message: "Download started." });
    } catch (err) {
      setSaveStatus({ ok: false, message: err?.message || "Download failed." });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveToDevice = async () => {
    if (!recordingData) return;
    setSaving(true);
    setSaveStatus(null);
    try {
      const dirHandle = await window.showDirectoryPicker({
        mode: "readwrite",
        startIn: "downloads",
      });
      const { zipBlob, zipFileName } = await createSessionZip(
        recordingData,
        { username: "practice_user", sessionNumber: 1 },
        `practice_${Date.now()}`
      );
      const fileHandle = await dirHandle.getFileHandle(zipFileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(zipBlob);
      await writable.close();
      setSaveStatus({ ok: true, message: `Saved to device as ${zipFileName}` });
    } catch (err) {
      if (err?.name === "AbortError") {
        setSaveStatus({ ok: false, message: "Save cancelled." });
      } else {
        setSaveStatus({ ok: false, message: err?.message || "Save failed." });
      }
    } finally {
      setSaving(false);
    }
  };

  if (!pose) {
    return null;
  }

  const confidencePct = !isFeedbackEnabled
    ? 0
    : engineUsable && matchConfidence != null
    ? Math.round(matchConfidence * 100)
    : Math.round(typeof confidence === "number" ? confidence : 0);
  const poseMessages = getPoseMessages(pose);
  const meta = !isRecording
    ? {
        label:
          isFullBodyDetected && isTrackingStable
            ? "Ready — Press Start Recording"
            : "Position Full Body in Frame",
        cls: "is-detecting",
      }
    : sessionState === SESSION_STATE.RECORDING_TRACKING_LOST || !isFeedbackEnabled
    ? {
        label: "Full Body Not Detected",
        cls: "is-nodetect",
      }
    : CORRECTION_STATUS_META[twinCorrectionState.status] ||
      CORRECTION_STATUS_META.detecting;

  return (
    <div className="twin-trainer-workspace">
      {instructionPhase && (
        <PoseInstructionDialog
          pose={pose}
          phase={instructionPhase}
          messages={poseMessages?.[instructionPhase]}
          onContinue={() => {
            if (instructionPhase === "before") {
              setInstructionPhase(null);
              void beginRecording();
              return;
            }
            setInstructionPhase(null);
          }}
        />
      )}

      {/* Top Bar */}
      <div className="twin-trainer-topbar">
        <div className="twin-trainer-topbar__left">
          <button
            type="button"
            className="btn btn-sm btn-outline-info"
            onClick={() => {
              stopVoiceTts();
              markSessionStopped();
              navigate("/practice");
            }}
          >
            ← Exit Practice
          </button>
          <h1 className="twin-trainer-brand">CMRG Yoga Twin Trainer</h1>
        </div>
        <div className="twin-trainer-topbar__right">
          <button
            type="button"
            className="twin-trainer-chip twin-trainer-chip--btn"
            onClick={() => setVoiceEnabled((v) => !v)}
            data-testid="voice-feedback-toggle"
          >
            {voiceEnabled ? "🔊 Voice Feedback: ON" : "🔇 Voice Feedback: Muted"}
          </button>
          {videoDevices.length > 1 && (
            <select
              className="form-select form-select-sm bg-dark text-white border-secondary w-auto"
              style={{ fontSize: "12px" }}
              value={selectedDeviceId}
              onChange={(e) => {
                const newId = e.target.value;
                setSelectedDeviceId(newId);
                void initCamera(newId);
              }}
            >
              {videoDevices.map((dev, idx) => (
                <option key={dev.deviceId || idx} value={dev.deviceId}>
                  {dev.label || `Camera Port ${idx + 1}`}
                </option>
              ))}
            </select>
          )}
          {sessionPhase === "recording" && (
            <span className="twin-trainer-chip twin-trainer-chip--rec">
              ● REC {timeDisplay}
            </span>
          )}
        </div>
      </div>

      {cameraError ? (
        <div className="alert alert-warning mb-3 p-3">
          <strong>Camera Notice:</strong> {cameraError}
          <div className="mt-2">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleReleaseAndRetry}
              disabled={releasingServices}
            >
              {releasingServices
                ? "Releasing Hardware & Connecting..."
                : "Release & Reconnect Camera"}
            </button>
          </div>
        </div>
      ) : null}

      {mediapipeError ? (
        <div className="alert alert-danger mb-3 py-2 small">
          Pose model: {mediapipeError}
        </div>
      ) : null}

      <div className="twin-trainer-grid">
        {/* LEFT/CENTER STAGE COLUMN: Twins Side-by-Side + Centered Live Camera Preview Below */}
        <div className="twin-stage-column">
          <TwinViewer
            gender={userGender}
            liveLandmarksRef={liveLandmarksRef}
            liveWorldLandmarksRef={liveWorldLandmarksRef}
            correctionState={twinCorrectionState}
            poseName={pose?.name || ""}
            isMirroringEnabled={isMirroringEnabled}
            isFeedbackEnabled={isFeedbackEnabled}
            trackingStatusMessage={trackingStatusMessage}
            sessionState={sessionState}
          />

          {/* PART 10: Centered Live Camera Preview Below Twin Panels (288x216, 4:3, existing stream + landmark overlay) */}
          <div className="twin-camera-preview-dock">
            <div
              className="twin-camera-preview-box"
              data-testid="live-camera-preview"
            >
              <div className="twin-camera-preview-header">
                <span className="twin-camera-preview-tag">
                  <span className="twin-camera-preview-dot" />
                  LIVE CAMERA
                </span>
              </div>
              <video
                ref={videoRef}
                className="twin-camera-preview-video"
                muted
                autoPlay
                playsInline
              />
              <canvas
                ref={canvasRef}
                className="twin-camera-preview-canvas"
                aria-hidden
              />
            </div>
          </div>
        </div>

        {/* RIGHT SIDEBAR: Original Corrective-Feedback Panel + AI Coach */}
        <aside
          className="twin-trainer-sidebar"
          data-testid="corrective-feedback-panel"
        >
          <div className="twin-telemetry-card">
            <h2 className="twin-telemetry-pose-name">{pose.name}</h2>
            {pose.sanskrit && (
              <div className="twin-telemetry-pose-sub">{pose.sanskrit}</div>
            )}

            {/* Live Classifier Detected Pose */}
            <div className="twin-detected-pose-row">
              <span className="twin-detected-pose-label">Detected Pose</span>
              <span
                className="twin-detected-pose-value"
                data-testid="detected-pose-label"
              >
                {isFeedbackEnabled ? detectedPose || "Detecting..." : "—"}
              </span>
            </div>

            <div className="twin-telemetry-divider" />

            <div
              className={`app-correction-status ${meta.cls} mb-2`}
              role="status"
              aria-live="polite"
              data-testid="correction-status-badge"
            >
              {meta.label}
            </div>

            <div className="twin-score-label">ALIGNMENT SCORE</div>
            <div
              className="twin-score-value"
              data-testid="alignment-score-value"
            >
              {confidencePct}%
            </div>
            <div className="twin-score-bar-track">
              <div
                className="twin-score-bar-fill"
                style={{
                  width: `${Math.max(0, Math.min(100, confidencePct))}%`,
                }}
              />
            </div>

            {isFeedbackEnabled && correctionStepText ? (
              <div className="twin-step-box" data-testid="correction-step-text">
                <strong>Target Step:</strong> {correctionStepText}
              </div>
            ) : null}

            <div className="twin-corrections-heading">CORRECTIONS</div>
            {!isFeedbackEnabled ? (
              <ul className="twin-corrections-list">
                <li className="twin-corrections-item">
                  <span
                    className={`twin-corrections-icon ${
                      sessionState === SESSION_STATE.RECORDING_TRACKING_LOST
                        ? "twin-corrections-icon--warn"
                        : "twin-corrections-icon--ok"
                    }`}
                  >
                    {sessionState === SESSION_STATE.RECORDING_TRACKING_LOST
                      ? "!"
                      : "✓"}
                  </span>
                  <span data-testid="tracking-readiness-message">
                    {trackingStatusMessage ||
                      "Position your full body inside the camera frame and press Start Recording."}
                  </span>
                </li>
              </ul>
            ) : shownCorrections.length === 0 ? (
              <ul className="twin-corrections-list">
                <li className="twin-corrections-item">
                  <span className="twin-corrections-icon twin-corrections-icon--ok">
                    ✓
                  </span>
                  <span>
                    {correctionFeedback ||
                      "No major adjustments needed for the tracked joints."}
                  </span>
                </li>
              </ul>
            ) : (
              <ul
                className="twin-corrections-list"
                data-testid="correction-items-list"
              >
                {shownCorrections.slice(0, 4).map((c, i) => (
                  <li key={`${i}-${c}`} className="twin-corrections-item">
                    <span className="twin-corrections-icon twin-corrections-icon--warn">
                      !
                    </span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="twin-telemetry-actions">
              {sessionPhase === "idle" ? (
                <>
                  <div className="small text-light text-center">
                    Ready to record: <strong>3:00</strong>
                  </div>
                  <button
                    type="button"
                    className="btn btn-danger w-100 fw-semibold"
                    onClick={handleStartRecording}
                  >
                    ● Start Recording
                  </button>
                </>
              ) : sessionPhase === "recording" ? (
                <>
                  <div className="d-flex justify-content-between small text-light">
                    <span className="text-danger fw-bold">● REC</span>
                    <span>{timeDisplay} remaining</span>
                  </div>
                  <div className="practice-progress-bar mb-1">
                    <div
                      className="practice-progress-fill"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline-light btn-sm w-100"
                    onClick={() => stopSession("manual")}
                  >
                    ■ Stop Recording
                  </button>
                </>
              ) : sessionPhase === "done" && recordingData ? (
                <div className="d-grid gap-2">
                  <button
                    type="button"
                    className="btn btn-success btn-sm"
                    disabled={saving}
                    onClick={() => void handleDownload()}
                  >
                    Download ZIP
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-info btn-sm"
                    disabled={saving}
                    onClick={() => void handleSaveToDevice()}
                  >
                    Save to Device Folder
                  </button>
                  {saveStatus && (
                    <div
                      className={`small ${
                        saveStatus.ok ? "text-success" : "text-danger"
                      }`}
                    >
                      {saveStatus.message}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          {/* AI Coach Card (with Ollama Stuck-User Coaching & Age-Based Guidance) */}
          <div className="twin-coach-card" data-testid="ai-coach-card">
            <h3 className="twin-coach-title">
              {isFeedbackEnabled && ollamaCoaching?.loading
                ? "AI COACH (OLLAMA ANALYZING...)"
                : isFeedbackEnabled && ollamaCoaching?.active
                ? "AI COACH (OLLAMA LIVE TIP)"
                : "AI COACH (LIVE)"}
            </h3>
            <div className="twin-coach-body">
              <div className="twin-coach-avatar" aria-hidden="true">
                🤖
              </div>
              <p className="twin-coach-text" data-testid="ai-coach-message">
                {!isFeedbackEnabled
                  ? trackingStatusMessage ||
                    `Stand in full camera view and press Start Recording to activate live mirroring and AI Coach feedback for ${pose.sanskrit || pose.name}.`
                  : ollamaCoaching?.active && ollamaCoaching?.feedback
                  ? `${ollamaCoaching.feedback} Follow the Corrective Twin on the right for the complete ${pose.sanskrit || pose.name} target posture.`
                  : shownCorrections.length === 0
                  ? `Great job! Your ${pose.sanskrit || pose.name} alignment looks solid. Hold steady and breathe naturally${
                      asanaReference?.holdingTime
                        ? ` (Hold: ${
                            ageGroup === "40plus"
                              ? asanaReference.holdingTime.over40
                              : asanaReference.holdingTime.under40
                          })`
                        : "."
                    }`
                  : `${shownCorrections[0]} Follow the Corrective Twin on the right to align your posture.`}
              </p>
            </div>
          </div>
        </aside>
      </div>

      {sessionPhase === "countdown" && (
        <div className="practice-countdown-overlay">
          <div className="practice-countdown-number">
            {countdownValue > 0 ? countdownValue : 1}
          </div>
          <div className="practice-countdown-label">Get ready...</div>
        </div>
      )}
    </div>
  );
};

export default PracticeSessionPage;
