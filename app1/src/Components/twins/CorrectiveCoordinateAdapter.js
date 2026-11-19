/**
 * CorrectiveCoordinateAdapter.js
 * Thin, deterministic read-only adapter between the existing Corrective-Feedback Engine output
 * (including Ollama stuck-user coaching events) and the Corrective Twin retargeting system.
 *
 * Strictly enforces:
 * 1. Never invents a new correction algorithm; reads the existing correction engine's
 *    detected errors (`corrections`, `feedback`, `descriptorDeviations`, `targetAngles`,
 *    `liveAngles`, `idealLandmarks`, `status`, and `ollamaCoaching`).
 * 2. Uses the consultant-approved validated target pose (`buildValidatedAsanaTargetLandmarks`)
 *    for each of the 9 supported asanas so Tadasana always demonstrates overhead interlocked
 *    fingers with palms facing upward (+Y), Vrikshasana demonstrates raised foot on inner thigh
 *    with Namaste palms, Padahastasana demonstrates hip-hinged forward fold, Ardha Chakrasana
 *    demonstrates lower-back-supported backbend, Trikonasana demonstrates wide-stance lateral bend
 *    with opposing vertical arms, Pavanamukthasana demonstrates knees drawn to chest with clasped
 *    shins, and Savasana demonstrates supine relaxation with palms facing upward.
 * 3. Immediately clears any previous correction state when `poseName` changes or when
 *    `isFeedbackEnabled` becomes false (before recording starts, when full-body tracking
 *    is lost, or when recording stops).
 * 4. Applies configurable error-state debounce (`TWIN_CONFIG.CORRECTIVE_TWIN.errorDebounceMs` = 400 ms)
 *    before activating the Corrective Twin so single-frame noise never triggers a twitch.
 * 5. Applies error-clearing hysteresis (`TWIN_CONFIG.CORRECTIVE_TWIN.errorClearHysteresisMs` = 200 ms)
 *    before returning the Corrective Twin to its relaxed neutral standing posture when the pose becomes correct.
 */

import * as THREE from "three";
import { TWIN_CONFIG } from "./TwinConfig.js";
import { MP } from "./AvatarRetargeter.js";
import { getTargetAnglesForPoseName } from "../../data/practicePoseTargets.js";
import { computeEightAngles } from "../../utils/practicePoseAnalysis.js";
import {
  buildValidatedAsanaTargetLandmarks,
  getAsanaReferenceByNameOrId,
} from "../../data/asanaReferenceTable.js";

/**
 * Anatomical joint groups and the MediaPipe landmark indices they govern.
 */
export const JOINT_GROUPS = {
  leftArm: {
    id: "leftArm",
    label: "Left Arm & Shoulder",
    landmarks: [MP.L_SHOULDER, MP.L_ELBOW, MP.L_WRIST, MP.L_PINKY, MP.L_INDEX, MP.L_THUMB],
    bones: ["LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand"],
  },
  rightArm: {
    id: "rightArm",
    label: "Right Arm & Shoulder",
    landmarks: [MP.R_SHOULDER, MP.R_ELBOW, MP.R_WRIST, MP.R_PINKY, MP.R_INDEX, MP.R_THUMB],
    bones: ["RightShoulder", "RightArm", "RightForeArm", "RightHand"],
  },
  leftLeg: {
    id: "leftLeg",
    label: "Left Hip, Knee & Ankle",
    landmarks: [MP.L_HIP, MP.L_KNEE, MP.L_ANKLE, MP.L_HEEL, MP.L_FOOT_INDEX],
    bones: ["LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase"],
  },
  rightLeg: {
    id: "rightLeg",
    label: "Right Hip, Knee & Ankle",
    landmarks: [MP.R_HIP, MP.R_KNEE, MP.R_ANKLE, MP.R_HEEL, MP.R_FOOT_INDEX],
    bones: ["RightUpLeg", "RightLeg", "RightFoot", "RightToeBase"],
  },
  torso: {
    id: "torso",
    label: "Spine & Shoulders",
    landmarks: [MP.NOSE, MP.L_EAR, MP.R_EAR, MP.L_SHOULDER, MP.R_SHOULDER, MP.L_HIP, MP.R_HIP],
    bones: ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head"],
  },
};

