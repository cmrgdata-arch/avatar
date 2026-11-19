import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCorrectionPoseName } from "../data/correctionPoseMap";
import { getAsanaReferenceByNameOrId } from "../data/asanaReferenceTable";

/**
 * Throttled polling hook that bridges live MediaPipe landmarks from the
 * practice view into the Yoga Pose Correction engine (`POST /correction-api/analyze-frame`)
 * AND triggers the local Ollama LLM coach (`POST /correction-api/ollama-feedback`)
 * when the user remains stuck in a posture violation for >= 3000 ms during active recording.
 *
 * Strictly preserves:
 * - 500 ms rule-engine polling cadence
 * - 6-frame rolling window (require >= 4 matches at >= 60% confidence for GOOD_FORM)
 * - 3-frame feedback text debounce
 * - 3000 ms stuck-user violation threshold + 10000 ms cooldown before invoking Ollama
 * - Strict sessionId / poseId / poseName / requestId validation so stale Ollama responses
 *   are discarded if the user switches poses, loses full-body tracking, or stops recording.
 */

const POLL_INTERVAL_MS = 500;
const WINDOW_SIZE = 6;
const REQUIRED_MATCHES = 4;
const MATCH_CONF_THRESHOLD = 0.6;
const FEEDBACK_DEBOUNCE_FRAMES = 3;
const MIN_LANDMARK_VISIBILITY = 0.35;

// Existing stuck-user Ollama trigger threshold & cooldown
export const OLLAMA_STUCK_TRIGGER_MS = 3000;
export const OLLAMA_COOLDOWN_MS = 10000;
export const OLLAMA_FEEDBACK_HOLD_MS = 6500;

export const CORRECTION_STATUS = {
  IDLE: "idle",
  DETECTING: "detecting",
  GOOD_FORM: "good_form",
  ADJUST: "adjust",
  NOT_DETECTED: "not_detected",
  UNAVAILABLE: "unavailable",
  ERROR: "error",
};

const KEY_JOINTS = [11, 12, 13, 14, 23, 24, 25, 26]; // L/R shoulders, elbows, hips, knees

function areKeyJointsVisible(landmarks) {
  if (!Array.isArray(landmarks) || landmarks.length < 33) return false;
  for (const idx of KEY_JOINTS) {
    const lm = landmarks[idx];
    if (!lm || (lm.visibility ?? 0) < MIN_LANDMARK_VISIBILITY) return false;
  }
  return true;
}

export function classifyUserAgeGroup(age) {
  const a = parseInt(age, 10);
  if (!Number.isFinite(a) || a <= 0) return null;
  return a < 40 ? "under40" : "40plus";
}

const INITIAL_OLLAMA_STATE = {
  active: false,
  loading: false,
  feedback: null,
  stepComplete: false,
  poseId: null,
  poseName: null,
  correctionPoseName: null,
  sessionId: null,
  requestId: 0,
  ageGroup: null,
  model: null,
  timestamp: null,
};

/**
 * @param {object} opts
 * @param {boolean} opts.active - Whether the practice session is actively running (`isRecording && isFullBodyDetected && isTrackingStable`)
 * @param {string} opts.appPoseName - Pose `name` from `src/data/poses.js` (e.g. "Mountain Pose")
 * @param {string} [opts.poseId] - Pose `id` from `src/data/poses.js` (e.g. "STA-01")
 * @param {string|number} [opts.sessionId] - Current practice session ID
 * @param {string} [opts.trackingState] - Current tracking state from `useSessionTrackingState`
 * @param {number} [opts.currentStepIndex=0] - Step index within the pose sequence
 * @param {number|null} [opts.age=null] - User age (used for <40 vs 40+ coaching guidance)
 * @param {string|null} [opts.userName=null] - User identifier for server-side logs
 */
