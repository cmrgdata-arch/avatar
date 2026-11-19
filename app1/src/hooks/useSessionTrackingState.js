/**
 * useSessionTrackingState.js
 * Central Session & Full-Body Tracking State Manager (Single Source of Truth).
 *
 * Enforces:
 * 1. Recording state (`isRecording`) and full-body tracking state (`isFullBodyDetected`,
 *    `isTrackingStable`) are managed centrally and independently.
 * 2. Complete full-body validation across all required anatomical regions:
 *    - Head & face region (nose + eyes/ears)
 *    - Both shoulders (11, 12)
 *    - Both elbows (13, 14)
 *    - Both wrists/hands (15, 16 + hand landmarks 17..22)
 *    - Both hips (23, 24)
 *    - Both knees (25, 26)
 *    - Both ankles/feet (27, 28 + foot landmarks 29..32)
 *    Plus normalized camera-frame boundary verification so cut-off limbs are rejected.
 * 3. Temporal stability confirmation window (~600 ms, within 500-800 ms) before enabling
 *    or reacquiring tracking, plus a short single-frame drop grace period (220 ms) to
 *    eliminate MediaPipe 1-frame flicker without ever using stale landmarks for corrections.
 * 4. Effective mirroring condition:
 *      `isMirroringEnabled = isRecording && isFullBodyDetected && isTrackingStable`
 *    Effective feedback condition:
 *      `isFeedbackEnabled  = isRecording && isFullBodyDetected && isTrackingStable`
 *    Effective voice condition:
 *      `isVoiceEnabled     = isRecording && isFullBodyDetected && isTrackingStable && voiceToggle`
 */

import { useCallback, useEffect, useRef, useState } from "react";

export const SESSION_TRACKING_STATES = {
  IDLE: "IDLE",
  WAITING_FOR_FULL_BODY: "WAITING_FOR_FULL_BODY",
  READY_TO_RECORD: "READY_TO_RECORD",
  RECORDING_AND_TRACKING: "RECORDING_AND_TRACKING",
  RECORDING_TRACKING_LOST: "RECORDING_TRACKING_LOST",
  SESSION_STOPPED: "SESSION_STOPPED",
};

export const SESSION_STATE = SESSION_TRACKING_STATES;

export const FULL_BODY_MESSAGES = {
  POSITION_BODY: "Position your full body inside the camera frame",
  READY_TO_RECORD: "Full body detected — press Start Recording to begin",
  TRACKING_LOST: "Full body not detected – please return to the camera frame",
  SESSION_STOPPED: "Session stopped — press Start Recording to practice again",
};

// Required landmark indices per anatomical region
const REQUIRED_MAIN_INDICES = [
  0, // Nose (Head)
  11, 12, // Left & Right Shoulders
  13, 14, // Left & Right Elbows
  15, 16, // Left & Right Wrists
  23, 24, // Left & Right Hips
  25, 26, // Left & Right Knees
  27, 28, // Left & Right Ankles
];

const HEAD_EXTRA_INDICES = [1, 2, 3, 4, 5, 6, 7, 8];
const LEFT_HAND_INDICES = [17, 19, 21];
const RIGHT_HAND_INDICES = [18, 20, 22];
const LEFT_FOOT_INDICES = [29, 31];
const RIGHT_FOOT_INDICES = [30, 32];

/**
 * Validates whether all required full-body regions are visible and inside the camera frame.
 *
 * @param {Array<{x:number, y:number, z?:number, visibility?:number}>} landmarks
 * @param {object} [opts]
 * @param {number} [opts.minVisibility=0.50]
 * @param {number} [opts.margin=0.012]
 * @returns {{ valid: boolean, missingRegions: string[] }}
 */
