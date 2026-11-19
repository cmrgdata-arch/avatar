/**
 * yogatwin_angles.mjs
 *
 * Joint-angle analysis pipeline ported from YogaTwin-AI
 * (github.com/Amitha-13/YogaTwin-AI / app1/src/utils/practicePoseAnalysis.js
 *  and server/main6.py compare_pose logic).
 *
 * Uses RAW MediaPipe landmark objects (with .x, .y) — call these functions
 * BEFORE normalizeLandmarks(), passing req.body.landmarks directly.
 *
 * Angle indices (8 joints):
 *   [0] right elbow   [1] left elbow
 *   [2] right shoulder [3] left shoulder
 *   [4] right hip     [5] left hip
 *   [6] right knee    [7] left knee
 */

const LM = {
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,    RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,    RIGHT_WRIST: 16,
  LEFT_HIP: 23,      RIGHT_HIP: 24,
  LEFT_KNEE: 25,     RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,    RIGHT_ANKLE: 28,
};

export function calculateAngle(a, b, c) {
  let radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180) / Math.PI);
  if (angle > 180) angle = 360 - angle;
  return Math.round(angle);
}

export function computeEightAngles(landmarks) {
  const p = i => landmarks[i];
  return [
    calculateAngle(p(LM.RIGHT_SHOULDER),  p(LM.RIGHT_ELBOW),   p(LM.RIGHT_WRIST)),   // 0 right elbow
    calculateAngle(p(LM.LEFT_SHOULDER),   p(LM.LEFT_ELBOW),    p(LM.LEFT_WRIST)),    // 1 left elbow
    calculateAngle(p(LM.RIGHT_ELBOW),     p(LM.RIGHT_SHOULDER), p(LM.RIGHT_HIP)),    // 2 right shoulder
    calculateAngle(p(LM.LEFT_ELBOW),      p(LM.LEFT_SHOULDER),  p(LM.LEFT_HIP)),     // 3 left shoulder
    calculateAngle(p(LM.RIGHT_SHOULDER),  p(LM.RIGHT_HIP),     p(LM.RIGHT_KNEE)),    // 4 right hip
    calculateAngle(p(LM.LEFT_SHOULDER),   p(LM.LEFT_HIP),      p(LM.LEFT_KNEE)),     // 5 left hip
    calculateAngle(p(LM.RIGHT_HIP),       p(LM.RIGHT_KNEE),    p(LM.RIGHT_ANKLE)),   // 6 right knee
    calculateAngle(p(LM.LEFT_HIP),        p(LM.LEFT_KNEE),     p(LM.LEFT_ANKLE)),    // 7 left knee
  ];
}

export function diffCompareAngle(user, target) {
  const diffs = user.map((u, i) => {
    const mid = (u + target[i]) / 2;
    return mid === 0 ? 0 : Math.abs(u - target[i]) / mid;
  });
  const avg = diffs.reduce((s, x) => s + x, 0) / diffs.length;
  return Math.max(0, Math.min(1, 1 - avg));
}

const TOL = 15;
export function getCorrections(user, target) {
  const u = user, t = target;
  const out = [];
  if (u[0] < t[0] - TOL) out.push("Extend your right arm at the elbow");
  if (u[0] > t[0] + TOL) out.push("Bend your right arm slightly at the elbow");
  if (u[1] < t[1] - TOL) out.push("Extend your left arm at the elbow");
  if (u[1] > t[1] + TOL) out.push("Bend your left arm slightly at the elbow");
  if (u[2] < t[2] - TOL) out.push("Lift your right arm higher");
  if (u[2] > t[2] + TOL) out.push("Lower your right arm slightly");
  if (u[3] < t[3] - TOL) out.push("Lift your left arm higher");
  if (u[3] > t[3] + TOL) out.push("Lower your left arm slightly");
  if (u[4] < t[4] - TOL) out.push("Open your right hip — extend that side more");
  if (u[4] > t[4] + TOL) out.push("Reduce the angle at your right hip");
  if (u[5] < t[5] - TOL) out.push("Open your left hip — extend that side more");
  if (u[5] > t[5] + TOL) out.push("Reduce the angle at your left hip");
  if (u[6] < t[6] - TOL) out.push("Straighten your right knee");
  if (u[6] > t[6] + TOL) out.push("Bend your right knee more");
  if (u[7] < t[7] - TOL) out.push("Straighten your left knee");
  if (u[7] > t[7] + TOL) out.push("Bend your left knee more");
  return out;
}

export const POSE_TARGET_ANGLES = {
  // ── Standing ──────────────────────────────────────────────────────────────
  // Consultant-approved Tadasana: both feet grounded, arms raised overhead, fingers interlocked, palms facing upward
  'Tadasana (Mountain Pose)':
    [175, 175, 175, 175, 175, 175, 175, 175],

  'Tadasana (Mountain Pose)_Overhead':
    [175, 175, 175, 175, 175, 175, 175, 175],

  'Vrkasana (Tree Pose)':
    [165, 170, 160, 175, 110, 175, 165, 175],

  'Pada-hastasana (Hand-to-Foot Pose)':
    [175, 175, 165, 165, 80, 80, 170, 170],

  'Ardha Cakrasana (Half-Wheel Pose)':
    [160, 160, 60, 60, 165, 165, 175, 175],

  'Ardha Katichakrasana (Half Waist-Wheel Pose)':
    [175, 50, 165, 90, 175, 175, 175, 175],

  'Trikonasana (Triangle Pose)':
    [170, 170, 120, 120, 100, 170, 165, 165],

  'Parivritta Trikonasana (Revolved Triangle Pose)':
    [100, 170, 120, 120, 170, 100, 165, 165],

  // ── Sitting ───────────────────────────────────────────────────────────────
  'Ardha Ustrasana (Half Camel Pose)':
    [160, 160, 55, 55, 145, 145, 90, 90],

  'Vakrasana (Twisted Pose)':
    [160, 160, 130, 90, 90, 170, 130, 150],

  // ── Prone ─────────────────────────────────────────────────────────────────
  'Makarasana (Crocodile Pose)':
    [110, 110, 90, 90, 175, 175, 175, 175],

  'Bhujangasana (Cobra Pose)':
    [165, 165, 55, 55, 140, 140, 165, 165],

  // ── Supine ────────────────────────────────────────────────────────────────
  'Ardha Halasana (Half Plough Pose)':
    [175, 175, 135, 135, 90, 90, 175, 175],

  'Pavanamukthasana (Wind-Relieving Pose)':
    [130, 130, 45, 45, 75, 75, 65, 65],

  'Savasana (Corpse Pose)':
    [175, 175, 25, 25, 175, 175, 175, 175],
};

export function getTargetAngles(poseName) {
  return POSE_TARGET_ANGLES[poseName] ?? null;
}

export function keyJointVisibility(landmarks) {
  const indices = [
    LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER,
    LM.LEFT_ELBOW,    LM.RIGHT_ELBOW,
    LM.LEFT_HIP,      LM.RIGHT_HIP,
    LM.LEFT_KNEE,     LM.RIGHT_KNEE,
  ];
  return Math.min(...indices.map(i => landmarks[i]?.visibility ?? 0));
}