export function isTreePoseName(poseName = "") {
  const norm = String(poseName || "").toLowerCase();
  return (
    norm.includes("tree") ||
    norm.includes("vrkasana") ||
    norm.includes("vrksasana") ||
    norm.includes("vrikshasana") ||
    norm === "sta-02"
  );
}

export function isTadasanaPoseName(poseName = "") {
  const norm = String(poseName || "").toLowerCase();
  return (
    norm.includes("mountain") ||
    norm.includes("tadasana") ||
    norm === "sta-01"
  );
}

/**
 * Parses correction messages and descriptor deviations from the existing corrective-feedback
 * engine to determine which anatomical joint groups have active errors.
 *
 * @param {object} engineState
 * @returns {Set<string>} Set of active group keys ("leftArm", "rightArm", "leftLeg", "rightLeg", "torso")
 */
export function identifyAffectedJointGroups(engineState = {}) {
  const affected = new Set();

  const {
    corrections = [],
    feedback = "",
    descriptorDeviations = [],
    liveAngles = null,
    targetAngles = null,
  } = engineState;

  // 1. Check structured descriptorDeviations from correction-engine/server.js
  if (Array.isArray(descriptorDeviations)) {
    for (const dev of descriptorDeviations) {
      const name = String(dev?.name || "");
      if (name.startsWith("leftElbow") || name.startsWith("leftShoulder") || name.startsWith("leftWrist")) {
        affected.add("leftArm");
      } else if (name.startsWith("rightElbow") || name.startsWith("rightShoulder") || name.startsWith("rightWrist")) {
        affected.add("rightArm");
      } else if (name.startsWith("leftKnee") || name.startsWith("leftHip") || name.startsWith("leftAnkle")) {
        affected.add("leftLeg");
      } else if (name.startsWith("rightKnee") || name.startsWith("rightHip") || name.startsWith("rightAnkle")) {
        affected.add("rightLeg");
      } else if (name.includes("spine") || name.includes("shoulderLine")) {
        affected.add("torso");
      } else if (name.includes("footSeparation") || name.includes("kneeSeparation")) {
        affected.add("leftLeg");
        affected.add("rightLeg");
      }
    }
  }

  // 2. Parse natural-language correction strings from ytCorrections & feedback
  const validCorrections = Array.isArray(corrections)
    ? corrections.filter(
        (c) =>
          typeof c === "string" &&
          !c.toLowerCase().includes("step into frame") &&
          !c.toLowerCase().includes("position your full body") &&
          !c.toLowerCase().includes("full body not detected") &&
          !c.toLowerCase().includes("looking good")
      )
    : [];
  const allText = [...validCorrections, feedback || ""].join(" ").toLowerCase();

  if (
    allText &&
    !allText.includes("looking good") &&
    !allText.includes("hold the position") &&
    !allText.includes("step into frame") &&
    !allText.includes("position your full body") &&
    !allText.includes("full body not detected")
  ) {
    if (allText.includes("left arm") || allText.includes("left elbow") || allText.includes("left shoulder") || allText.includes("left wrist")) {
      affected.add("leftArm");
    }
    if (allText.includes("right arm") || allText.includes("right elbow") || allText.includes("right shoulder") || allText.includes("right wrist")) {
      affected.add("rightArm");
    }
    if (
      allText.includes("both arms") ||
      allText.includes("interlock") ||
      allText.includes("palms") ||
      allText.includes("clasp") ||
      (allText.includes("arms") && !allText.includes("left arm") && !allText.includes("right arm"))
    ) {
      affected.add("leftArm");
      affected.add("rightArm");
    }
    if (allText.includes("left leg") || allText.includes("left knee") || allText.includes("left hip") || allText.includes("left foot") || allText.includes("left ankle")) {
      affected.add("leftLeg");
    }
    if (allText.includes("right leg") || allText.includes("right knee") || allText.includes("right hip") || allText.includes("right foot") || allText.includes("right ankle")) {
      affected.add("rightLeg");
    }
    if (allText.includes("stance") || allText.includes("feet") || allText.includes("knees") || allText.includes("inner thigh")) {
      if (!affected.has("leftLeg") && !affected.has("rightLeg")) {
        affected.add("leftLeg");
        affected.add("rightLeg");
      }
    }
    if (
      allText.includes("spine") ||
      allText.includes("torso") ||
      allText.includes("back") ||
      allText.includes("level out your shoulders") ||
      allText.includes("upright") ||
      allText.includes("hinge") ||
      allText.includes("bend") ||
      allText.includes("chest")
    ) {
      affected.add("torso");
    }
  }

  // 3. Check 8-angle deviations ([R_elbow, L_elbow, R_shoulder, L_shoulder, R_hip, L_hip, R_knee, L_knee])
  if (Array.isArray(liveAngles) && Array.isArray(targetAngles) && liveAngles.length === 8 && targetAngles.length === 8) {
    const TOL = 22;
    if (Math.abs(liveAngles[0] - targetAngles[0]) > TOL || Math.abs(liveAngles[2] - targetAngles[2]) > TOL) {
      affected.add("rightArm");
    }
    if (Math.abs(liveAngles[1] - targetAngles[1]) > TOL || Math.abs(liveAngles[3] - targetAngles[3]) > TOL) {
      affected.add("leftArm");
    }
    if (Math.abs(liveAngles[4] - targetAngles[4]) > TOL || Math.abs(liveAngles[6] - targetAngles[6]) > TOL) {
      affected.add("rightLeg");
    }
    if (Math.abs(liveAngles[5] - targetAngles[5]) > TOL || Math.abs(liveAngles[7] - targetAngles[7]) > TOL) {
      affected.add("leftLeg");
    }
  }

  return affected;
}