export function useCorrectionEngine({
  active,
  appPoseName,
  poseId = null,
  sessionId = null,
  trackingState = null,
  currentStepIndex = 0,
  age = null,
  userName = null,
}) {
  const correctionPoseName = getCorrectionPoseName(appPoseName);
  const supported = Boolean(correctionPoseName);
  const asanaReference = useMemo(
    () => getAsanaReferenceByNameOrId(poseId || appPoseName),
    [poseId, appPoseName]
  );
  const ageGroup = useMemo(() => classifyUserAgeGroup(age), [age]);

  const latestLandmarksRef = useRef(null);
  const inFlightRef = useRef(false);
  const matchWindowRef = useRef([]);
  const pendingFeedbackRef = useRef({ text: "", count: 0 });
  const shownFeedbackRef = useRef("");

  // Stuck-user Ollama timer & request tracking refs
  const violationStartTimeRef = useRef(null);
  const lastOllamaRequestTimeRef = useRef(0);
  const isRequestingOllamaRef = useRef(false);
  const ollamaHoldUntilRef = useRef(0);
  const ollamaRequestSeqRef = useRef(0);
  const ollamaAbortRef = useRef(null);
  const latestDetectedErrorsRef = useRef([]);
  const activeRef = useRef(active);
  const appPoseNameRef = useRef(appPoseName);
  const poseIdRef = useRef(poseId);
  const sessionIdRef = useRef(sessionId);

  activeRef.current = active;
  appPoseNameRef.current = appPoseName;
  poseIdRef.current = poseId;
  sessionIdRef.current = sessionId;

  const [state, setState] = useState({
    status: supported ? CORRECTION_STATUS.IDLE : CORRECTION_STATUS.UNAVAILABLE,
    engineOnline: true,
    matchConfidence: null,
    feedback: null,
    corrections: [],
    stepText: null,
    idealLandmarks: null,
    targetAngles: null,
    liveAngles: null,
    descriptorDeviations: [],
    ytAngleScore: null,
  });

  const [ollamaCoaching, setOllamaCoaching] = useState(INITIAL_OLLAMA_STATE);

  /** Called by the MediaPipe frame loop with the latest 33 landmarks. */
  const pushLandmarks = useCallback((landmarks) => {
    latestLandmarksRef.current = landmarks;
  }, []);

  // Reset rolling state and abort any pending Ollama request when pose, step, or `active` changes
  useEffect(() => {
    matchWindowRef.current = [];
    pendingFeedbackRef.current = { text: "", count: 0 };
    shownFeedbackRef.current = "";
    latestLandmarksRef.current = null;
    violationStartTimeRef.current = null;
    isRequestingOllamaRef.current = false;
    ollamaHoldUntilRef.current = 0;
    latestDetectedErrorsRef.current = [];
    ollamaRequestSeqRef.current += 1;

    if (ollamaAbortRef.current) {
      ollamaAbortRef.current.abort();
      ollamaAbortRef.current = null;
    }

    setOllamaCoaching(INITIAL_OLLAMA_STATE);

    if (!supported) {
      setState((prev) => ({
        ...prev,
        status: CORRECTION_STATUS.UNAVAILABLE,
        matchConfidence: null,
        feedback: null,
        corrections: [],
        stepText: null,
        idealLandmarks: null,
        targetAngles: null,
        liveAngles: null,
        descriptorDeviations: [],
        ytAngleScore: null,
      }));
    } else if (!active) {
      setState((prev) => ({
        ...prev,
        status: CORRECTION_STATUS.IDLE,
        matchConfidence: null,
        feedback: null,
        corrections: [],
        stepText: null,
        idealLandmarks: null,
        targetAngles: null,
        liveAngles: null,
        descriptorDeviations: [],
        ytAngleScore: null,
      }));
    } else {
      setState((prev) => ({
        ...prev,
        status: CORRECTION_STATUS.DETECTING,
        matchConfidence: null,
        feedback: null,
        corrections: [],
      }));
    }
  }, [active, correctionPoseName, currentStepIndex, supported, appPoseName, poseId]);

  useEffect(() => {
    if (!active || !supported) return undefined;

    let stopped = false;

    const triggerOllamaStuckCoaching = async (lm, detectedErrorsSnapshot) => {
      const now = Date.now();
      if (
        stopped ||
        !activeRef.current ||
        isRequestingOllamaRef.current ||
        now - lastOllamaRequestTimeRef.current < OLLAMA_COOLDOWN_MS
      ) {
        return;
      }

      isRequestingOllamaRef.current = true;
      const reqId = ++ollamaRequestSeqRef.current;
      const reqPoseName = appPoseNameRef.current;
      const reqPoseId = poseIdRef.current || asanaReference?.id || null;
      const reqSessionId = sessionIdRef.current || null;

      if (ollamaAbortRef.current) {
        ollamaAbortRef.current.abort();
      }
      const abortController = new AbortController();
      ollamaAbortRef.current = abortController;

      setOllamaCoaching((prev) => ({
        ...prev,
        loading: true,
        poseId: reqPoseId,
        poseName: reqPoseName,
        correctionPoseName,
        sessionId: reqSessionId,
        requestId: reqId,
      }));

      try {
        const consultantCriteria = asanaReference
          ? [
              `Final Posture: ${asanaReference.finalPosture}`,
              `Correctness Criteria: ${asanaReference.correctnessCriteria.join(" | ")}`,
              ageGroup === "40plus" && asanaReference.correctionCues?.over40?.length
                ? `Age 40+ Guidance: ${asanaReference.correctionCues.over40.join(" ")}`
                : asanaReference.correctionCues?.under40?.length
                ? `Under-40 Guidance: ${asanaReference.correctionCues.under40.join(" ")}`
                : "",
            ]
              .filter(Boolean)
              .join("\n")
          : undefined;

        const res = await fetch("/correction-api/ollama-feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abortController.signal,
          body: JSON.stringify({
            poseName: correctionPoseName,
            appPoseName: reqPoseName,
            poseId: reqPoseId,
            sessionId: reqSessionId,
            trackingState: trackingState || "RECORDING_AND_TRACKING",
            requestId: reqId,
            currentStepIndex,
            landmarks: lm,
            age,
            userName,
            detectedErrors: detectedErrorsSnapshot,
            consultantCriteria,
          }),
        });

        // Validate that session, pose, recording state, and requestId are still current
        if (
          stopped ||
          !activeRef.current ||
          reqId !== ollamaRequestSeqRef.current ||
          appPoseNameRef.current !== reqPoseName
        ) {
          return;
        }

        if (!res.ok) {
          setOllamaCoaching((prev) => ({ ...prev, loading: false }));
          return;
        }

        const data = await res.json();
        if (
          stopped ||
          !activeRef.current ||
          reqId !== ollamaRequestSeqRef.current ||
          appPoseNameRef.current !== reqPoseName ||
          !data?.success ||
          !data?.analysis?.feedback
        ) {
          setOllamaCoaching((prev) => ({ ...prev, loading: false }));
          return;
        }

        const coachTip = String(data.analysis.feedback).trim();
        lastOllamaRequestTimeRef.current = Date.now();
        ollamaHoldUntilRef.current = Date.now() + OLLAMA_FEEDBACK_HOLD_MS;
        shownFeedbackRef.current = coachTip;

        setOllamaCoaching({
          active: true,
          loading: false,
          feedback: coachTip,
          stepComplete: Boolean(data.analysis.stepComplete),
          poseId: data.poseId || reqPoseId,
          poseName: reqPoseName,
          correctionPoseName,
          sessionId: data.sessionId || reqSessionId,
          requestId: reqId,
          ageGroup: data.ageGroup || ageGroup,
          model: data.model || "llama3.2",
          timestamp: Date.now(),
        });

        setState((prev) => ({
          ...prev,
          feedback: coachTip,
          corrections:
            prev.corrections && prev.corrections.length > 0
              ? [coachTip, ...prev.corrections.filter((c) => c !== coachTip)].slice(0, 4)
              : [coachTip],
        }));
      } catch (err) {
        if (err?.name !== "AbortError" && !stopped) {
          setOllamaCoaching((prev) => ({ ...prev, loading: false }));
        }
      } finally {
        isRequestingOllamaRef.current = false;
      }
    };

    const tick = async () => {
      if (stopped || inFlightRef.current) return;

      const lm = latestLandmarksRef.current;
      if (!lm || !areKeyJointsVisible(lm)) {
        matchWindowRef.current = [];
        violationStartTimeRef.current = null;
        setState((prev) => ({
          ...prev,
          status: CORRECTION_STATUS.NOT_DETECTED,
          matchConfidence: null,
          feedback:
            "Step into frame so your shoulders, hips, and knees are clearly visible.",
          corrections: [],
        }));
        return;
      }

      inFlightRef.current = true;
      try {
        const res = await fetch("/correction-api/analyze-frame", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            poseName: correctionPoseName,
            currentStepIndex,
            landmarks: lm,
            age,
            userName,
          }),
        });

        if (stopped) return;

        if (!res.ok) {
          setState((prev) => ({
            ...prev,
            status: CORRECTION_STATUS.ERROR,
            engineOnline: false,
          }));
          return;
        }

        const data = await res.json();
        if (stopped || !data?.success) return;

        const {
          isMatch,
          matchConfidence = 0,
          feedback = "",
          ytCorrections = [],
          idealLandmarks = null,
          targetAngles = null,
          liveAngles = null,
          descriptorDeviations = [],
          ytAngleScore = null,
        } = data.analysis || {};

        // 1. Temporal smoothing over a rolling 6-frame window
        const win = matchWindowRef.current;
        const frameMatched =
          Boolean(isMatch) && matchConfidence >= MATCH_CONF_THRESHOLD;
        win.push(frameMatched);
        if (win.length > WINDOW_SIZE) win.shift();
        const matches = win.filter(Boolean).length;
        const stepComplete =
          win.length >= REQUIRED_MATCHES && matches >= REQUIRED_MATCHES;

        const now = Date.now();
        const isHoldingOllamaTip = now < ollamaHoldUntilRef.current;

        // 2. Debounce rule-based feedback text so the panel doesn't flicker every 500ms
        if (stepComplete) {
          pendingFeedbackRef.current = { text: "", count: 0 };
          shownFeedbackRef.current = "Looking good — hold the position!";
          violationStartTimeRef.current = null;
          ollamaHoldUntilRef.current = 0;
          setOllamaCoaching((prev) =>
            prev.active || prev.loading ? INITIAL_OLLAMA_STATE : prev
          );
        } else if (!isHoldingOllamaTip) {
          if (ollamaCoaching.active) {
            setOllamaCoaching((prev) =>
              prev.active ? { ...prev, active: false } : prev
            );
          }
          const pend = pendingFeedbackRef.current;
          if (feedback === pend.text) {
            pend.count += 1;
          } else {
            pend.text = feedback;
            pend.count = 1;
          }
          if (
            pend.count >= FEEDBACK_DEBOUNCE_FRAMES ||
            !shownFeedbackRef.current
          ) {
            shownFeedbackRef.current = feedback;
          }
        }

        // Build consolidated list of detected errors for UI + Ollama stuck-user context
        const devPhrases = Array.isArray(descriptorDeviations)
          ? descriptorDeviations.map((d) => d?.phrase).filter(Boolean)
          : [];
        const combinedErrors = Array.from(
          new Set([...devPhrases, ...(ytCorrections || []), feedback].filter(Boolean))
        ).filter((msg) => !msg.toLowerCase().includes("looking good"));
        latestDetectedErrorsRef.current = combinedErrors;

        // 3. Stuck-User Violation Timer (>= 3000 ms continuous violation triggers local Ollama coach)
        if (!stepComplete) {
          if (violationStartTimeRef.current === null) {
            violationStartTimeRef.current = now;
          } else if (now - violationStartTimeRef.current >= OLLAMA_STUCK_TRIGGER_MS) {
            void triggerOllamaStuckCoaching(lm, combinedErrors);
          }
        }

        setState({
          status: stepComplete
            ? CORRECTION_STATUS.GOOD_FORM
            : CORRECTION_STATUS.ADJUST,
          engineOnline: true,
          matchConfidence,
          feedback: shownFeedbackRef.current || feedback,
          corrections: stepComplete
            ? []
            : isHoldingOllamaTip && ollamaCoaching.feedback
            ? [
                ollamaCoaching.feedback,
                ...(ytCorrections || []).filter((c) => c !== ollamaCoaching.feedback),
              ].slice(0, 4)
            : ytCorrections,
          stepText: data.stepText || null,
          idealLandmarks,
          targetAngles,
          liveAngles,
          descriptorDeviations,
          ytAngleScore,
        });
      } catch {
        if (stopped) return;
        setState((prev) => ({
          ...prev,
          status: CORRECTION_STATUS.ERROR,
          engineOnline: false,
        }));
      } finally {
        inFlightRef.current = false;
      }
    };

    const intervalId = window.setInterval(tick, POLL_INTERVAL_MS);
    void tick();

    return () => {
      stopped = true;
      window.clearInterval(intervalId);
      inFlightRef.current = false;
      if (ollamaAbortRef.current) {
        ollamaAbortRef.current.abort();
        ollamaAbortRef.current = null;
      }
    };
  }, [
    active,
    supported,
    correctionPoseName,
    currentStepIndex,
    age,
    ageGroup,
    userName,
    asanaReference,
    trackingState,
    ollamaCoaching.active,
    ollamaCoaching.feedback,
  ]);

  return {
    pushLandmarks,
    status: state.status,
    supported,
    engineOnline: state.engineOnline,
    matchConfidence: state.matchConfidence,
    feedback: state.feedback,
    corrections: state.corrections,
    stepText: state.stepText,
    idealLandmarks: state.idealLandmarks,
    targetAngles: state.targetAngles,
    liveAngles: state.liveAngles,
    descriptorDeviations: state.descriptorDeviations,
    ytAngleScore: state.ytAngleScore,
    correctionPoseName,
    ollamaCoaching,
    ageGroup,
    asanaReference,
  };
}