export function validateFullBodyLandmarks(landmarks, opts = {}) {
  if (!Array.isArray(landmarks) || landmarks.length < 29) {
    return { valid: false, missingRegions: ["full_body"] };
  }

  const minVis = opts.minVisibility ?? 0.50;
  const extremityMinVis = Math.max(0.38, minVis - 0.08);
  const margin = opts.margin ?? 0.012;
  const maxCoord = 1.0 - margin;

  const isPointValid = (idx, threshold = minVis) => {
    const lm = landmarks[idx];
    if (!lm || typeof lm.x !== "number" || typeof lm.y !== "number") return false;
    const vis = lm.visibility ?? lm.presence ?? 1.0;
    if (vis < threshold) return false;
    if (lm.x < margin || lm.x > maxCoord || lm.y < margin || lm.y > maxCoord) {
      return false;
    }
    return true;
  };

  const missingRegions = [];

  // 1. Head & Face region
  const noseOk = isPointValid(0, minVis);
  const faceExtraOk = HEAD_EXTRA_INDICES.some((idx) => isPointValid(idx, extremityMinVis));
  if (!noseOk || !faceExtraOk) {
    missingRegions.push("head");
  }

  // 2. Both Shoulders
  if (!isPointValid(11, minVis) || !isPointValid(12, minVis)) {
    missingRegions.push("shoulders");
  }

  // 3. Both Elbows
  if (!isPointValid(13, minVis) || !isPointValid(14, minVis)) {
    missingRegions.push("elbows");
  }

  // 4. Both Wrists / Hands
  const lWristOk = isPointValid(15, minVis);
  const rWristOk = isPointValid(16, minVis);
  const lHandOk =
    landmarks.length < 22 ||
    LEFT_HAND_INDICES.some((idx) => isPointValid(idx, extremityMinVis));
  const rHandOk =
    landmarks.length < 23 ||
    RIGHT_HAND_INDICES.some((idx) => isPointValid(idx, extremityMinVis));
  if (!lWristOk || !rWristOk || !lHandOk || !rHandOk) {
    missingRegions.push("hands");
  }

  // 5. Both Hips
  if (!isPointValid(23, minVis) || !isPointValid(24, minVis)) {
    missingRegions.push("hips");
  }

  // 6. Both Knees
  if (!isPointValid(25, minVis) || !isPointValid(26, minVis)) {
    missingRegions.push("knees");
  }

  // 7. Both Ankles / Feet
  const lAnkleOk = isPointValid(27, extremityMinVis);
  const rAnkleOk = isPointValid(28, extremityMinVis);
  const lFootOk =
    landmarks.length < 32 ||
    LEFT_FOOT_INDICES.some((idx) => isPointValid(idx, extremityMinVis * 0.9));
  const rFootOk =
    landmarks.length < 33 ||
    RIGHT_FOOT_INDICES.some((idx) => isPointValid(idx, extremityMinVis * 0.9));
  if (!lAnkleOk || !rAnkleOk || !lFootOk || !rFootOk) {
    missingRegions.push("feet");
  }

  // Check anatomical proportion sanity (full body must span a meaningful vertical or horizontal fraction)
  if (missingRegions.length === 0) {
    const xs = REQUIRED_MAIN_INDICES.map((i) => landmarks[i].x);
    const ys = REQUIRED_MAIN_INDICES.map((i) => landmarks[i].y);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    const maxSpan = Math.max(spanX, spanY);
    if (maxSpan < 0.22) {
      missingRegions.push("distance_too_far");
    }
  }

  return {
    valid: missingRegions.length === 0,
    missingRegions,
  };
}

/**
 * Pure deterministic state machine for central session & full-body tracking control.
 * Can be used directly in automated verification tests as well as inside React hooks.
 */
export class SessionTrackingStateMachine {
  constructor(options = {}) {
    this.confirmWindowMs = options.confirmWindowMs ?? options.stabilityWindowMs ?? 600; // 500-800 ms stable full-body confirmation
    this.lossGraceMs = options.lossGraceMs ?? 220; // Short anti-flicker grace for 1-2 dropped frames
    this.staleTimeoutMs = options.staleTimeoutMs ?? 350;
    this.minVisibilityEnter = options.minVisibilityEnter ?? 0.50;
    this.minVisibilityHold = options.minVisibilityHold ?? 0.42;
    this.voiceEnabled = options.voiceEnabled ?? true;

    this.reset();
  }

  reset() {
    this.isRecording = false;
    this.hasStoppedRecording = false;
    this.hasAcquiredDuringRecording = false;
    this.isFullBodyDetected = false;
    this.isTrackingStable = false;
    this.validSinceMs = null;
    this.invalidSinceMs = null;
    this.lastFrameMs = null;
    this.lastValidLandmarks = null;
    this.lastValidWorldLandmarks = null;
    this.missingRegions = ["full_body"];
    this.sessionState = SESSION_TRACKING_STATES.WAITING_FOR_FULL_BODY;
  }

  setRecording(isRecording, nowMs = performance.now()) {
    const nextRec = Boolean(isRecording);
    if (this.isRecording && !nextRec) {
      this.hasStoppedRecording = true;
      this.hasAcquiredDuringRecording = false;
    } else if (!this.isRecording && nextRec) {
      this.hasStoppedRecording = false;
      this.hasAcquiredDuringRecording = Boolean(
        this.isFullBodyDetected && this.isTrackingStable
      );
    }
    this.isRecording = nextRec;
    return this._computeSnapshot(nowMs);
  }

