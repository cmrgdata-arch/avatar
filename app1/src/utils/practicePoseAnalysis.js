/**
 * Joint angles and correction messages aligned with server/main6.py (compare_pose).
 * Indices: [0] right elbow, [1] left elbow, [2] right shoulder, [3] left shoulder,
 * [4] right hip, [5] left hip, [6] right knee, [7] left knee.
 */

export const POSE_LM = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
};

export function calculateAngle(a, b, c) {
  const ax = a.x;
  const ay = a.y;
  const bx = b.x;
  const by = b.y;
  const cx = c.x;
  const cy = c.y;
  let radians =
    Math.atan2(cy - by, cx - bx) - Math.atan2(ay - by, ax - bx);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) angle = 360 - angle;
  return angle;
}

export function computeEightAngles(landmarks) {
  const p = (i) => landmarks[i];
  const rs = p(POSE_LM.RIGHT_SHOULDER);
  const re = p(POSE_LM.RIGHT_ELBOW);
  const rw = p(POSE_LM.RIGHT_WRIST);
  const ls = p(POSE_LM.LEFT_SHOULDER);
  const le = p(POSE_LM.LEFT_ELBOW);
  const lw = p(POSE_LM.LEFT_WRIST);
  const rh = p(POSE_LM.RIGHT_HIP);
  const lh = p(POSE_LM.LEFT_HIP);
  const rk = p(POSE_LM.RIGHT_KNEE);
  const lk = p(POSE_LM.LEFT_KNEE);
  const ra = p(POSE_LM.RIGHT_ANKLE);
  const la = p(POSE_LM.LEFT_ANKLE);

  return [
    Math.round(calculateAngle(rs, re, rw)),
    Math.round(calculateAngle(ls, le, lw)),
    Math.round(calculateAngle(re, rs, rh)),
    Math.round(calculateAngle(le, ls, lh)),
    Math.round(calculateAngle(rs, rh, rk)),
    Math.round(calculateAngle(ls, lh, lk)),
    Math.round(calculateAngle(rh, rk, ra)),
    Math.round(calculateAngle(lh, lk, la)),
  ];
}