/**
 * Builds hybrid 33 target landmarks in the user's current camera coordinate space:
 * - Preserves the user's actual live landmarks for all body parts that are already correct.
 * - Replaces ONLY the coordinates belonging to `affectedGroups` (or all groups if `fullPoseDemonstration` is true)
 *   using the consultant-validated target pose (`buildValidatedAsanaTargetLandmarks`) for the 9 supported asanas,
 *   falling back to `idealLandmarks` / `targetAngles` for any non-standard pose.
 */
export function buildCorrectedTargetLandmarks({
  liveLandmarks,
  idealLandmarks,
  targetAngles,
  affectedGroups,
  poseName,
  fullPoseDemonstration = false,
}) {
  if (!Array.isArray(liveLandmarks) || liveLandmarks.length < 33) return null;

  // Clone live landmarks as the baseline (unaffected parts remain identical to user's actual posture)
  const out = liveLandmarks.map((lm) => ({
    x: lm.x,
    y: lm.y,
    z: lm.z ?? 0,
    visibility: Math.max(lm.visibility ?? 0.9, 0.85),
  }));

  if (!fullPoseDemonstration && (!affectedGroups || affectedGroups.size === 0)) {
    return out;
  }

  // In Tadasana, if one arm is corrected to overhead interlocked position, both arms must interlock together!
  const effectiveGroups = new Set(affectedGroups || []);
  const isTadasana = isTadasanaPoseName(poseName);
  if (fullPoseDemonstration) {
    effectiveGroups.add("torso");
    effectiveGroups.add("leftArm");
    effectiveGroups.add("rightArm");
    effectiveGroups.add("leftLeg");
    effectiveGroups.add("rightLeg");
  } else if (
    isTadasana &&
    (effectiveGroups.has("leftArm") || effectiveGroups.has("rightArm"))
  ) {
    effectiveGroups.add("leftArm");
    effectiveGroups.add("rightArm");
  }

  // Primary Strategy: Use the consultant-validated 33-landmark target pose for the 9 supported asanas
  const asanaRef = getAsanaReferenceByNameOrId(poseName);
  if (asanaRef) {
    const validatedTarget = buildValidatedAsanaTargetLandmarks(
      asanaRef.id,
      liveLandmarks
    );

    if (Array.isArray(validatedTarget) && validatedTarget.length === 33) {
      if (fullPoseDemonstration) {
        return validatedTarget;
      }

      if (effectiveGroups.has("torso")) {
        for (const idx of JOINT_GROUPS.torso.landmarks) {
          out[idx] = { ...validatedTarget[idx] };
        }
      }

      if (effectiveGroups.has("leftArm")) {
        graftChainFromIdeal(out, validatedTarget, [
          MP.L_SHOULDER,
          MP.L_ELBOW,
          MP.L_WRIST,
          MP.L_INDEX,
          MP.L_PINKY,
          MP.L_THUMB,
        ]);
      }

      if (effectiveGroups.has("rightArm")) {
        graftChainFromIdeal(out, validatedTarget, [
          MP.R_SHOULDER,
          MP.R_ELBOW,
          MP.R_WRIST,
          MP.R_INDEX,
          MP.R_PINKY,
          MP.R_THUMB,
        ]);
      }

      // If Tadasana both arms are active, keep the overhead interlocked wrist/finger coordinates exact
      if (isTadasana && effectiveGroups.has("leftArm") && effectiveGroups.has("rightArm")) {
        for (const idx of [
          MP.L_ELBOW,
          MP.R_ELBOW,
          MP.L_WRIST,
          MP.R_WRIST,
          MP.L_INDEX,
          MP.R_INDEX,
          MP.L_PINKY,
          MP.R_PINKY,
          MP.L_THUMB,
          MP.R_THUMB,
        ]) {
          out[idx] = { ...validatedTarget[idx] };
        }
      }

      if (effectiveGroups.has("leftLeg")) {
        graftChainFromIdeal(out, validatedTarget, [
          MP.L_HIP,
          MP.L_KNEE,
          MP.L_ANKLE,
          MP.L_HEEL,
          MP.L_FOOT_INDEX,
        ]);
      }

      if (effectiveGroups.has("rightLeg")) {
        graftChainFromIdeal(out, validatedTarget, [
          MP.R_HIP,
          MP.R_KNEE,
          MP.R_ANKLE,
          MP.R_HEEL,
          MP.R_FOOT_INDEX,
        ]);
      }

      if (isTadasana) {
        enforceSymmetricGroundedTadasanaLegs(out);
      }

      return out;
    }
  }

  // Fallback Strategy A: Use engine-provided `idealLandmarks`
  const lHip = out[MP.L_HIP];
  const rHip = out[MP.R_HIP];
  const lSh = out[MP.L_SHOULDER];
  const rSh = out[MP.R_SHOULDER];

  const hipMid = {
    x: (lHip.x + rHip.x) * 0.5,
    y: (lHip.y + rHip.y) * 0.5,
    z: (lHip.z + rHip.z) * 0.5,
  };
  const shMid = {
    x: (lSh.x + rSh.x) * 0.5,
    y: (lSh.y + rSh.y) * 0.5,
    z: (lSh.z + rSh.z) * 0.5,
  };

  const torsoScale = Math.max(
    0.08,
    Math.hypot(shMid.x - hipMid.x, shMid.y - hipMid.y, shMid.z - hipMid.z)
  );

  if (Array.isArray(idealLandmarks) && idealLandmarks.length === 33) {
    const denorm = idealLandmarks.map((ilm) => ({
      x: hipMid.x + ilm.x * torsoScale,
      y: hipMid.y + ilm.y * torsoScale,
      z: hipMid.z + (ilm.z ?? 0) * torsoScale,
      visibility: 0.98,
    }));

    if (effectiveGroups.has("torso")) {
      for (const idx of JOINT_GROUPS.torso.landmarks) {
        out[idx] = { ...denorm[idx] };
      }
    }
    if (effectiveGroups.has("leftArm")) {
      graftChainFromIdeal(out, denorm, [
        MP.L_SHOULDER,
        MP.L_ELBOW,
        MP.L_WRIST,
        MP.L_INDEX,
        MP.L_PINKY,
        MP.L_THUMB,
      ]);
    }
    if (effectiveGroups.has("rightArm")) {
      graftChainFromIdeal(out, denorm, [
        MP.R_SHOULDER,
        MP.R_ELBOW,
        MP.R_WRIST,
        MP.R_INDEX,
        MP.R_PINKY,
        MP.R_THUMB,
      ]);
    }
    if (effectiveGroups.has("leftLeg")) {
      graftChainFromIdeal(out, denorm, [
        MP.L_HIP,
        MP.L_KNEE,
        MP.L_ANKLE,
        MP.L_HEEL,
        MP.L_FOOT_INDEX,
      ]);
    }
    if (effectiveGroups.has("rightLeg")) {
      graftChainFromIdeal(out, denorm, [
        MP.R_HIP,
        MP.R_KNEE,
        MP.R_ANKLE,
        MP.R_HEEL,
        MP.R_FOOT_INDEX,
      ]);
    }
    return out;
  }

  // Fallback Strategy B: Exact 2D/3D angle correction using `targetAngles`
  const liveAngles = computeEightAngles(liveLandmarks);
  const angles = targetAngles || getTargetAnglesForPoseName(poseName, liveAngles);
  if (Array.isArray(angles) && angles.length === 8) {
    const rArmSign = rSh.x >= lSh.x ? 1 : -1;
    const lArmSign = -rArmSign;
    const rLegSign = rHip.x >= lHip.x ? 1 : -1;
    const lLegSign = -rLegSign;

    if (effectiveGroups.has("rightArm")) {
      apply2DLimbTargetAngles(
        out,
        MP.R_HIP,
        MP.R_SHOULDER,
        MP.R_ELBOW,
        MP.R_WRIST,
        [MP.R_INDEX, MP.R_PINKY, MP.R_THUMB],
        angles[2],
        angles[0],
        rArmSign,
        false
      );
    }
    if (effectiveGroups.has("leftArm")) {
      apply2DLimbTargetAngles(
        out,
        MP.L_HIP,
        MP.L_SHOULDER,
        MP.L_ELBOW,
        MP.L_WRIST,
        [MP.L_INDEX, MP.L_PINKY, MP.L_THUMB],
        angles[3],
        angles[1],
        lArmSign,
        false
      );
    }
    if (effectiveGroups.has("rightLeg")) {
      apply2DLimbTargetAngles(
        out,
        MP.R_SHOULDER,
        MP.R_HIP,
        MP.R_KNEE,
        MP.R_ANKLE,
        [MP.R_HEEL, MP.R_FOOT_INDEX],
        angles[4],
        angles[6],
        rLegSign,
        true
      );
    }
    if (effectiveGroups.has("leftLeg")) {
      apply2DLimbTargetAngles(
        out,
        MP.L_SHOULDER,
        MP.L_HIP,
        MP.L_KNEE,
        MP.L_ANKLE,
        [MP.L_HEEL, MP.L_FOOT_INDEX],
        angles[5],
        angles[7],
        lLegSign,
        true
      );
    }
  }

  return out;
}