  markSessionStopped(nowMs = performance.now()) {
    this.isRecording = false;
    this.hasStoppedRecording = true;
    this.lastValidLandmarks = null;
    this.lastValidWorldLandmarks = null;
    return this._computeSnapshot(nowMs);
  }

  processLandmarks(landmarks, worldLandmarks = null, nowMs = performance.now()) {
    return this.processFrame(landmarks, worldLandmarks, nowMs);
  }

  /**
   * Feeds a frame (or null when no person is detected) and updates stability state.
   */
  processFrame(landmarks, worldLandmarks = null, nowMs = performance.now()) {
    this.lastFrameMs = nowMs;

    const minVis = this.isTrackingStable
      ? this.minVisibilityHold
      : this.minVisibilityEnter;

    const check = validateFullBodyLandmarks(landmarks, { minVisibility: minVis });
    this.missingRegions = check.missingRegions;

    if (check.valid) {
      this.invalidSinceMs = null;
      this.lastValidLandmarks = landmarks;
      this.lastValidWorldLandmarks = worldLandmarks;

      if (this.validSinceMs === null) {
        this.validSinceMs = nowMs;
      }

      const stableDuration = nowMs - this.validSinceMs;
      if (stableDuration >= this.confirmWindowMs) {
        this.isFullBodyDetected = true;
        this.isTrackingStable = true;
      }
    } else {
      // Frame is incomplete or out of bounds
      if (this.isTrackingStable) {
        if (this.invalidSinceMs === null) {
          this.invalidSinceMs = nowMs;
        }
        // Only allow a tiny grace window if landmarks exist; if completely empty or past grace, drop immediately
        const graceLimit = Array.isArray(landmarks) ? this.lossGraceMs : 120;
        if (nowMs - this.invalidSinceMs >= graceLimit) {
          this.isFullBodyDetected = false;
          this.isTrackingStable = false;
          this.validSinceMs = null;
          this.lastValidLandmarks = null;
          this.lastValidWorldLandmarks = null;
        }
      } else {
        this.validSinceMs = null;
        this.isFullBodyDetected = false;
        this.isTrackingStable = false;
        this.lastValidLandmarks = null;
        this.lastValidWorldLandmarks = null;
      }
    }

    return this._computeSnapshot(nowMs);
  }

  /**
   * Periodic watchdog check to ensure that if MediaPipe stops delivering callbacks
   * (e.g. user walked completely out of frame and no landmarks are emitted),
   * tracking is marked lost after `staleTimeoutMs`.
   */
  checkStale(nowMs = performance.now()) {
    if (
      this.lastFrameMs !== null &&
      nowMs - this.lastFrameMs > this.staleTimeoutMs
    ) {
      this.isFullBodyDetected = false;
      this.isTrackingStable = false;
      this.validSinceMs = null;
      this.lastValidLandmarks = null;
      this.lastValidWorldLandmarks = null;
      this.missingRegions = ["full_body"];
    }
    return this._computeSnapshot(nowMs);
  }

  _computeSnapshot(nowMs = performance.now()) {
    const trackingOk = Boolean(this.isFullBodyDetected && this.isTrackingStable);

    let sessionState = SESSION_TRACKING_STATES.WAITING_FOR_FULL_BODY;
    let statusMessage = FULL_BODY_MESSAGES.POSITION_BODY;

    if (this.isRecording) {
      if (trackingOk) {
        this.hasAcquiredDuringRecording = true;
        sessionState = SESSION_TRACKING_STATES.RECORDING_AND_TRACKING;
        statusMessage = "";
      } else if (this.hasAcquiredDuringRecording) {
        sessionState = SESSION_TRACKING_STATES.RECORDING_TRACKING_LOST;
        statusMessage = FULL_BODY_MESSAGES.TRACKING_LOST;
      } else {
        sessionState = SESSION_TRACKING_STATES.WAITING_FOR_FULL_BODY;
        statusMessage = FULL_BODY_MESSAGES.POSITION_BODY;
      }
    } else if (this.hasStoppedRecording) {
      sessionState = SESSION_TRACKING_STATES.SESSION_STOPPED;
      statusMessage = trackingOk
        ? FULL_BODY_MESSAGES.SESSION_STOPPED
        : FULL_BODY_MESSAGES.POSITION_BODY;
    } else {
      if (trackingOk) {
        sessionState = SESSION_TRACKING_STATES.READY_TO_RECORD;
        statusMessage = FULL_BODY_MESSAGES.READY_TO_RECORD;
      } else {
        sessionState = SESSION_TRACKING_STATES.WAITING_FOR_FULL_BODY;
        statusMessage = FULL_BODY_MESSAGES.POSITION_BODY;
      }
    }

    this.sessionState = sessionState;

    const effectiveActive = Boolean(
      this.isRecording && this.isFullBodyDetected && this.isTrackingStable
    );

    return {
      sessionState,
      isRecording: this.isRecording,
      isFullBodyDetected: this.isFullBodyDetected,
      isTrackingStable: this.isTrackingStable,
      isMirroringEnabled: effectiveActive,
      isFeedbackEnabled: effectiveActive,
      isVoiceEnabled: Boolean(effectiveActive && this.voiceEnabled),
      statusMessage,
      missingRegions: this.missingRegions,
      validLandmarks: effectiveActive ? this.lastValidLandmarks : null,
      validWorldLandmarks: effectiveActive ? this.lastValidWorldLandmarks : null,
      timestampMs: nowMs,
    };
  }
}

