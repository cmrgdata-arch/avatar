/**
 * DigitalTwin.js
 * Dedicated controller for the User's Real-Time Digital Twin.
 *
 * Strictly enforces:
 * - Receives ONLY live user pose coordinates from the DL/ML pose-estimation pipeline.
 * - Never receives corrected target coordinates.
 * - Mirrors the user's actual posture ONLY when `isMirroringEnabled` (`isRecording && isFullBodyDetected && isTrackingStable`) is true.
 * - Passes the active `poseName` into `AvatarRetargeter` so asana-specific hand/foot contact solvers
 *   (e.g. Tadasana overhead interlocked hands with upward-facing palms vs. Vrikshasana Namaste)
 *   use the exact consultant-approved hand configuration without overriding live limb tracking.
 * - When `isMirroringEnabled` is false (before recording starts, when full-body tracking is lost,
 *   or when recording stops), smoothly returns to and holds the calibrated neutral home-standing posture.
 */

import { AvatarRetargeter } from "./AvatarRetargeter.js";
import { TWIN_CONFIG } from "./TwinConfig.js";
import { isTreePoseName } from "./CorrectiveCoordinateAdapter.js";

export class DigitalTwinController {
  /**
   * @param {object} avatarInstance - Independent cloned avatar from `AvatarLoader`
   * @param {object} [options]
   */
  constructor(avatarInstance, options = {}) {
    this.id = "digital-twin";
    this.avatarInstance = avatarInstance;
    this.rootGroup = avatarInstance.rootGroup;
    this.bones = avatarInstance.bones;

    this.retargeter = new AvatarRetargeter(avatarInstance, {
      slerpFactor: options.slerpFactor ?? TWIN_CONFIG.DIGITAL_TWIN_SLERP,
      mirrorMode: options.mirrorMode ?? TWIN_CONFIG.MIRROR_MODE,
      minConfidence:
        options.minConfidence ?? TWIN_CONFIG.LANDMARK_CONFIDENCE_THRESHOLD,
    });

    this.latestLandmarks = null;
    this.latestWorldLandmarks = null;
    this.latestIsWorld = false;
    this.lastLandmarkTimeMs = 0;
    this.poseName = "";
    this.isMirroringEnabled = true;
    this.isTracking = false;

    // Start immediately in calibrated relaxed neutral standing posture (arms at sides, never T-pose)
    this.retargeter.snapToNeutralStandingPose();
  }

  /**
   * Sets the currently selected asana name so hand/foot contact IK uses the appropriate mode
   * (e.g. Tadasana overhead interlocked hands vs. Vrikshasana Namaste).
   */
  setPoseName(poseName = "") {
    if (poseName !== this.poseName) {
      this.poseName = poseName;
    }
  }

  /**
   * Sets whether live mirroring is enabled (`isRecording && isFullBodyDetected && isTrackingStable`).
   */
  setMirroringEnabled(enabled) {
    this.isMirroringEnabled = Boolean(enabled);
    if (!this.isMirroringEnabled) {
      this.latestLandmarks = null;
      this.latestWorldLandmarks = null;
    }
  }

  /**
   * Feeds live user landmarks (and optional metric worldLandmarks) from MediaPipe / DL / ML pipeline.
   */
  setLiveLandmarks(landmarks, isWorld = false, worldLandmarks = null, nowMs = performance.now()) {
    if (!this.isMirroringEnabled) {
      this.latestLandmarks = null;
      this.latestWorldLandmarks = null;
      return;
    }
    if (Array.isArray(landmarks) && landmarks.length >= 33) {
      this.latestLandmarks = landmarks;
      this.latestWorldLandmarks =
        Array.isArray(worldLandmarks) && worldLandmarks.length >= 33
          ? worldLandmarks
          : null;
      this.latestIsWorld = Boolean(isWorld);
      this.lastLandmarkTimeMs = nowMs;
    } else {
      this.latestLandmarks = null;
      this.latestWorldLandmarks = null;
    }
  }

  /**
   * Per-frame update called by `TwinAnimationController`.
   * @param {number} nowMs - Current timestamp from `requestAnimationFrame`
   */
  update(nowMs = performance.now()) {
    const ageMs = nowMs - this.lastLandmarkTimeMs;
    if (
      !this.isMirroringEnabled ||
      !this.latestLandmarks ||
      ageMs > TWIN_CONFIG.OCCLUSION_RETURN_TO_NEUTRAL_MS
    ) {
      this.isTracking = false;
      this.retargeter.transitionTowardNeutral(
        TWIN_CONFIG.NEUTRAL_RETURN_TO_HOME_SLERP || TWIN_CONFIG.NEUTRAL_RETURN_SLERP
      );
      return;
    }

    const applied = this.retargeter.applyLandmarks(this.latestLandmarks, {
      isWorld: this.latestIsWorld,
      worldLandmarks: this.latestWorldLandmarks,
      timestampSec: nowMs * 0.001,
      poseName: this.poseName,
      allowTreePoseIK: !this.poseName || isTreePoseName(this.poseName),
    });
    this.isTracking = applied;
  }

  reset() {
    this.latestLandmarks = null;
    this.latestWorldLandmarks = null;
    this.isTracking = false;
    this.retargeter.snapToNeutralStandingPose();
  }
}