/**
 * Guarantees that when the target pose is Tadasana (Mountain Pose),
 * both legs remain grounded at equal height and never lift one foot into Vrikshasana.
 */
function enforceSymmetricGroundedTadasanaLegs(out) {
  const lHip = out[MP.L_HIP];
  const rHip = out[MP.R_HIP];
  const lKnee = out[MP.L_KNEE];
  const rKnee = out[MP.R_KNEE];
  const lAnk = out[MP.L_ANKLE];
  const rAnk = out[MP.R_ANKLE];
  if (!lHip || !rHip || !lKnee || !rKnee || !lAnk || !rAnk) return;

  const thighLen = Math.max(
    0.12,
    (dist3D(lHip, lKnee) + dist3D(rHip, rKnee)) * 0.5
  );
  const shinLen = Math.max(
    0.12,
    (dist3D(lKnee, lAnk) + dist3D(rKnee, rAnk)) * 0.5
  );
  const hipY = (lHip.y + rHip.y) * 0.5;
  const hipZ = (lHip.z + rHip.z) * 0.5;

  out[MP.L_KNEE] = { x: lHip.x, y: hipY + thighLen, z: hipZ, visibility: 0.98 };
  out[MP.R_KNEE] = { x: rHip.x, y: hipY + thighLen, z: hipZ, visibility: 0.98 };
  out[MP.L_ANKLE] = { x: lHip.x, y: hipY + thighLen + shinLen, z: hipZ, visibility: 0.98 };
  out[MP.R_ANKLE] = { x: rHip.x, y: hipY + thighLen + shinLen, z: hipZ, visibility: 0.98 };
  if (out[MP.L_FOOT_INDEX]) {
    out[MP.L_FOOT_INDEX] = {
      x: lHip.x,
      y: hipY + thighLen + shinLen + 0.03,
      z: hipZ - 0.04,
      visibility: 0.98,
    };
  }
  if (out[MP.R_FOOT_INDEX]) {
    out[MP.R_FOOT_INDEX] = {
      x: rHip.x,
      y: hipY + thighLen + shinLen + 0.03,
      z: hipZ - 0.04,
      visibility: 0.98,
    };
  }
}

