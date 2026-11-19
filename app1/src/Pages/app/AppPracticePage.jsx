import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { POSES } from "../../data/poses";
import { useAuth } from "../../context/AuthContext";
import { useSession } from "../../context/SessionContext";
import { useAppCollectionPose } from "../../hooks/useAppCollectionPose";
import { useCorrectionEngine, CORRECTION_STATUS } from "../../hooks/useCorrectionEngine";
import {
  useSessionTrackingState,
  SESSION_STATE,
} from "../../hooks/useSessionTrackingState";
import AppImuStatusStrip from "../../Components/app/AppImuStatusStrip";
import TwinViewer from "../../Components/twins/TwinViewer";
import mlPoseService from "../../services/mlPoseService";
import dlPoseService from "../../services/dlPoseService";
import CONFIG from "../../config";
import { countActiveOnline, normalizeImuPollPayload } from "../../utils/sensorStatus";
import { playCountdownBeep } from "../../utils/countdownBeep";
import { startRecording, stopRecording } from "../../utils/recorder";
import { getPoseMessages } from "../../data/poseMessages";
import PoseInstructionDialog from "../../Components/PoseInstructionDialog";
import { useCorrectiveTts } from "../../hooks/useCorrectiveTts";
import "../../Pages/SequencerPage.css";
import "../../Pages/Practice/PracticeSessionPage.css";
import "./AppPages.css";

const API_BASE = "http://127.0.0.1:3001";
const MAX_RECORDING_SECONDS = 180;
const categories = ["All", "Standing", "Sitting", "Supine"];

const fmt = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/** Maps a correction status to a human label and a CSS modifier class. */
const CORRECTION_STATUS_META = {
  idle: { label: "Ready — Press Start Recording", cls: "is-detecting" },
  detecting: { label: "Detecting Pose", cls: "is-detecting" },
  good_form: { label: "Good Form", cls: "is-good" },
  adjust: { label: "Adjust Your Posture", cls: "is-adjust" },
  not_detected: { label: "Pose Not Detected", cls: "is-nodetect" },
  unavailable: { label: "Correction Unavailable", cls: "is-unavailable" },
  error: { label: "Correction Offline", cls: "is-error" },
};

