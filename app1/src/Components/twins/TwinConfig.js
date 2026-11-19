/**
 * TwinConfig.js
 * Central configuration for the CMRG Yoga Assistant Digital Twin & Corrective Twin system.
 * No hard-coded magic numbers inside solver or controller components.
 */

export const TWIN_CONFIG = {
  // ── 1. Mirroring & Coordinate Mapping ──────────────────────────────────────
  /**
   * Central MIRROR_MODE configuration.
   * When true (default), mirrors camera X coordinates so the avatar acts as a
   * physical mirror facing the user: raising the user's physical right hand
   * raises the hand on the right side of the screen (the avatar's anatomical
   * LeftArm). When false, uses non-mirrored anatomical correspondence.
   */
  MIRROR_MODE: true,

  /** Scale factor applied to normalized 2D image-space depth (z) relative to torso length */
  IMAGE_DEPTH_SCALE: 0.16,

  /** Standard normalized avatar standing height in Three.js world units (meters) */
  TARGET_AVATAR_HEIGHT: 1.7,

  // ── 2. Landmark Confidence & Occlusion Handling ────────────────────────────
  /** Minimum MediaPipe visibility score (0..1) required to trust a landmark (Part 7 Section 8.1: 0.5) */
  LANDMARK_CONFIDENCE_THRESHOLD: 0.5,

  /** Time (ms) before missing/stale landmarks trigger smooth return to neutral standing pose */
  OCCLUSION_RETURN_TO_NEUTRAL_MS: 800,

  /** Slerp speed when returning smoothly to neutral standing pose during occlusion/exit */
  NEUTRAL_RETURN_SLERP: 0.14,

  // ── 3. One-Euro Filter Parameters (Low-Latency Landmark Smoothing) ─────────
  ONE_EURO_FILTER: {
    /** Minimum cutoff frequency (Hz) — higher = less lag at slow speeds */
    minCutoff: 1.6,
    /** Speed coefficient — higher = faster response during rapid movements */
    beta: 0.35,
    /** Derivative cutoff frequency (Hz) */
    dCutoff: 1.0,
  },

  // ── 4. Quaternion SLERP & Bone Transition Smoothing ────────────────────────
  /** Per-frame quaternion SLERP factor for Digital Twin (0..1) */
  DIGITAL_TWIN_SLERP: 0.38,

  /** Per-frame quaternion SLERP factor for Corrective Twin (smooth, calm demonstration) */
  CORRECTIVE_TWIN_SLERP: 0.18,

  /** Root hip translation smoothing factor */
  ROOT_POSITION_LERP: 0.25,

  /** Maximum horizontal root sway in meters from stage center */
  MAX_ROOT_HORIZONTAL_OFFSET: 0.32,

  // ── 5. Anatomical Joint Constraints (Radians) ──────────────────────────────
  JOINT_LIMITS: {
    /** Maximum head/neck rotation relative to chest */
    headMaxAngleRad: 0.78, // ~45 deg
    /** Maximum spine segment bend per bone */
    spineSegmentMaxRad: 0.55, // ~31 deg
    /** Minimum elbow interior angle (clamps elbow flexion to <= 150 deg, i.e., interior >= 30 deg) */
    elbowMinAngleRad: 0.52, // ~30 deg interior (150 deg flexion max)
    /** Maximum elbow extension (prevents elbow hyperextension/inversion) */
    elbowMaxAngleRad: 3.10, // ~178 deg
    /** Minimum knee interior angle */
    kneeMinAngleRad: 0.35, // ~20 deg
    /** Maximum knee extension (prevents knee bending backwards) */
    kneeMaxAngleRad: 3.10, // ~178 deg
    /** Maximum ankle dorsiflexion/plantarflexion from rest */
    ankleMaxAngleRad: 0.65, // ~37 deg
    /** Maximum clavicle/shoulder girdle shrug angle */
    clavicleMaxAngleRad: 0.42, // ~24 deg
  },

  // ── 6. Hand Joining & Foot Contact IK Parameters ───────────────────────────
  HAND_IK: {
    /**
     * Metric palm/wrist distance threshold (~10 cm) when worldLandmarks are available.
     */
    activationDistanceMeters: 0.11,
    /**
     * Normalized wrist/palm distance (in shoulder-width units, ~10-12 cm) at which
     * Namaste / Anjali Mudra / Prayer Pose hand-joining begins blending in.
     * Strictly small so hands-forward or hands-wide poses NEVER trigger prayer IK.
     */
    activationEnterRatio: 0.44,
    /** Normalized wrist-to-wrist distance at which palms are 100% joined */
    activationFullRatio: 0.26,
    /** Hysteresis padding when releasing joined hands so it never chatters */
    releaseHysteresisRatio: 0.08,
    /** Smooth blend duration (ms) for IK activation and release (Part 8 Section 9.1: ~150 ms) */
    blendDurationMs: 150,
    /** Half-gap between left and right wrist joint origins when palms touch (meters) */
    palmTouchHalfGapMeters: 0.022,
    /** Forward offset in front of sternum to prevent chest mesh penetration (meters) */
    chestClearanceOffsetMeters: 0.15,
    /** Tree Pose (Vrikshasana) foot-to-opposite-leg contact enter ratio (in hip-width units) */
    treePoseFootEnterRatio: 1.65,
    /** Tree Pose full contact ratio */
    treePoseFootFullRatio: 0.55,
    /** Tree Pose inner-thigh surface offset (meters) */
    treePoseThighSurfaceOffsetMeters: 0.055,
  },

  // ── 7. Corrective Twin Debounce, Hysteresis & Highlighting ─────────────────
  CORRECTIVE_TWIN: {
    /**
     * Error-state debounce (ms): an error must persist for ~400 ms before
     * activating the Corrective Twin (Part 9 Section 10.3: ~400 ms).
     */
    errorDebounceMs: 400,
    /**
     * Error-clearing hysteresis (ms): good form must persist for ~200 ms
     * before returning the Corrective Twin to idle/neutral (Part 9 Section 10.3: ~200 ms).
     */
    errorClearHysteresisMs: 200,
    /** Highlight color for corrected joints/bones on the Corrective Twin */
    highlightColorHex: 0x22ff88,
    /** Secondary glow color for Corrective Twin floor & skeleton */
    secondaryGlowHex: 0x10b981,
  },

  // ── 8. Gender-Based Avatar Asset Paths & Fallback ──────────────────────────
  AVATARS: {
    male: "/avatars/male.glb",
    female: "/avatars/female.glb",
    /** Safe fallback gender when user profile has no gender or "other" */
    fallbackGender: "female",
  },

  // ── 9. Performance & Full-Body + Overhead Reach Framing Settings ───────────
  RENDER: {
    maxPixelRatio: 2.0,
    /**
     * Framed for full 1.70m standing height + maximum overhead arm/hand extension (up to y = 2.22m)
     * + 10% margin above fingertips and below platform (y in [-0.22m, 2.38m]).
     */
    cameraFov: 34,
    cameraPosition: [0, 1.08, 4.25],
    cameraLookAt: [0, 1.04, 0],
    fullBodyMinY: -0.12,
    fullBodyMaxY: 2.25,
    fullBodyMaxHalfWidth: 1.08,
    framingMarginRatio: 0.10,
  },
};

/**
 * Resolves a user's stored gender string to a canonical "male" | "female" key.
 * Handles "male", "female", "Male", "Female", "M", "F", "other", null, undefined.
 */
export function resolveAvatarGender(rawGender) {
  const g = String(rawGender || "").trim().toLowerCase();
  if (g === "male" || g === "m") return "male";
  if (g === "female" || g === "f") return "female";
  return TWIN_CONFIG.AVATARS.fallbackGender;
}