/**
 * Grafts ideal limb directions from `denorm` starting at the anchor joint `chain[0]` in `out`,
 * preserving the user's actual limb segment lengths so the skeleton never stretches.
 */
function graftChainFromIdeal(out, denorm, chain) {
  const anchorIdx = chain[0];
  const proxIdx = chain[1];
  const distIdx = chain[2];

  const liveLen1 = Math.max(0.05, dist3D(out[anchorIdx], out[proxIdx]));
  const liveLen2 = Math.max(0.05, dist3D(out[proxIdx], out[distIdx]));

  const dir1 = unitVec3D(denorm[anchorIdx], denorm[proxIdx]);
  const dir2 = unitVec3D(denorm[proxIdx], denorm[distIdx]);

  const oldDistPos = { ...out[distIdx] };

  out[proxIdx] = {
    x: out[anchorIdx].x + dir1.x * liveLen1,
    y: out[anchorIdx].y + dir1.y * liveLen1,
    z: out[anchorIdx].z + dir1.z * liveLen1,
    visibility: 0.98,
  };

  out[distIdx] = {
    x: out[proxIdx].x + dir2.x * liveLen2,
    y: out[proxIdx].y + dir2.y * liveLen2,
    z: out[proxIdx].z + dir2.z * liveLen2,
    visibility: 0.98,
  };

  const dx = out[distIdx].x - oldDistPos.x;
  const dy = out[distIdx].y - oldDistPos.y;
  const dz = out[distIdx].z - oldDistPos.z;

  for (let i = 3; i < chain.length; i++) {
    const tipIdx = chain[i];
    if (denorm[tipIdx] && denorm[distIdx]) {
      const tipDir = unitVec3D(denorm[distIdx], denorm[tipIdx]);
      const tipLen = Math.max(0.025, dist3D(out[distIdx], out[tipIdx]));
      out[tipIdx] = {
        x: out[distIdx].x + tipDir.x * tipLen,
        y: out[distIdx].y + tipDir.y * tipLen,
        z: out[distIdx].z + tipDir.z * tipLen,
        visibility: 0.98,
      };
    } else if (out[tipIdx]) {
      out[tipIdx] = {
        x: out[tipIdx].x + dx,
        y: out[tipIdx].y + dy,
        z: out[tipIdx].z + dz,
        visibility: 0.98,
      };
    }
  }
}