const AppPracticePage = () => {
  const navigate = useNavigate();
  const { token, currentUser } = useAuth();
  const {
    sessionId,
    posePracticeCounts,
    incrementPoseCount,
    clearSession,
    cameraStream,
    tZero: sessionTZero,
    metadata,
  } = useSession();

  const [categoryFilter, setCategoryFilter] = useState("All");
  const [selectedPoseId, setSelectedPoseId] = useState("");
  const [statsRows, setStatsRows] = useState([]);
  const [view, setView] = useState("grid");
  const [recordPhase, setRecordPhase] = useState("idle");
  const [countdownValue, setCountdownValue] = useState(3);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [stopping, setStopping] = useState(false);
  const [summary, setSummary] = useState(null);
  const [imuDevices, setImuDevices] = useState({});
  const [detectedPose, setDetectedPose] = useState("—");
  const [confidence, setConfidence] = useState(0);
  const [corrections, setCorrections] = useState([]);
  const [saveResult, setSaveResult] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [instructionPhase, setInstructionPhase] = useState(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const ownedStreamRef = useRef(false);
  const timerRef = useRef(null);
  const countdownRef = useRef(null);
  const elapsedRef = useRef(0);
  const selectedPoseIdRef = useRef(selectedPoseId);

  // Live landmark refs for 60fps TwinViewer consumption (read-only visualization layer)
  const liveLandmarksRef = useRef(null);
  const liveWorldLandmarksRef = useRef(null);

  const selectedPose = useMemo(
    () => POSES.find((p) => p.id === selectedPoseId) || null,
    [selectedPoseId]
  );

  const userGender = useMemo(
    () => currentUser?.gender || metadata?.gender || null,
    [currentUser?.gender, metadata?.gender]
  );

  const visiblePoses = useMemo(
    () => (categoryFilter === "All" ? POSES : POSES.filter((p) => p.category === categoryFilter)),
    [categoryFilter]
  );

  const groupedVisiblePoses = useMemo(
    () =>
      visiblePoses.reduce((acc, pose) => {
        if (!acc[pose.category]) acc[pose.category] = [];
        acc[pose.category].push(pose);
        return acc;
      }, {}),
    [visiblePoses]
  );

  useEffect(() => {
    selectedPoseIdRef.current = selectedPoseId;
  }, [selectedPoseId]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/practices/user/stats`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) setStatsRows(data.rows || []);
      } catch {
        setStatsRows([]);
      }
    })();
  }, [token, view]);

  useEffect(() => {
    const dataUrl = CONFIG.FLASK_DATA_URL?.replace(/\/$/, "");
    if (!dataUrl) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`${dataUrl}/debug/imu`, { cache: "no-store" });
        if (!res.ok) throw new Error("down");
        const data = await res.json();
        if (!cancelled) setImuDevices(normalizeImuPollPayload(data, CONFIG.SENSOR_SLOTS));
      } catch {
        if (!cancelled) setImuDevices({});
      }
    };
    void poll();
    const id = window.setInterval(poll, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const posePipelineEnabled =
    view === "practice" &&
    Boolean(selectedPose) &&
    cameraReady &&
    recordPhase !== "done";

  const isActivelyRecording =
    view === "practice" &&
    Boolean(selectedPose) &&
    cameraReady &&
    recordPhase === "recording";

  // Central Session & Full-Body Tracking State Machine (Single Source of Truth)
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

  const userAge = useMemo(
    () => currentUser?.age ?? metadata?.age ?? null,
    [currentUser?.age, metadata?.age]
  );

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
    appPoseName: selectedPose?.name || "",
    poseId: selectedPose?.id || null,
    sessionId: sessionId || null,
    trackingState: sessionState,
    currentStepIndex: 0,
    age: userAge,
    userName: metadata?.name || currentUser?.full_name || currentUser?.username,
  });

  // Read-only correction state object passed to the Corrective Twin adapter
  const twinCorrectionState = useMemo(
    () => ({
      appPoseName: selectedPose?.name || "",
      poseId: selectedPose?.id || null,
      status: isFeedbackEnabled ? correctionStatus : CORRECTION_STATUS.IDLE,
      supported: correctionSupported,
      engineOnline,
      matchConfidence: isFeedbackEnabled ? matchConfidence : null,
      feedback: isFeedbackEnabled ? correctionFeedback : null,
      corrections: !isFeedbackEnabled
        ? []
        : correctionSupported && engineOnline && correctionStatus !== CORRECTION_STATUS.ERROR
        ? engineCorrections
        : corrections,
      stepText: isFeedbackEnabled ? correctionStepText : null,
      idealLandmarks: isFeedbackEnabled ? idealLandmarks : null,
      targetAngles: isFeedbackEnabled ? targetAngles : null,
      liveAngles: isFeedbackEnabled ? liveAngles : null,
      descriptorDeviations: isFeedbackEnabled ? descriptorDeviations : null,
      ytAngleScore: isFeedbackEnabled ? ytAngleScore : null,
      ollamaCoaching: isFeedbackEnabled ? ollamaCoaching : null,
    }),
    [
      selectedPose?.name,
      selectedPose?.id,
      isFeedbackEnabled,
      correctionStatus,
      correctionSupported,
      engineOnline,
      matchConfidence,
      correctionFeedback,
      engineCorrections,
      corrections,
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
  const engineUsableForTts =
    isFeedbackEnabled &&
    correctionSupported &&
    engineOnline &&
    correctionStatus !== CORRECTION_STATUS.ERROR;

  const currentTtsFeedback = useMemo(() => {
    if (!isVoiceEnabled) return null;
    if (engineUsableForTts) {
      if (correctionStatus === CORRECTION_STATUS.GOOD_FORM) {
        return correctionFeedback || "Looking good, hold the position";
      }
      if (engineCorrections && engineCorrections.length > 0) {
        return engineCorrections;
      }
      return correctionFeedback || null;
    }
    if (corrections && corrections.length > 0) {
      return corrections;
    }
    return null;
  }, [
    isVoiceEnabled,
    engineUsableForTts,
    correctionStatus,
    correctionFeedback,
    engineCorrections,
    corrections,
  ]);

  const { stop: stopVoiceTts } = useCorrectiveTts({
    active: isVoiceEnabled,
    feedback: currentTtsFeedback,
  });

  // Immediately clear UI telemetry and stop voice whenever feedback/tracking is disabled
  useEffect(() => {
    if (!isFeedbackEnabled) {
      setDetectedPose("—");
      setConfidence(0);
      setCorrections([]);
    }
    if (!isVoiceEnabled) {
      stopVoiceTts();
    }
  }, [isFeedbackEnabled, isVoiceEnabled, stopVoiceTts]);

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

  const handleSetDetectedPose = useCallback((p) => {
    if (isFeedbackEnabledRef.current) {
      setDetectedPose(p);
    } else {
      setDetectedPose("—");
    }
  }, []);

  const handleSetConfidence = useCallback((c) => {
    if (isFeedbackEnabledRef.current) {
      setConfidence(c);
    } else {
      setConfidence(0);
    }
  }, []);

  const handleSetCorrections = useCallback((newCorrections) => {
    if (isFeedbackEnabledRef.current) {
      setCorrections(newCorrections);
    } else {
      setCorrections([]);
    }
  }, []);

  const { mediapipeError } = useAppCollectionPose({
    videoRef,
    canvasRef,
    enabled: posePipelineEnabled,
    practicePoseName: selectedPose?.name || "",
    setDetectedPose: handleSetDetectedPose,
    setConfidence: handleSetConfidence,
    setCorrections: handleSetCorrections,
    onRawLandmarks: handleRawLandmarks,
  });

  const attachStream = useCallback((stream) => {
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      const play = videoRef.current.play();
      if (play?.catch) play.catch(() => {});
    }
    setCameraReady(true);
  }, []);

  useEffect(() => {
    if (view !== "practice" || !selectedPose) return undefined;

    let cancelled = false;

    if (cameraStream) {
      attachStream(cameraStream);
      ownedStreamRef.current = false;
      return () => {
        if (!cancelled && ownedStreamRef.current) {
          streamRef.current?.getTracks().forEach((t) => t.stop());
        }
      };
    }

    (async () => {
      try {
        void mlPoseService.releaseCamera();
        void dlPoseService.releaseCamera();
        let stream = null;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        ownedStreamRef.current = true;
        attachStream(stream);
      } catch {
        if (!cancelled) setCameraReady(false);
      }
    })();

    return () => {
      cancelled = true;
      if (ownedStreamRef.current) {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        ownedStreamRef.current = false;
      }
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraReady(false);
    };
  }, [view, selectedPoseId, cameraStream, attachStream, selectedPose]);

  const clearTimers = useCallback(() => {
    window.clearInterval(timerRef.current);
    window.clearInterval(countdownRef.current);
    timerRef.current = null;
    countdownRef.current = null;
  }, []);

  const finalizeRecording = useCallback(
    async (stoppedBy) => {
      if (!selectedPose || stopping) return;
      setStopping(true);
      clearTimers();
      stopVoiceTts();
      markSessionStopped();
      liveLandmarksRef.current = null;
      liveWorldLandmarksRef.current = null;

      const duration = Math.max(1, elapsedRef.current || 1);
      let saveError = null;

      try {
        if (streamRef.current) {
          await stopRecording({
            poseId: selectedPose.id,
            poseName: selectedPose.name,
            persistOffline: false,
          });
        }

        if (sessionId && token) {
          try {
            await fetch(`${API_BASE}/api/practices`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                session_id: sessionId,
                pose_name: selectedPose.name,
                pose_sanskrit: selectedPose.sanskrit,
                pose_category: selectedPose.category,
                started_at: new Date(Date.now() - duration * 1000).toISOString(),
                ended_at: new Date().toISOString(),
                duration_seconds: duration,
                stopped_by: stoppedBy,
              }),
            });
          } catch {
            /* app stats are optional */
          }
        }

        incrementPoseCount(selectedPose.name);
        setSaveResult({
          ok: !saveError,
          storedOffline: false,
          duration,
          error: saveError,
        });
        setRecordPhase("done");
        if (getPoseMessages(selectedPose)?.after?.length) {
          setInstructionPhase("after");
        }
      } finally {
        setStopping(false);
      }
    },
    [
      selectedPose,
      stopping,
      clearTimers,
      stopVoiceTts,
      markSessionStopped,
      sessionId,
      token,
      incrementPoseCount,
    ]
  );

  const startRecordingTimer = useCallback(() => {
    elapsedRef.current = 0;
    setElapsedSec(0);
    timerRef.current = window.setInterval(() => {
      elapsedRef.current += 1;
      setElapsedSec(elapsedRef.current);
      if (elapsedRef.current >= MAX_RECORDING_SECONDS) {
        void finalizeRecording("timer");
      }
    }, 1000);
  }, [finalizeRecording]);

  const beginCountdown = useCallback(() => {
    if (!selectedPose || !streamRef.current || recordPhase !== "idle") return;

    setSaveResult(null);
    setRecordPhase("countdown");
    setCountdownValue(3);
    playCountdownBeep();

    let count = 3;
    countdownRef.current = window.setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdownValue(count);
        playCountdownBeep();
        return;
      }

      window.clearInterval(countdownRef.current);
      countdownRef.current = null;
      setCountdownValue(0);
      playCountdownBeep({ final: true });

      void (async () => {
        startRecording(streamRef.current, {
          sessionTZero: sessionTZero ?? undefined,
          persistOffline: false,
        });
        setRecordPhase("recording");
        startRecordingTimer();
      })();
    }, 1000);
  }, [selectedPose, recordPhase, sessionTZero, startRecordingTimer]);

  const handleStartRecording = useCallback(() => {
    if (getPoseMessages(selectedPose)?.before?.length) {
      setInstructionPhase("before");
      return;
    }
    beginCountdown();
  }, [beginCountdown, selectedPose]);

  const openPose = (poseId) => {
    clearTimers();
    stopVoiceTts();
    resetTrackingState();
    liveLandmarksRef.current = null;
    liveWorldLandmarksRef.current = null;
    setSelectedPoseId(poseId);
    setRecordPhase("idle");
    setElapsedSec(0);
    elapsedRef.current = 0;
    setSaveResult(null);
    setInstructionPhase(null);
    setDetectedPose("—");
    setConfidence(0);
    setCorrections([]);
    setView("practice");
  };

  const backToGrid = () => {
    clearTimers();
    stopVoiceTts();
    resetTrackingState();
    liveLandmarksRef.current = null;
    liveWorldLandmarksRef.current = null;
    setView("grid");
    setRecordPhase("idle");
    setSaveResult(null);
    setInstructionPhase(null);
  };

  const endSession = async () => {
    stopVoiceTts();
    markSessionStopped();
    if (!sessionId) return;
    await fetch(`${API_BASE}/api/sessions/${sessionId}/end`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const sessionRes = await fetch(`${API_BASE}/api/practices/session/${sessionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const sessionData = await sessionRes.json();
    const byPose = sessionData.by_pose || [];
    const entries = byPose.map((row) => [row.pose_name, row.total_count]);
    const totalSeconds = (sessionData.practices || []).reduce(
      (acc, practice) => acc + Number(practice.duration_seconds || 0),
      0
    );
    setSummary({ entries, totalSeconds });
  };

  const lifetimeCount = (name) =>
    Number(statsRows.find((r) => r.pose_name === name)?.total_count || 0);

  if (!sessionId) {
    return (
      <div className="app-shell container py-4">
        <div className="alert alert-warning">No active session. Start from hardware checks.</div>
        <button className="btn btn-outline-dark" type="button" onClick={() => navigate("/app/hardware")}>
          Go to Hardware
        </button>
      </div>
    );
  }

  const connectedCount = countActiveOnline(imuDevices, CONFIG.SENSOR_SLOTS);
  const remaining = Math.max(0, MAX_RECORDING_SECONDS - elapsedSec);
  const progressPercent = (elapsedSec / MAX_RECORDING_SECONDS) * 100;
  const poseMessages = getPoseMessages(selectedPose);

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
    : CORRECTION_STATUS_META[correctionStatus] || CORRECTION_STATUS_META.detecting;

  const engineUsable =
    isFeedbackEnabled &&
    correctionSupported &&
    engineOnline &&
    correctionStatus !== CORRECTION_STATUS.ERROR;
  const alignmentScorePct = !isFeedbackEnabled
    ? 0
    : engineUsable && matchConfidence != null
    ? Math.round(matchConfidence * 100)
    : Math.round(confidence || 0);
  const shownCorrections = !isFeedbackEnabled
    ? []
    : engineUsable && engineCorrections?.length > 0
    ? engineCorrections
    : corrections;

  return (
    <div className="sequencer-fullscreen">
      <AppImuStatusStrip />
      {instructionPhase && (
        <PoseInstructionDialog
          pose={selectedPose}
          phase={instructionPhase}
          messages={poseMessages?.[instructionPhase]}
          onContinue={() => {
            if (instructionPhase === "before") {
              setInstructionPhase(null);
              beginCountdown();
              return;
            }
            setInstructionPhase(null);
          }}
        />
      )}
      {view === "grid" ? (
        <div className="container-fluid py-4 sequencer-select-view">
          <div className="sequencer-select-intro">
            <h1 className="sequencer-heading">Select a Pose to Practice</h1>
            <p className="sequencer-subheading">
              Choose a pose, then press Start Recording when you are ready.
            </p>
          </div>
          <div className="sequencer-filter-row px-3">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`sequencer-filter-btn${categoryFilter === cat ? " active" : ""}`}
                onClick={() => setCategoryFilter(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="sequencer-category-sections px-3">
            {Object.entries(groupedVisiblePoses).map(([category, poses]) => (
              <section key={category} className="sequencer-category-section">
                <h3 className="sequencer-category-title">{category} Poses</h3>
                <div className="sequencer-pose-grid">
                  {poses.map((pose) => {
                    const count = (posePracticeCounts[pose.name] || 0) + lifetimeCount(pose.name);
                    const selected = selectedPoseId === pose.id;
                    return (
                      <button
                        key={pose.id}
                        type="button"
                        className="sequencer-pose-card"
                        style={{
                          borderColor: selected ? "#0ea5e9" : undefined,
                          borderWidth: selected ? 2 : 1,
                        }}
                        onClick={() => openPose(pose.id)}
                      >
                        <span className="sequencer-pose-card-name">{pose.name}</span>
                        <span className="sequencer-pose-card-sanskrit">{pose.sanskrit}</span>
                        <span className="sequencer-pose-meta">{pose.id} · 180s</span>
                        <span
                          className={`sequencer-badge ${
                            count > 0 ? "sequencer-badge-recorded" : "sequencer-badge-pending"
                          }`}
                        >
                          {count > 0 ? `Practiced ${count} times` : "Not practiced"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          <div className="sequencer-select-footer mt-4">
            <button type="button" className="btn btn-outline-dark" onClick={endSession}>
              End Session
            </button>
          </div>
        </div>
      ) : (
        <div className="twin-trainer-workspace">
          {/* Top Bar */}
          <div className="twin-trainer-topbar">
            <div className="twin-trainer-topbar__left">
              <button
                type="button"
                className="btn btn-sm btn-outline-info"
                onClick={backToGrid}
              >
                ← Back to poses
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
              <span className="twin-trainer-chip">
                {connectedCount} IMU connected
              </span>
              {recordPhase === "recording" && (
                <span className="twin-trainer-chip twin-trainer-chip--rec">
                  ● REC {fmt(remaining)}
                </span>
              )}
            </div>
          </div>

          {mediapipeError ? (
            <div className="alert alert-warning mb-3 py-2 small">
              MediaPipe: {mediapipeError}
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
                poseName={selectedPose?.name || ""}
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
                    autoPlay
                    playsInline
                    muted
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
                <h2 className="twin-telemetry-pose-name">
                  {selectedPose?.name}
                </h2>
                {selectedPose?.sanskrit && (
                  <div className="twin-telemetry-pose-sub">
                    {selectedPose.sanskrit}
                  </div>
                )}

                {/* Live Classifier Detected Pose (never shows a false pose before recording or while out of frame) */}
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

                {/* Restored Original Correction Status Badge */}
                <div
                  className={`app-correction-status ${meta.cls} mb-2`}
                  role="status"
                  aria-live="polite"
                  data-testid="correction-status-badge"
                >
                  {meta.label}
                </div>

                {/* Alignment Score / Match Confidence */}
                <div className="twin-score-label">ALIGNMENT SCORE</div>
                <div
                  className="twin-score-value"
                  data-testid="alignment-score-value"
                >
                  {alignmentScorePct}%
                </div>
                <div className="twin-score-bar-track">
                  <div
                    className="twin-score-bar-fill"
                    style={{
                      width: `${Math.max(0, Math.min(100, alignmentScorePct))}%`,
                    }}
                  />
                </div>

                {/* Original Step Rubric */}
                {isFeedbackEnabled && correctionStepText ? (
                  <div
                    className="twin-step-box"
                    data-testid="correction-step-text"
                  >
                    <strong>Target Step:</strong> {correctionStepText}
                  </div>
                ) : null}

                {/* Affected Joint / Angle Deviation Pills */}
                {isFeedbackEnabled &&
                  Array.isArray(descriptorDeviations) &&
                  descriptorDeviations.length > 0 && (
                    <div className="twin-joint-pills">
                      {descriptorDeviations.slice(0, 3).map((dev, idx) => (
                        <span key={idx} className="twin-joint-pill">
                          {dev.name.replace(/([A-Z])/g, " $1").trim()} (z:{" "}
                          {dev.z > 0 ? `+${dev.z}` : dev.z})
                        </span>
                      ))}
                    </div>
                  )}

                {/* Original Corrections & Mistake Descriptions */}
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
                ) : engineUsable &&
                  correctionStatus === CORRECTION_STATUS.GOOD_FORM ? (
                  <ul className="twin-corrections-list">
                    <li className="twin-corrections-item">
                      <span className="twin-corrections-icon twin-corrections-icon--ok">
                        ✓
                      </span>
                      <span>
                        {correctionFeedback ||
                          "Looking good — hold the position!"}
                      </span>
                    </li>
                  </ul>
                ) : shownCorrections && shownCorrections.length > 0 ? (
                  <ul
                    className="twin-corrections-list"
                    data-testid="correction-items-list"
                  >
                    {shownCorrections.slice(0, 4).map((c, i) => (
                      <li key={i} className="twin-corrections-item">
                        <span className="twin-corrections-icon twin-corrections-icon--warn">
                          !
                        </span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                ) : engineUsable && correctionFeedback ? (
                  <ul className="twin-corrections-list">
                    <li className="twin-corrections-item">
                      <span className="twin-corrections-icon twin-corrections-icon--warn">
                        !
                      </span>
                      <span>{correctionFeedback}</span>
                    </li>
                  </ul>
                ) : (
                  <ul className="twin-corrections-list">
                    <li className="twin-corrections-item">
                      <span className="twin-corrections-icon twin-corrections-icon--ok">
                        ✓
                      </span>
                      <span>
                        Hold your posture steady for live alignment analysis.
                      </span>
                    </li>
                  </ul>
                )}

                {/* Recording & Timer Controls */}
                <div className="twin-telemetry-actions">
                  {recordPhase === "idle" ? (
                    <>
                      <div className="small text-light text-center">
                        Session Timer: <strong>{fmt(MAX_RECORDING_SECONDS)}</strong>
                      </div>
                      <button
                        type="button"
                        className="btn btn-danger w-100 fw-semibold"
                        onClick={handleStartRecording}
                        disabled={!cameraReady}
                      >
                        ● Start Recording
                      </button>
                    </>
                  ) : recordPhase === "recording" ? (
                    <>
                      <div className="d-flex justify-content-between small text-light">
                        <span className="text-danger fw-bold">● REC</span>
                        <span>{fmt(remaining)} remaining</span>
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
                        onClick={() => void finalizeRecording("manual")}
                        disabled={stopping}
                      >
                        ■ Stop Recording
                      </button>
                    </>
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
                        `Stand in full camera view and press Start Recording to activate live mirroring and AI Coach feedback for ${selectedPose?.sanskrit || selectedPose?.name}.`
                      : ollamaCoaching?.active && ollamaCoaching?.feedback
                      ? `${ollamaCoaching.feedback} Watch the Corrective Twin on the right for the complete ${selectedPose?.sanskrit || selectedPose?.name} target posture.`
                      : engineUsable &&
                        correctionStatus === CORRECTION_STATUS.GOOD_FORM
                      ? `Great job! Your ${selectedPose?.sanskrit || selectedPose?.name} alignment is on target. Keep breathing steadily${
                          asanaReference?.holdingTime
                            ? ` (Hold: ${
                                ageGroup === "40plus"
                                  ? asanaReference.holdingTime.over40
                                  : asanaReference.holdingTime.under40
                              })`
                            : "."
                        }`
                      : shownCorrections && shownCorrections.length > 0
                      ? `${shownCorrections[0]} Watch the Corrective Twin on the right for the exact target alignment.`
                      : correctionFeedback ||
                        `Align your body with ${selectedPose?.sanskrit || selectedPose?.name}. The Digital Twin mirrors your live pose while the Corrective Twin demonstrates adjustments.`}
                  </p>
                </div>
              </div>
            </aside>
          </div>

          {recordPhase === "countdown" && (
            <div className="practice-countdown-overlay">
              <div className="practice-countdown-number" key={countdownValue}>
                {countdownValue > 0 ? countdownValue : 1}
              </div>
              <div className="practice-countdown-label">Get ready...</div>
            </div>
          )}

          {recordPhase === "done" && saveResult && (
            <div className="app-practice-done-panel">
              <div className="recording-success-card" role="status" aria-live="polite">
                <div className="recording-success-icon" aria-hidden="true">✓</div>
                <h3>Recording Complete</h3>
                <p className="success-pose">{selectedPose?.name}</p>
                <p className="success-duration">{fmt(saveResult.duration)} recorded</p>
                <p className="success-status">
                  {saveResult.ok
                    ? "Your practice session was saved successfully."
                    : `Save issue: ${saveResult.error || "Unknown error"}`}
                </p>
                {saveResult.storedOffline && (
                  <p className="small text-muted mt-3 mb-0">
                    Saved locally with recording data.
                  </p>
                )}
                <button type="button" className="btn btn-primary mt-4" onClick={backToGrid}>
                  ↻ Practice Another Pose
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {summary ? (
        <div className="sequencer-dialog-overlay">
          <div className="sequencer-dialog">
            <h3 className="h5">Great practice!</h3>
            <p className="small mb-1">Total session time: {Math.round(summary.totalSeconds / 60)} min</p>
            {summary.entries.map(([name, count]) => (
              <div key={name} className="small">
                {name}: {count} times
              </div>
            ))}
            <button
              type="button"
              className="btn btn-primary mt-3"
              onClick={() => {
                setSummary(null);
                clearSession();
                navigate("/app/dashboard");
              }}
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AppPracticePage;