function average(arr) {
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

/** Mirrors diff_compare_angle in main6.py */
export function diffCompareAngle(user, target) {
  if (!Array.isArray(user) || !Array.isArray(target) || user.length !== target.length) {
    return 1;
  }
  const diffs = [];
  for (let i = 0; i < user.length; i++) {
    const mid = (user[i] + target[i]) / 2;
    const z = mid === 0 ? 0 : Math.abs(user[i] - target[i]) / mid;
    diffs.push(z);
  }
  return average(diffs);
}

const ANGLE_TOL = 15;

/** Mirrors compare_pose feedback strings from main6.py */
export function getCorrections(angleUser, angleTarget) {
  if (!Array.isArray(angleUser) || !Array.isArray(angleTarget)) return [];
  const u = angleUser;
  const t = angleTarget;
  const out = [];

  if (u[0] < t[0] - ANGLE_TOL) out.push("Extend the right arm at elbow");
  if (u[0] > t[0] + ANGLE_TOL) out.push("Fold the right arm at elbow");
  if (u[1] < t[1] - ANGLE_TOL) out.push("Extend the left arm at elbow");
  if (u[1] > t[1] + ANGLE_TOL) out.push("Fold the left arm at elbow");
  if (u[2] < t[2] - ANGLE_TOL) out.push("Lift your right arm");
  if (u[2] > t[2] + ANGLE_TOL) out.push("Put your right arm down a little");
  if (u[3] < t[3] - ANGLE_TOL) out.push("Lift your left arm");
  if (u[3] > t[3] + ANGLE_TOL) out.push("Put your left arm down a little");
  if (u[4] < t[4] - ANGLE_TOL) out.push("Extend the angle at right hip");
  if (u[4] > t[4] + ANGLE_TOL) out.push("Reduce the angle at right hip");
  if (u[5] < t[5] - ANGLE_TOL) out.push("Extend the angle at left hip");
  if (u[5] > t[5] + ANGLE_TOL) out.push("Reduce the angle at left hip");
  if (u[6] < t[6] - ANGLE_TOL) out.push("Extend the angle of right knee");
  if (u[6] > t[6] + ANGLE_TOL) out.push("Reduce the angle at right knee");
  if (u[7] < t[7] - ANGLE_TOL) out.push("Extend the angle at left knee");
  if (u[7] > t[7] + ANGLE_TOL) out.push("Reduce the angle at left knee");

  return out;
}

export function minJointVisibility(landmarks, indices) {
  let m = 1;
  for (const i of indices) {
    const v = landmarks[i]?.visibility ?? 0;
    if (v < m) m = v;
  }
  return m;
}

/**
 * Classifies the live pose from 33 MediaPipe landmarks and 8 canonical joint angles.
 * Never hardcodes or defaults to "Mountain Pose".
 * Returns "Mountain Pose" ONLY when Tadasana criteria are genuinely met.
 * Returns "Detecting..." if confidence is insufficient or posture is ambiguous.
 *
 * @param {Array<{x:number,y:number,z?:number,visibility?:number}>} landmarks
 * @param {number[]} [precomputedAngles]
 * @returns {{ detectedPose: string, confidence: number }}
 */
export function classifyLiveAsana(landmarks, precomputedAngles) {
  if (!Array.isArray(landmarks) || landmarks.length < 29) {
    return { detectedPose: "—", confidence: 0 };
  }

  const coreVis = minJointVisibility(landmarks, [
    POSE_LM.LEFT_SHOULDER,
    POSE_LM.RIGHT_SHOULDER,
    POSE_LM.LEFT_HIP,
    POSE_LM.RIGHT_HIP,
  ]);
  if (coreVis < 0.45) {
    return { detectedPose: "—", confidence: 0 };
  }

  const angles = precomputedAngles || computeEightAngles(landmarks);
  const [rElbow, lElbow, rShoulder, lShoulder, rHip, lHip, rKnee, lKnee] = angles;

  const ls = landmarks[POSE_LM.LEFT_SHOULDER];
  const rs = landmarks[POSE_LM.RIGHT_SHOULDER];
  const lw = landmarks[POSE_LM.LEFT_WRIST];
  const rw = landmarks[POSE_LM.RIGHT_WRIST];
  const lh = landmarks[POSE_LM.LEFT_HIP];
  const rh = landmarks[POSE_LM.RIGHT_HIP];
  const la = landmarks[POSE_LM.LEFT_ANKLE];
  const ra = landmarks[POSE_LM.RIGHT_ANKLE];

  const shMidX = (ls.x + rs.x) * 0.5;
  const shMidY = (ls.y + rs.y) * 0.5;
  const hipMidX = (lh.x + rh.x) * 0.5;
  const hipMidY = (lh.y + rh.y) * 0.5;
  const ankMidX = (la.x + ra.x) * 0.5;
  const ankMidY = (la.y + ra.y) * 0.5;

  const shoulderWidth = Math.max(0.05, Math.hypot(ls.x - rs.x, ls.y - rs.y));
  const torsoLen = Math.max(0.08, Math.hypot(shMidX - hipMidX, shMidY - hipMidY));
  const ankleSpanX = Math.abs(la.x - ra.x);
  const ankleDiffY = Math.abs(la.y - ra.y);
  const bodySpanX = Math.abs(shMidX - ankMidX);
  const bodySpanY = Math.abs(shMidY - ankMidY);

  // 1. Horizontal / Floor poses (Supine & Prone)
  if (bodySpanX > bodySpanY * 1.15) {
    if (rKnee < 110 && lKnee < 110 && rHip < 115 && lHip < 115) {
      return { detectedPose: "Wind-Relieving Pose", confidence: 88 };
    }
    if ((rHip < 118 || lHip < 118) && rKnee > 145 && lKnee > 145) {
      return { detectedPose: "Half Plough Pose", confidence: 86 };
    }
    if (shMidY < hipMidY - 0.08 && (rHip < 162 || lHip < 162) && rShoulder < 95 && lShoulder < 95) {
      return { detectedPose: "Cobra Pose", confidence: 87 };
    }
    if (rElbow < 135 && lElbow < 135 && rShoulder > 65 && lShoulder > 65) {
      return { detectedPose: "Crocodile Pose", confidence: 84 };
    }
    if (rKnee > 155 && lKnee > 155 && rHip > 155 && lHip > 155) {
      return { detectedPose: "Corpse Pose", confidence: 90 };
    }
    return { detectedPose: "Detecting...", confidence: 40 };
  }

  // 2. Kneeling / Seated poses
  if (rKnee < 120 && lKnee < 120 && Math.abs(rKnee - lKnee) < 30 && rHip > 115 && lHip > 115) {
    return { detectedPose: "Half Camel Pose", confidence: 86 };
  }
  if ((rHip < 125 || lHip < 125) && Math.abs(rKnee - lKnee) >= 18 && Math.abs(rShoulder - lShoulder) >= 20) {
    return { detectedPose: "Twisted Pose", confidence: 85 };
  }

  // 3. Tree Pose (Vrikshasana): one leg genuinely bent with foot lifted high toward inner thigh/calf,
  // while the standing leg is straight and feet are NOT in a wide lunge stance.
  const kneeAsymmetry = Math.abs(rKnee - lKnee);
  if (
    ankleSpanX < 1.15 * shoulderWidth &&
    ankleDiffY > 0.18 * torsoLen &&
    kneeAsymmetry > 22 &&
    ((rKnee < 140 && lKnee > 152) || (lKnee < 140 && rKnee > 152))
  ) {
    return { detectedPose: "Tree Pose", confidence: 91 };
  }

  // 4. Hand-to-Foot Pose / Forward Fold (Pada-hastasana): deep hip flexion or torso folded down
  if (
    (rHip < 118 && lHip < 118 && rKnee > 135 && lKnee > 135) ||
    (shMidY > hipMidY - 0.18 * torsoLen && lw.y > hipMidY && rw.y > hipMidY)
  ) {
    return { detectedPose: "Hand-to-Foot Pose", confidence: 89 };
  }

  // 5. Wide-stance standing poses: Warrior I, Warrior II, Triangle Pose
  if (ankleSpanX > 1.18 * shoulderWidth) {
    const minKnee = Math.min(rKnee, lKnee);
    const maxKnee = Math.max(rKnee, lKnee);
    const armsHorizontal =
      rShoulder >= 65 && rShoulder <= 135 && lShoulder >= 65 && lShoulder <= 135;
    const armsOverhead =
      rShoulder > 135 && lShoulder > 135 && lw.y < shMidY && rw.y < shMidY;

    // Warrior I: front knee bent, back leg straight, both arms raised overhead
    if (minKnee < 148 && maxKnee > 148 && armsOverhead) {
      return { detectedPose: "Warrior I", confidence: 91 };
    }

    // Warrior II: front knee bent, back leg straight, both arms out near horizontal
    if (minKnee < 148 && maxKnee > 150 && armsHorizontal) {
      return { detectedPose: "Warrior II", confidence: 92 };
    }

    // Triangle Pose: both legs relatively straight, lateral trunk tilt or vertical wrist separation
    const wristVerticalSep = Math.abs(lw.y - rw.y);
    const hipAsymmetry = Math.abs(rHip - lHip);
    if (minKnee >= 125 && (wristVerticalSep > 0.55 * torsoLen || hipAsymmetry > 20)) {
      return { detectedPose: "Triangle Pose", confidence: 90 };
    }
  }

  // 6. Half Waist Wheel Pose / Side Bend (Ardha Katichakrasana): one arm raised overhead, other arm down at side, or lateral trunk bend
  const trunkLateralTilt = Math.abs(shMidX - hipMidX) > 0.16 * torsoLen;
  if (
    rKnee > 150 &&
    lKnee > 150 &&
    (((rShoulder > 130 && lShoulder < 70) || (lShoulder > 130 && rShoulder < 70)) ||
      (trunkLateralTilt && Math.abs(rShoulder - lShoulder) > 45))
  ) {
    return { detectedPose: "Half Waist Wheel Pose", confidence: 88 };
  }

  // 7. Half Wheel Pose (Ardha Chakrasana): hands supporting waist/lower back (elbows bent, wrists near hips)
  const wristsNearWaist =
    Math.abs(lw.y - hipMidY) < 0.32 * torsoLen &&
    Math.abs(rw.y - hipMidY) < 0.32 * torsoLen &&
    rElbow < 145 &&
    lElbow < 145;
  if (rKnee > 150 && lKnee > 150 && wristsNearWaist && rShoulder >= 15 && rShoulder <= 95) {
    return { detectedPose: "Half Wheel Pose", confidence: 86 };
  }

  // 8. Mountain Pose (Tadasana): strict verification!
  const legsStraight = rKnee >= 158 && lKnee >= 158 && rHip >= 158 && lHip >= 158;
  const spineUpright = Math.abs(shMidX - hipMidX) < 0.22 * torsoLen;
  const feetLevel = ankleDiffY < 0.09 * torsoLen && ankleSpanX <= 1.18 * shoulderWidth;
  const armsOverheadTadasana =
    rShoulder >= 145 && lShoulder >= 145 && rElbow >= 140 && lElbow >= 140;
  const armsAtSidesTadasana =
    rShoulder <= 35 && lShoulder <= 35 && rElbow >= 145 && lElbow >= 145;
  const armsPrayerChest =
    Math.hypot(lw.x - rw.x, lw.y - rw.y) < 0.45 * shoulderWidth &&
    lw.y > shMidY - 0.1 * torsoLen &&
    lw.y < hipMidY;

  if (
    legsStraight &&
    spineUpright &&
    feetLevel &&
    (armsOverheadTadasana || armsAtSidesTadasana || armsPrayerChest)
  ) {
    return { detectedPose: "Mountain Pose", confidence: 92 };
  }

  return { detectedPose: "Detecting...", confidence: 45 };
}