function apply2DLimbTargetAngles(
  out,
  refIdx,
  rootIdx,
  midIdx,
  endIdx,
  tipIndices,
  rootAngleDeg,
  midAngleDeg,
  sideSign,
  isLeg = false
) {
  const root = out[rootIdx];
  const mid = out[midIdx];
  const end = out[endIdx];
  if (!root || !mid || !end) return;

  const L1 = Math.max(0.06, dist3D(root, mid));
  const L2 = Math.max(0.06, dist3D(mid, end));
  const oldEnd = { ...end };

  const rad1 = THREE.MathUtils.degToRad(rootAngleDeg);
  let dir1X, dir1Y;
  if (!isLeg) {
    dir1X = sideSign * Math.sin(rad1);
    dir1Y = Math.cos(rad1);
  } else {
    dir1X = sideSign * Math.sin(Math.PI - rad1);
    dir1Y = Math.cos(Math.PI - rad1);
  }

  out[midIdx] = {
    x: root.x + dir1X * L1,
    y: root.y + dir1Y * L1,
    z: root.z,
    visibility: 0.98,
  };

  const bendRad = Math.PI - THREE.MathUtils.degToRad(midAngleDeg);
  const totalAngle =
    Math.atan2(dir1Y, dir1X) + sideSign * bendRad * (isLeg ? -1 : 1);

  out[endIdx] = {
    x: out[midIdx].x + Math.cos(totalAngle) * L2,
    y: out[midIdx].y + Math.sin(totalAngle) * L2,
    z: out[midIdx].z,
    visibility: 0.98,
  };

  const dx = out[endIdx].x - oldEnd.x;
  const dy = out[endIdx].y - oldEnd.y;
  for (const tIdx of tipIndices) {
    if (out[tIdx]) {
      out[tIdx] = {
        ...out[tIdx],
        x: out[tIdx].x + dx,
        y: out[tIdx].y + dy,
        visibility: 0.98,
      };
    }
  }
}