/**
 * React hook wrapping `SessionTrackingStateMachine` as a single source of truth
 * for the practice screen.
 */
export function useSessionTrackingState({
  isRecording = false,
  voiceEnabled = true,
  confirmWindowMs = 600,
  lossGraceMs = 220,
} = {}) {
  const machineRef = useRef(null);
  if (!machineRef.current) {
    machineRef.current = new SessionTrackingStateMachine({
      confirmWindowMs,
      lossGraceMs,
      voiceEnabled,
    });
  }
  machineRef.current.voiceEnabled = voiceEnabled;

  const [snapshot, setSnapshot] = useState(() =>
    machineRef.current._computeSnapshot()
  );
  const lastUiSyncRef = useRef(0);

  const syncSnapshotToReact = useCallback((nextSnap, force = false) => {
    const now = performance.now();
    setSnapshot((prev) => {
      const stateChanged =
        prev.sessionState !== nextSnap.sessionState ||
        prev.isRecording !== nextSnap.isRecording ||
        prev.isFullBodyDetected !== nextSnap.isFullBodyDetected ||
        prev.isTrackingStable !== nextSnap.isTrackingStable ||
        prev.isMirroringEnabled !== nextSnap.isMirroringEnabled ||
        prev.isFeedbackEnabled !== nextSnap.isFeedbackEnabled ||
        prev.statusMessage !== nextSnap.statusMessage;

      if (force || stateChanged || now - lastUiSyncRef.current >= 150) {
        lastUiSyncRef.current = now;
        return nextSnap;
      }
      return prev;
    });
  }, []);

  useEffect(() => {
    const nextSnap = machineRef.current.setRecording(isRecording, performance.now());
    syncSnapshotToReact(nextSnap, true);
  }, [isRecording, syncSnapshotToReact]);

  // Watchdog interval for when MediaPipe stops emitting frames (person walked completely out of view)
  useEffect(() => {
    const id = window.setInterval(() => {
      const nextSnap = machineRef.current.checkStale(performance.now());
      syncSnapshotToReact(nextSnap, false);
    }, 150);
    return () => window.clearInterval(id);
  }, [syncSnapshotToReact]);

  const processFrame = useCallback(
    (landmarks, worldLandmarks = null) => {
      const nextSnap = machineRef.current.processFrame(
        landmarks,
        worldLandmarks,
        performance.now()
      );
      syncSnapshotToReact(nextSnap, false);
      return nextSnap;
    },
    [syncSnapshotToReact]
  );

  const markSessionStopped = useCallback(() => {
    const nextSnap = machineRef.current.markSessionStopped(performance.now());
    syncSnapshotToReact(nextSnap, true);
    return nextSnap;
  }, [syncSnapshotToReact]);

  const resetTracking = useCallback(() => {
    machineRef.current.reset();
    const nextSnap = machineRef.current._computeSnapshot(performance.now());
    syncSnapshotToReact(nextSnap, true);
  }, [syncSnapshotToReact]);

  const isVoiceActive = Boolean(snapshot.isFeedbackEnabled && voiceEnabled);

  return {
    ...snapshot,
    isVoiceEnabled: isVoiceActive,
    processFrame,
    markSessionStopped,
    resetTracking,
    reset: resetTracking,
    machineRef,
  };
}