function dist3D(a, b) {
  if (!a || !b) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
}

function unitVec3D(a, b) {
  const d = dist3D(a, b);
  if (d < 1e-5) return { x: 0, y: 1, z: 0 };
  return {
    x: (b.x - a.x) / d,
    y: (b.y - a.y) / d,
    z: ((b.z ?? 0) - (a.z ?? 0)) / d,
  };
}

/**
 * Stateful Corrective Coordinate Adapter with configurable error-state debounce (~400 ms),
 * error-clearing hysteresis (~200 ms), and automatic reset on pose change or feedback disable.
 */
export class CorrectiveCoordinateAdapter {
  constructor(options = {}) {
    this.debounceMs =
      options.debounceMs ?? TWIN_CONFIG.CORRECTIVE_TWIN.errorDebounceMs;
    this.clearHysteresisMs =
      options.clearHysteresisMs ??
      TWIN_CONFIG.CORRECTIVE_TWIN.errorClearHysteresisMs;

    this.currentPoseName = "";
    this.isActive = false;
    this.errorFirstSeenTs = null;
    this.goodFirstSeenTs = null;
    this.activeAffectedGroups = new Set();
    this.activeAffectedBones = new Set();
    this.lastCorrectedLandmarks = null;
  }

  reset() {
    this.isActive = false;
    this.errorFirstSeenTs = null;
    this.goodFirstSeenTs = null;
    this.activeAffectedGroups.clear();
    this.activeAffectedBones.clear();
    this.lastCorrectedLandmarks = null;
  }

  /**
   * Processes the latest live landmarks and correction engine output, applying
   * debounce/hysteresis and returning the Corrective Twin state and hybrid target coordinates.
   */
  update({
    liveLandmarks,
    correctionState = {},
    poseName = "",
    isFeedbackEnabled = true,
    nowMs = performance.now(),
  }) {
    // 1. Clear obsolete correction data immediately when changing asanas
    if (poseName !== this.currentPoseName) {
      this.reset();
      this.currentPoseName = poseName;
    }

    // 2. If recording/feedback is disabled or full-body tracking is lost, immediately stay idle
    if (
      !isFeedbackEnabled ||
      !Array.isArray(liveLandmarks) ||
      liveLandmarks.length < 33
    ) {
      this.reset();
      return {
        active: false,
        correctedLandmarks: null,
        affectedGroups: [],
        affectedBones: [],
        statusLabel: "Idle — Awaiting user pose",
      };
    }

    // 3. Reject stale correctionState from a previous pose if tagged with a different poseName
    if (
      correctionState.appPoseName &&
      poseName &&
      correctionState.appPoseName !== poseName
    ) {
      this.reset();
      return {
        active: false,
        correctedLandmarks: null,
        affectedGroups: [],
        affectedBones: [],
        statusLabel: "Idle — Switching pose",
      };
    }

    const liveAngles =
      correctionState.liveAngles || computeEightAngles(liveLandmarks);
    const targetAngles =
      correctionState.targetAngles ||
      getTargetAnglesForPoseName(poseName, liveAngles);

    const detectedGroups = identifyAffectedJointGroups({
      ...correctionState,
      liveAngles,
      targetAngles,
    });

    const status = correctionState.status || "idle";
    const validCorrections = Array.isArray(correctionState.corrections)
      ? correctionState.corrections.filter(
          (c) =>
            typeof c === "string" &&
            !c.toLowerCase().includes("step into frame") &&
            !c.toLowerCase().includes("position your full body") &&
            !c.toLowerCase().includes("full body not detected") &&
            !c.toLowerCase().includes("looking good")
        )
      : [];

    const ollamaActiveForCurrentPose =
      Boolean(correctionState.ollamaCoaching?.active) &&
      (!correctionState.ollamaCoaching?.poseName ||
        correctionState.ollamaCoaching.poseName === poseName);

    const hasExplicitAdjust =
      status === "adjust" ||
      ollamaActiveForCurrentPose ||
      validCorrections.length > 0 ||
      (Array.isArray(correctionState.descriptorDeviations) &&
        correctionState.descriptorDeviations.length > 0);

    const rawHasError =
      status !== "good_form" &&
      status !== "not_detected" &&
      status !== "idle" &&
      hasExplicitAdjust;

    // Apply ~400 ms error-state debounce & ~200 ms clearing hysteresis
    if (rawHasError) {
      this.goodFirstSeenTs = null;
      if (this.errorFirstSeenTs === null) {
        this.errorFirstSeenTs = nowMs;
      }
      if (
        !this.isActive &&
        (ollamaActiveForCurrentPose ||
          nowMs - this.errorFirstSeenTs >= this.debounceMs)
      ) {
        this.isActive = true;
      }
    } else {
      this.errorFirstSeenTs = null;
      if (this.isActive) {
        if (this.goodFirstSeenTs === null) {
          this.goodFirstSeenTs = nowMs;
        }
        if (nowMs - this.goodFirstSeenTs >= this.clearHysteresisMs) {
          this.isActive = false;
          this.activeAffectedGroups.clear();
          this.activeAffectedBones.clear();
        }
      }
    }

    if (!this.isActive) {
      return {
        active: false,
        correctedLandmarks: null,
        affectedGroups: [],
        affectedBones: [],
        statusLabel:
          status === "good_form"
            ? "Posture Aligned — Idle"
            : "Monitoring Alignment",
      };
    }

    if (detectedGroups.size > 0) {
      this.activeAffectedGroups = new Set(detectedGroups);
    } else if (this.activeAffectedGroups.size === 0) {
      this.activeAffectedGroups = new Set(["leftArm", "rightArm", "torso"]);
    }

    this.activeAffectedBones.clear();
    for (const gKey of this.activeAffectedGroups) {
      const grp = JOINT_GROUPS[gKey];
      if (grp) {
        grp.bones.forEach((b) => this.activeAffectedBones.add(b));
      }
    }

    const correctedLandmarks = buildCorrectedTargetLandmarks({
      liveLandmarks,
      idealLandmarks: correctionState.idealLandmarks,
      targetAngles,
      affectedGroups: this.activeAffectedGroups,
      poseName,
      fullPoseDemonstration: ollamaActiveForCurrentPose,
    });

    this.lastCorrectedLandmarks = correctedLandmarks;

    return {
      active: true,
      correctedLandmarks,
      affectedGroups: Array.from(this.activeAffectedGroups),
      affectedBones: Array.from(this.activeAffectedBones),
      statusLabel: ollamaActiveForCurrentPose
        ? "Ollama Coach — Demonstrating Target Asana"
        : "Demonstrating Corrective Alignment",
    };
  }
}
