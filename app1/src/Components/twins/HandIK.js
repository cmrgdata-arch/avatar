/**
 * HandIK.js
 * Analytical Two-Bone Inverse Kinematics & Contact Solver for the Digital Twin and Corrective Twin.
 *
 * Solves:
 * 1. Asana-Specific Hand Configurations:
 *    A. TADASANA OVERHEAD INTERLOCKED HANDS (`tadasana_interlocked_up`):
 *       - Strictly distinguished from Namaste / Prayer Pose!
 *       - Never activates chest-level prayer in Tadasana.
 *       - When arms are raised overhead in Tadasana (or when the Corrective Twin demonstrates Tadasana),
 *         positions wrists above the crown of the head with elbows extended (~175 deg) beside the ears,
 *         rotates BOTH palms UPWARD toward the ceiling (+Y world normal: `[0, +1, 0]`), points fingers
 *         across the midline (`LeftHand` -> `-X`, `RightHand` -> `+X`), and curls the 24 finger phalange
 *         bones (`Index1..3`, `Middle1..3`, `Ring1..3`, `Pinky1..3`) into an interlocked clasp.
 *    B. NAMASTE / ANJALI MUDRA (`namaste_chest` / `namaste_overhead`):
 *       - Activates ONLY when the user's palms/wrists genuinely approach within ~10 cm
 *         (normDist < 0.44 of shoulder width) in non-Tadasana poses (such as Vrikshasana / Tree Pose).
 *       - Uses each rig's calibrated `handLocalBasisQ` so `LeftHand` palm normal faces `-X` (inward)
 *         and `RightHand` palm normal faces `+X` (inward) with fingers pointing straight upward (`+Y`).
 * 2. Vrikshasana (Tree Pose) foot-to-inner-thigh contact:
 *    - Strictly verifies a true single-leg Tree Pose stance (lifted ankle raised >= 26% of
 *      standing leg length, lifted knee bent < 138 deg, standing knee straight > 148 deg)
 *      so Tadasana or normal two-footed stances NEVER trigger Tree Pose foot IK.
 *    - Maps the user's raised foot placement directly onto the inner thigh of the supporting
 *      leg, using the user's actual lifted knee direction as the outward pole vector.
 */

import * as THREE from "three";
import { TWIN_CONFIG } from "./TwinConfig.js";
import {
  HAND_CONFIG_MODE,
  resolveHandConfigModeForPose,
} from "../../data/asanaReferenceTable.js";

// Reusable scratch objects (zero per-frame heap allocations)
const _rootWorld = new THREE.Vector3();
const _midWorld = new THREE.Vector3();
const _endWorld = new THREE.Vector3();
const _effTarget = new THREE.Vector3();
const _uAxis = new THREE.Vector3();
const _polePerp = new THREE.Vector3();
const _desMidWorld = new THREE.Vector3();
const _curDir = new THREE.Vector3();
const _desDir = new THREE.Vector3();
const _parentWorldQ = new THREE.Quaternion();
const _boneWorldQ = new THREE.Quaternion();
const _deltaWorldQ = new THREE.Quaternion();
const _targetWorldQ = new THREE.Quaternion();
const _targetLocalQ = new THREE.Quaternion();

const _lShWorld = new THREE.Vector3();
const _rShWorld = new THREE.Vector3();
const _lElWorld = new THREE.Vector3();
const _rElWorld = new THREE.Vector3();
const _lWrWorld = new THREE.Vector3();
const _rWrWorld = new THREE.Vector3();
const _hipsWorld = new THREE.Vector3();
const _spineWorld = new THREE.Vector3();
const _headWorld = new THREE.Vector3();
const _meetPoint = new THREE.Vector3();
const _lTarget = new THREE.Vector3();
const _rTarget = new THREE.Vector3();
const _lPole = new THREE.Vector3();
const _rPole = new THREE.Vector3();
const _upVec = new THREE.Vector3();
const _sideAxis = new THREE.Vector3();
const _fwdAxis = new THREE.Vector3();
const _upAxis = new THREE.Vector3();
const _rotMat = new THREE.Matrix4();
const _swingQ = new THREE.Quaternion();
const _twistQ = new THREE.Quaternion();
const _halfTwistQ = new THREE.Quaternion();
const _bDir = new THREE.Vector3();
const _proj = new THREE.Vector3();

const _standHipW = new THREE.Vector3();
const _standKneeW = new THREE.Vector3();
const _standAnkleW = new THREE.Vector3();
const _segVec = new THREE.Vector3();
const _contactPt = new THREE.Vector3();
const _outwardDir = new THREE.Vector3();
const _liftHipW = new THREE.Vector3();
const _liftKneeW = new THREE.Vector3();

const FINGER_CHAINS = ["Index", "Middle", "Ring", "Pinky"];
const FINGER_SPREAD_Z = {
  Index: -0.025,
  Middle: -0.005,
  Ring: 0.015,
  Pinky: 0.035,
};

/**
 * Computes interior angle in degrees at vertex `b` formed by `a - b - c`.
 */
function angle3DDeg(a, b, c) {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v1z = (a.z ?? 0) - (b.z ?? 0);
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const v2z = (c.z ?? 0) - (b.z ?? 0);
  const l1 = Math.hypot(v1x, v1y, v1z);
  const l2 = Math.hypot(v2x, v2y, v2z);
  if (l1 < 1e-5 || l2 < 1e-5) return 180;
  const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y + v1z * v2z) / (l1 * l2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * Analytical Pole-Vector Two-Bone IK solver for a 3-joint limb chain (root -> mid -> end).
 * Computes the exact 3D world position of `midBone` (elbow or knee) in the plane defined by
 * `root -> target` and `poleDirWorld`, clamping interior flexion between [30 deg, 178 deg]
 * (0 to 150 deg elbow/knee bend) so limbs never hyperextend, invert, or point unnaturally.
 */
export function solveTwoBoneIK(
  rootBone,
  midBone,
  endBone,
  targetWorld,
  weight = 1.0,
  poleDirWorld = null
) {
  if (!rootBone || !midBone || !endBone || weight <= 0.001) return;

  rootBone.parent?.updateWorldMatrix(true, false);
  rootBone.updateWorldMatrix(true, true);

  rootBone.getWorldPosition(_rootWorld);
  midBone.getWorldPosition(_midWorld);
  endBone.getWorldPosition(_endWorld);

  const L1 = _rootWorld.distanceTo(_midWorld);
  const L2 = _midWorld.distanceTo(_endWorld);
  if (L1 < 1e-4 || L2 < 1e-4) return;

  // Blend target with current end position by weight
  _effTarget.lerpVectors(_endWorld, targetWorld, weight);
  _uAxis.subVectors(_effTarget, _rootWorld);
  const rawD = _uAxis.length();
  if (rawD < 1e-4) return;
  _uAxis.divideScalar(rawD);

  // Clamp reach distance so interior elbow/knee angle stays within [30 deg (150 deg bend), 178 deg]
  const minInteriorRad = TWIN_CONFIG.JOINT_LIMITS.elbowMinAngleRad || 0.52;
  const minReachFromAngle = Math.sqrt(
    Math.max(
      0.001,
      L1 * L1 + L2 * L2 - 2 * L1 * L2 * Math.cos(minInteriorRad)
    )
  );
  const maxReach = (L1 + L2) * 0.992;
  const minReach = Math.max(Math.abs(L1 - L2) + 0.025, minReachFromAngle);
  const d = Math.max(minReach, Math.min(maxReach, rawD));

  // Law of Cosines: distance along _uAxis from rootBone to midBone projection
  const x = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, L1 * L1 - x * x));

  // Determine pole direction perpendicular to _uAxis
  if (poleDirWorld && poleDirWorld.lengthSq() > 1e-5) {
    _polePerp.copy(poleDirWorld).normalize();
  } else {
    _polePerp.subVectors(_midWorld, _rootWorld).normalize();
  }
  const dot = _polePerp.dot(_uAxis);
  _polePerp.addScaledVector(_uAxis, -dot);
  if (_polePerp.lengthSq() < 1e-5) {
    _polePerp.set(0, -1, 0.1).addScaledVector(_uAxis, -_uAxis.y).normalize();
  } else {
    _polePerp.normalize();
  }

  // Exact desired world position for midBone (elbow/knee)
  _desMidWorld
    .copy(_rootWorld)
    .addScaledVector(_uAxis, x)
    .addScaledVector(_polePerp, h);

  // 1. Rotate rootBone so midBone moves from _midWorld to _desMidWorld
  _curDir.subVectors(_midWorld, _rootWorld).normalize();
  _desDir.subVectors(_desMidWorld, _rootWorld).normalize();
  _deltaWorldQ.setFromUnitVectors(_curDir, _desDir);

  rootBone.parent.getWorldQuaternion(_parentWorldQ);
  rootBone.getWorldQuaternion(_boneWorldQ);
  _targetWorldQ.multiplyQuaternions(_deltaWorldQ, _boneWorldQ);
  rootBone.quaternion.copy(_parentWorldQ).invert().multiply(_targetWorldQ);
  rootBone.updateWorldMatrix(true, true);

  // 2. Rotate midBone so endBone moves from its updated position to _effTarget
  midBone.getWorldPosition(_midWorld);
  endBone.getWorldPosition(_endWorld);
  _curDir.subVectors(_endWorld, _midWorld).normalize();
  _desDir.subVectors(_effTarget, _midWorld).normalize();
  _deltaWorldQ.setFromUnitVectors(_curDir, _desDir);

  midBone.parent.getWorldQuaternion(_parentWorldQ);
  midBone.getWorldQuaternion(_boneWorldQ);
  _targetWorldQ.multiplyQuaternions(_deltaWorldQ, _boneWorldQ);
  midBone.quaternion.copy(_parentWorldQ).invert().multiply(_targetWorldQ);
  midBone.updateWorldMatrix(true, true);
}

/**
 * Stateful Hand & Foot Contact IK Controller per avatar instance.
 * Tracks hysteresis and 150ms smooth blend state independently for each twin.
 */
export class ContactIKSolver {
  constructor() {
    this.handContactActive = false;
    this.currentHandBlend = 0;
    this.currentFootBlend = 0;
    this.lastUpdateMs = null;
  }

  reset() {
    this.handContactActive = false;
    this.currentHandBlend = 0;
    this.currentFootBlend = 0;
    this.lastUpdateMs = null;
  }

  /**
   * Evaluates and applies asana-specific hand joining:
   * - If `poseName` resolves to Tadasana (`tadasana_interlocked_up`):
   *   - NEVER activates chest-level Namaste!
   *   - When hands are raised overhead (`isOverhead`), applies Tadasana Overhead Interlocked Hands
   *     with palms rotated UPWARD toward the ceiling (`+Y` world normal) and fingers interlocked.
   * - Otherwise (e.g., Vrikshasana / Tree Pose or general Namaste):
   *   - Applies Namaste / Anjali Mudra with palms facing each other (`-X` / `+X`) and fingers pointing upward (`+Y`).
   *
   * @param {object} params
   * @param {Record<string, THREE.Bone>} params.bones
   * @param {Record<string, THREE.Quaternion>} params.restQuats
   * @param {Record<string, THREE.Quaternion>} [params.handLocalBasisQ]
   * @param {Array<{pos: THREE.Vector3, vis: number}>} params.pts - 33 mapped points
   * @param {number} params.minConfidence
   * @param {string} [params.poseName]
   * @param {string} [params.handConfigMode]
   * @param {number} [params.nowMs]
   * @returns {{ active: boolean, blend: number, mode: string }}
   */
  applyHandJoiningIK({
    bones,
    restQuats,
    handLocalBasisQ = {},
    pts,
    minConfidence,
    poseName = "",
    handConfigMode = null,
    nowMs = performance.now(),
  }) {
    const cfg = TWIN_CONFIG.HAND_IK;
    const resolvedHandMode =
      handConfigMode || resolveHandConfigModeForPose(poseName);
    const isTadasanaMode =
      resolvedHandMode === HAND_CONFIG_MODE.TADASANA_INTERLOCKED_UP;

    // Poses where hands should never join in prayer or overhead clasp (e.g. Trikonasana, Savasana, Padahastasana, Ardha Chakrasana)
    const disallowHandJoining =
      resolvedHandMode === HAND_CONFIG_MODE.TRIKONASANA_OPPOSING_ARMS ||
      resolvedHandMode === HAND_CONFIG_MODE.SAVASANA_SUPINE_PALMS_UP ||
      resolvedHandMode === HAND_CONFIG_MODE.PADAHASTASANA_FLOOR_REACH ||
      resolvedHandMode === HAND_CONFIG_MODE.ARDHA_CHAKRASANA_WAIST_SUPPORT;

    const dtMs =
      this.lastUpdateMs !== null
        ? Math.max(4, Math.min(100, nowMs - this.lastUpdateMs))
        : 16.67;
    this.lastUpdateMs = nowMs;
    const blendStep = Math.min(1.0, dtMs / (cfg.blendDurationMs || 150));

    if (disallowHandJoining) {
      this.handContactActive = false;
      this.currentHandBlend = Math.max(0, this.currentHandBlend - blendStep);
      return { active: false, blend: this.currentHandBlend, mode: "none" };
    }

    const nose = pts[0];
    const lSh = pts[11];
    const rSh = pts[12];
    const lEl = pts[13];
    const rEl = pts[14];
    const lWr = pts[15];
    const rWr = pts[16];
    const lIdx = pts[19];
    const rIdx = pts[20];
    const lHip = pts[23];
    const rHip = pts[24];

    if (
      !lSh ||
      !rSh ||
      !lWr ||
      !rWr ||
      lSh.vis < minConfidence ||
      rSh.vis < minConfidence ||
      lWr.vis < minConfidence ||
      rWr.vis < minConfidence
    ) {
      this.handContactActive = false;
      this.currentHandBlend = Math.max(0, this.currentHandBlend - blendStep);
      return { active: false, blend: this.currentHandBlend, mode: "none" };
    }

    const shoulderWidth = lSh.pos.distanceTo(rSh.pos);
    if (shoulderWidth < 1e-4) {
      return { active: false, blend: 0, mode: "none" };
    }

    // Map user's wrist midpoint height relative to user's shoulder-to-hip torso
    const userShY = (lSh.pos.y + rSh.pos.y) * 0.5;
    const userHipY =
      lHip && rHip ? (lHip.pos.y + rHip.pos.y) * 0.5 : userShY - shoulderWidth * 1.4;
    const userTorsoH = Math.max(0.08, Math.abs(userShY - userHipY));
    const userWrY = (lWr.pos.y + rWr.pos.y) * 0.5;
    const userNoseY =
      nose && nose.vis >= minConfidence ? nose.pos.y : userShY + 0.45 * userTorsoH;

    // Relative wrist height: 0 = hip level, 1 = shoulder level, >1.20 = above head
    const relWristHeight = (userWrY - userHipY) / userTorsoH;
    const isOverhead =
      userWrY > userNoseY - 0.04 * userTorsoH || relWristHeight > 1.22;

    // CRITICAL TADASANA GUARD:
    // In Tadasana, NEVER activate chest-level Namaste/Prayer when hands are below the head!
    if (isTadasanaMode && !isOverhead) {
      this.handContactActive = false;
      this.currentHandBlend = Math.max(0, this.currentHandBlend - blendStep);
      return { active: false, blend: this.currentHandBlend, mode: "none" };
    }

    // Check both wrist-to-wrist and palm-center-to-palm-center distance
    const wristDist = lWr.pos.distanceTo(rWr.pos);
    let palmDist = wristDist;
    if (lIdx && rIdx && lIdx.vis >= minConfidence && rIdx.vis >= minConfidence) {
      const lPalm = lWr.pos.clone().lerp(lIdx.pos, 0.5);
      const rPalm = rWr.pos.clone().lerp(rIdx.pos, 0.5);
      palmDist = Math.min(wristDist, lPalm.distanceTo(rPalm));
    }

    const normDist = palmDist / shoulderWidth;

    // For Tadasana overhead interlocked hands, allow slightly wider entry ratio (0.65) when both arms are stretched overhead
    const enterThreshold = isTadasanaMode
      ? Math.max(cfg.activationEnterRatio, 0.65)
      : cfg.activationEnterRatio;
    const exitThreshold = enterThreshold + cfg.releaseHysteresisRatio;

    if (!this.handContactActive && normDist < enterThreshold) {
      this.handContactActive = true;
    } else if (this.handContactActive && normDist > exitThreshold) {
      this.handContactActive = false;
    }

    let targetBlend = 0;
    if (this.handContactActive) {
      const fullRatio = isTadasanaMode
        ? Math.max(cfg.activationFullRatio, 0.42)
        : cfg.activationFullRatio;
      const rawT = THREE.MathUtils.clamp(
        (exitThreshold - normDist) / Math.max(0.05, exitThreshold - fullRatio),
        0,
        1
      );
      targetBlend = rawT * rawT * (3 - 2 * rawT); // smoothstep
    }

    // Smoothly ramp blend over ~150 ms
    if (this.currentHandBlend < targetBlend) {
      this.currentHandBlend = Math.min(targetBlend, this.currentHandBlend + blendStep);
    } else if (this.currentHandBlend > targetBlend) {
      this.currentHandBlend = Math.max(targetBlend, this.currentHandBlend - blendStep);
    }

    const blend = this.currentHandBlend;
    if (blend <= 0.01) {
      return { active: false, blend: 0, mode: "none" };
    }

    const lArmBone = bones.LeftArm;
    const lForeBone = bones.LeftForeArm;
    const lHandBone = bones.LeftHand;
    const rArmBone = bones.RightArm;
    const rForeBone = bones.RightForeArm;
    const rHandBone = bones.RightHand;

    if (
      !lArmBone ||
      !lForeBone ||
      !lHandBone ||
      !rArmBone ||
      !rForeBone ||
      !rHandBone
    ) {
      return { active: false, blend: 0, mode: "none" };
    }

    bones.Hips?.updateWorldMatrix(true, true);
    lHandBone.getWorldPosition(_lWrWorld);
    rHandBone.getWorldPosition(_rWrWorld);
    lArmBone.getWorldPosition(_lShWorld);
    rArmBone.getWorldPosition(_rShWorld);
    if (bones.Hips) bones.Hips.getWorldPosition(_hipsWorld);
    if (bones.Head) bones.Head.getWorldPosition(_headWorld);

    const chestBone = bones.Spine2 || bones.Spine1 || bones.Spine;
    if (chestBone) {
      chestBone.getWorldPosition(_spineWorld);
    } else {
      _spineWorld.addVectors(_lShWorld, _rShWorld).multiplyScalar(0.5);
    }

    const avatarShoulderY = (_lShWorld.y + _rShWorld.y) * 0.5;
    const avatarHipY = bones.Hips ? _hipsWorld.y : avatarShoulderY - 0.45;
    const avatarTorsoH = Math.max(0.25, avatarShoulderY - avatarHipY);
    const chestMidX = (_lShWorld.x + _rShWorld.x) * 0.5;

    // ── CASE A: TADASANA OVERHEAD INTERLOCKED HANDS (PALMS ROTATED UPWARD +Y) ──
    if (isTadasanaMode && isOverhead) {
      lForeBone.getWorldPosition(_lElWorld);
      const armReach =
        _lShWorld.distanceTo(_lElWorld) + _lElWorld.distanceTo(_lWrWorld);
      const headTopY = bones.Head ? _headWorld.y + 0.16 : avatarShoulderY + 0.36;
      const stretchedY = Math.max(
        headTopY + 0.16,
        avatarShoulderY + armReach * 0.92
      );

      _meetPoint.set(chestMidX, stretchedY, _spineWorld.z - 0.01);

      // Elbows extended naturally beside the ears
      _lPole.set(0.85, 0.45, 0.12).normalize();
      _rPole.set(-0.85, 0.45, 0.12).normalize();

      // Wrists sit slightly apart (~2.2 cm from midline) so interlocked fingers cross at the center
      const wristHalfSpan = 0.022;
      _lTarget.set(_meetPoint.x + wristHalfSpan, _meetPoint.y, _meetPoint.z);
      _rTarget.set(_meetPoint.x - wristHalfSpan, _meetPoint.y, _meetPoint.z);

      solveTwoBoneIK(lArmBone, lForeBone, lHandBone, _lTarget, blend, _lPole);
      solveTwoBoneIK(rArmBone, rForeBone, rHandBone, _rTarget, blend, _rPole);

      // Rotate both palms UPWARD toward the ceiling (+Y) and interlock fingers across the midline
      this._orientTadasanaInterlockedHands(
        bones,
        restQuats,
        handLocalBasisQ,
        blend
      );

      return {
        active: true,
        blend,
        mode: HAND_CONFIG_MODE.TADASANA_INTERLOCKED_UP,
      };
    }

    // ── CASE B: NAMASTE / ANJALI MUDRA (CHEST OR OVERHEAD PRAYER POSE) ─────────
    if (isOverhead) {
      // Overhead Namaste (e.g. Vrikshasana / Tree Pose overhead prayer)
      const headTopY = bones.Head ? _headWorld.y + 0.14 : avatarShoulderY + 0.34;
      const extraLift = THREE.MathUtils.clamp(
        (relWristHeight - 1.32) * 0.22,
        0.04,
        0.26
      );
      _meetPoint.set(chestMidX, headTopY + extraLift, _spineWorld.z + 0.04);

      _lPole.set(0.75, 0.30, 0.25).normalize();
      _rPole.set(-0.75, 0.30, 0.25).normalize();
    } else {
      // Chest-Level Namaste / Anjali Mudra:
      // Place palms in front of the sternum (chest center), NEVER at chin level or stretched forward!
      const rawSternumY =
        avatarHipY +
        THREE.MathUtils.clamp(relWristHeight, 0.48, 0.76) * avatarTorsoH;
      const sternumY = Math.min(
        avatarShoulderY - 0.13,
        Math.max(avatarHipY + 0.16, rawSternumY)
      );
      const sternumZ = _spineWorld.z + cfg.chestClearanceOffsetMeters;

      _meetPoint.set(chestMidX, sternumY, sternumZ);

      _lPole.set(0.46, -0.87, -0.08).normalize();
      _rPole.set(-0.46, -0.87, -0.08).normalize();

      if (lEl && lEl.vis >= minConfidence) {
        const userLDir = new THREE.Vector3().subVectors(lEl.pos, lSh.pos);
        userLDir.y = Math.min(-0.35, userLDir.y);
        userLDir.z = Math.min(0.10, userLDir.z);
        if (userLDir.lengthSq() > 1e-4) {
          _lPole.lerp(userLDir.normalize(), 0.40).normalize();
        }
      }
      if (rEl && rEl.vis >= minConfidence) {
        const userRDir = new THREE.Vector3().subVectors(rEl.pos, rSh.pos);
        userRDir.y = Math.min(-0.35, userRDir.y);
        userRDir.z = Math.min(0.10, userRDir.z);
        if (userRDir.lengthSq() > 1e-4) {
          _rPole.lerp(userRDir.normalize(), 0.40).normalize();
        }
      }
    }

    // Offset left (+X) and right (-X) wrist targets by palm thickness (~1.5 cm) so palms press flat together
    const halfGap = 0.015;
    _lTarget.copy(_meetPoint).addScaledVector(new THREE.Vector3(1, 0, 0), halfGap);
    _rTarget.copy(_meetPoint).addScaledVector(new THREE.Vector3(-1, 0, 0), halfGap);

    solveTwoBoneIK(lArmBone, lForeBone, lHandBone, _lTarget, blend, _lPole);
    solveTwoBoneIK(rArmBone, rForeBone, rHandBone, _rTarget, blend, _rPole);

    // Orient both palms so palm normals face each other (-X for LeftHand, +X for RightHand) and fingers point upward (+Y)
    this._orientPrayerPalmsAndFingers(bones, restQuats, handLocalBasisQ, blend);

    return {
      active: true,
      blend,
      mode: isOverhead ? "overhead" : "chest",
    };
  }

  /**
   * Orients LeftHand and RightHand for Tadasana Overhead Interlocked Hands:
   * - Both LeftHand and RightHand PALM NORMALS face UPWARD toward the ceiling (`+Y`: `[0, 1, 0.05]`).
   * - LeftHand (at +X) fingers point across the midline toward `-X` (`[-1, 0.06, 0.04]`).
   * - RightHand (at -X) fingers point across the midline toward `+X` (`[+1, 0.06, -0.04]`).
   * - Individual finger phalanges (`Index1..3`, `Middle1..3`, `Ring1..3`, `Pinky1..3`) curl and
   *   interlace across each other, forming a true overhead interlocked-finger clasp with upturned palms!
   */
  _orientTadasanaInterlockedHands(bones, restQuats, handLocalBasisQ, blend) {
    const lFore = bones.LeftForeArm;
    const rFore = bones.RightForeArm;
    const lHand = bones.LeftHand;
    const rHand = bones.RightHand;

    const orientUpwardSide = (foreBone, handBone, isLeft) => {
      if (!foreBone || !handBone) return;
      foreBone.updateWorldMatrix(true, false);

      // Desired fingertip direction in world space:
      // LeftHand (+X side) points across midline toward -X; RightHand (-X side) points toward +X.
      const fingerDir = new THREE.Vector3(
        isLeft ? -1 : 1,
        0.05,
        isLeft ? 0.04 : -0.04
      ).normalize();

      // Desired palm normal in world space:
      // Both palms rotated UPWARD toward the ceiling (+Y)!
      const palmNormal = new THREE.Vector3(0, 1, 0.04).normalize();

      // Build orthonormal target world basis:
      // Column 1 (_upAxis)  -> local Finger direction (+Y_local)
      // Column 2 (_fwdAxis) -> local Palm normal (+Z_local)
      // Column 0 (_sideAxis = cross(_upAxis, _fwdAxis)) -> local Side axis (+X_local)
      _upAxis.copy(fingerDir);
      _fwdAxis.copy(palmNormal);
      _sideAxis.crossVectors(_upAxis, _fwdAxis).normalize();
      _fwdAxis.crossVectors(_sideAxis, _upAxis).normalize();

      _rotMat.makeBasis(_sideAxis, _upAxis, _fwdAxis);
      _targetWorldQ.setFromRotationMatrix(_rotMat);

      const boneName = isLeft ? "LeftHand" : "RightHand";
      const localBasisQ = handLocalBasisQ?.[boneName];
      if (localBasisQ) {
        _targetWorldQ.multiply(localBasisQ.clone().invert());
      }

      // Share 45% of forearm supination/pronation twist with ForeArm so wrist mesh stays smooth
      foreBone.getWorldQuaternion(_parentWorldQ);
      const totalLocal = _parentWorldQ.clone().invert().multiply(_targetWorldQ);

      _bDir.set(0, 1, 0).applyQuaternion(totalLocal);
      _swingQ.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _bDir);
      _twistQ.copy(_swingQ).invert().multiply(totalLocal);

      _halfTwistQ.identity().slerp(_twistQ, 0.45 * blend);
      foreBone.quaternion.multiply(_halfTwistQ);
      foreBone.updateWorldMatrix(true, true);

      foreBone.getWorldQuaternion(_parentWorldQ);
      _targetLocalQ.copy(_parentWorldQ).invert().multiply(_targetWorldQ);
      handBone.quaternion.slerp(_targetLocalQ, blend);
      handBone.updateWorldMatrix(true, true);
    };

    orientUpwardSide(lFore, lHand, true);
    orientUpwardSide(rFore, rHand, false);

    // Interlock the 24 finger bones (Index, Middle, Ring, Pinky) with alternating Z-offset
    // and natural downward phalange curl so left and right fingers weave together cleanly
    const INTERLOCK_CURL_X = [0, 0.48, 0.56, 0.36]; // rad curl for phalanges 1, 2, 3
    for (const side of ["Left", "Right"]) {
      const isLeft = side === "Left";
      const staggerSign = isLeft ? 1 : -1;
      for (let fIdx = 0; fIdx < FINGER_CHAINS.length; fIdx++) {
        const fname = FINGER_CHAINS[fIdx];
        const interlaceZ = ((fIdx % 2 === 0 ? 0.045 : -0.045) * staggerSign);
        for (let j = 1; j <= 3; j++) {
          const bName = `${side}Hand${fname}${j}`;
          const fBone = bones[bName];
          const rQ = restQuats[bName];
          if (!fBone || !rQ) continue;

          // Curl finger phalanges around the opposite hand's dorsum/metacarpals
          const curlQuat = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(
              INTERLOCK_CURL_X[j],
              0,
              j === 1 ? interlaceZ : 0
            )
          );
          const targetFingerQ = rQ.clone().multiply(curlQuat);
          fBone.quaternion.slerp(targetFingerQ, blend);
        }
      }

      // Clasp thumbs neatly alongside the interlocked index fingers
      for (let j = 1; j <= 3; j++) {
        const tName = `${side}HandThumb${j}`;
        const tBone = bones[tName];
        const rQ = restQuats[tName];
        if (tBone && rQ) {
          const thumbCurl = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(0.22 * j, 0, isLeft ? -0.15 : 0.15)
          );
          tBone.quaternion.slerp(rQ.clone().multiply(thumbCurl), 0.85 * blend);
        }
      }
    }
  }

  /**
   * Orients LeftHand and RightHand in Namaste so:
   * - LeftHand (+X side of chest) palm normal faces INWARD toward -X (`[-1, 0, 0]`)
   * - RightHand (-X side of chest) palm normal faces INWARD toward +X (`[+1, 0, 0]`)
   * - Both hands' fingers point UPWARD (`[0, 1, 0.06]`)
   * - Both thumbs sit naturally side-by-side pointing inward toward the chest (`-Z`)
   * - Uses each rig's calibrated `handLocalBasisQ` (Male & Female verified independently).
   */
  _orientPrayerPalmsAndFingers(bones, restQuats, handLocalBasisQ, blend) {
    const lFore = bones.LeftForeArm;
    const rFore = bones.RightForeArm;
    const lHand = bones.LeftHand;
    const rHand = bones.RightHand;

    const orientSide = (foreBone, handBone, isLeft) => {
      if (!foreBone || !handBone) return;
      foreBone.updateWorldMatrix(true, false);
      foreBone.getWorldPosition(_lElWorld);
      handBone.getWorldPosition(_lWrWorld);

      // Desired fingertip direction in world space: pointing straight upward (+Y) and slightly forward (+Z)
      _upVec.subVectors(_lWrWorld, _lElWorld).normalize();
      _upVec.lerp(new THREE.Vector3(0, 1, 0.06).normalize(), 0.88).normalize();

      // Desired palm normal in world space:
      // LeftHand (on +X side of body) palm faces INWARD toward -X;
      // RightHand (on -X side of body) palm faces INWARD toward +X.
      const palmNormal = new THREE.Vector3(isLeft ? -1 : 1, 0, 0);

      _upAxis.copy(_upVec).normalize();
      _fwdAxis.copy(palmNormal).normalize();
      _sideAxis.crossVectors(_upAxis, _fwdAxis).normalize();
      _fwdAxis.crossVectors(_sideAxis, _upAxis).normalize();

      _rotMat.makeBasis(_sideAxis, _upAxis, _fwdAxis);
      _targetWorldQ.setFromRotationMatrix(_rotMat);

      const boneName = isLeft ? "LeftHand" : "RightHand";
      const localBasisQ = handLocalBasisQ?.[boneName];
      if (localBasisQ) {
        _targetWorldQ.multiply(localBasisQ.clone().invert());
      }

      // Share supination twist (50%) with ForeArm so the wrist never twists unnaturally
      foreBone.getWorldQuaternion(_parentWorldQ);
      const totalLocal = _parentWorldQ.clone().invert().multiply(_targetWorldQ);

      _bDir.set(0, 1, 0).applyQuaternion(totalLocal);
      _swingQ.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _bDir);
      _twistQ.copy(_swingQ).invert().multiply(totalLocal);

      _halfTwistQ.identity().slerp(_twistQ, 0.50 * blend);
      foreBone.quaternion.multiply(_halfTwistQ);
      foreBone.updateWorldMatrix(true, true);

      foreBone.getWorldQuaternion(_parentWorldQ);
      _targetLocalQ.copy(_parentWorldQ).invert().multiply(_targetWorldQ);
      handBone.quaternion.slerp(_targetLocalQ, blend);
      handBone.updateWorldMatrix(true, true);
    };

    orientSide(lFore, lHand, true);
    orientSide(rFore, rHand, false);

    // Straighten and adduct all 30 finger bones so fingers point upward and press flat together
    for (const side of ["Left", "Right"]) {
      const sign = side === "Left" ? 1 : -1;
      for (const fname of FINGER_CHAINS) {
        const spread = (FINGER_SPREAD_Z[fname] || 0) * sign;
        for (let j = 1; j <= 3; j++) {
          const bName = `${side}Hand${fname}${j}`;
          const fBone = bones[bName];
          const rQ = restQuats[bName];
          if (!fBone || !rQ) continue;

          const flatQ = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(0, 0, j === 1 ? spread : 0)
          );
          const targetFingerQ = rQ.clone().slerp(flatQ, 0.72);
          fBone.quaternion.slerp(targetFingerQ, blend);
        }
      }

      // Align thumb neatly alongside the index finger
      for (let j = 1; j <= 3; j++) {
        const tName = `${side}HandThumb${j}`;
        const tBone = bones[tName];
        const rQ = restQuats[tName];
        if (tBone && rQ) {
          tBone.quaternion.slerp(rQ, 0.85 * blend);
        }
      }
    }
  }

  /**
   * Evaluates and applies Tree Pose (Vrikshasana) foot-to-inner-thigh contact IK
   * ONLY when one foot is genuinely lifted and placed against the opposite standing leg.
   *
   * Never activates during Tadasana or two-footed stances!
   */
  applyTreePoseFootIK({ bones, pts, minConfidence, allowTreePoseIK = true }) {
    if (!allowTreePoseIK) {
      this.currentFootBlend = 0;
      return { active: false, blend: 0 };
    }

    const cfg = TWIN_CONFIG.HAND_IK;
    const lHip = pts[23];
    const rHip = pts[24];
    const lKnee = pts[25];
    const rKnee = pts[26];
    const lAnk = pts[27];
    const rAnk = pts[28];
    const lFootIdx = pts[31];
    const rFootIdx = pts[32];

    if (
      !lHip ||
      !rHip ||
      !lKnee ||
      !rKnee ||
      !lAnk ||
      !rAnk ||
      lHip.vis < minConfidence ||
      rHip.vis < minConfidence ||
      lKnee.vis < minConfidence ||
      rKnee.vis < minConfidence ||
      lAnk.vis < minConfidence ||
      rAnk.vis < minConfidence
    ) {
      this.currentFootBlend = THREE.MathUtils.lerp(this.currentFootBlend, 0, 0.25);
      return { active: false, blend: this.currentFootBlend };
    }

    const hipWidth = lHip.pos.distanceTo(rHip.pos);
    if (hipWidth < 1e-4) {
      return { active: false, blend: 0 };
    }

    const leftLifted = lAnk.pos.y > rAnk.pos.y;
    const liftedHip = leftLifted ? lHip.pos : rHip.pos;
    const liftedKnee = leftLifted ? lKnee.pos : rKnee.pos;
    const liftedAnk = leftLifted ? lAnk.pos : rAnk.pos;
    const liftedFoot =
      (leftLifted ? lFootIdx : rFootIdx)?.vis >= minConfidence
        ? (leftLifted ? lFootIdx.pos : rFootIdx.pos)
        : liftedAnk;

    const standHip = leftLifted ? rHip.pos : lHip.pos;
    const standKnee = leftLifted ? rKnee.pos : lKnee.pos;
    const standAnk = leftLifted ? rAnk.pos : lAnk.pos;

    const standLegLen = Math.max(0.15, standHip.distanceTo(standAnk));
    const ankleHeightDiff = liftedAnk.y - standAnk.y;

    // Compute actual knee flexion angles
    const liftedKneeDeg = angle3DDeg(liftedHip, liftedKnee, liftedAnk);
    const standKneeDeg = angle3DDeg(standHip, standKnee, standAnk);

    // STRICT Vrikshasana gating:
    // 1. Lifted ankle must be raised at least 26% of the full standing leg length above the standing ankle
    // 2. Lifted knee must be bent (< 138 deg) while standing knee is straight (> 148 deg)
    if (
      ankleHeightDiff < standLegLen * 0.26 ||
      liftedKneeDeg > 138 ||
      standKneeDeg < 148
    ) {
      this.currentFootBlend = THREE.MathUtils.lerp(this.currentFootBlend, 0, 0.30);
      return { active: false, blend: this.currentFootBlend };
    }

    const dThigh = pointToSegmentDistance(liftedAnk, standHip, standKnee, _proj);
    const dShin = pointToSegmentDistance(liftedAnk, standKnee, standAnk, _bDir);
    const minDist = Math.min(dThigh.dist, dShin.dist);
    const normDist = minDist / Math.max(hipWidth, standLegLen * 0.35);

    if (normDist > cfg.treePoseFootEnterRatio) {
      this.currentFootBlend = THREE.MathUtils.lerp(this.currentFootBlend, 0, 0.25);
      return { active: false, blend: this.currentFootBlend };
    }

    const rawT = THREE.MathUtils.clamp(
      (cfg.treePoseFootEnterRatio - normDist) /
        Math.max(0.08, cfg.treePoseFootEnterRatio - cfg.treePoseFootFullRatio),
      0,
      1
    );
    const targetBlend = rawT * rawT * (3 - 2 * rawT);
    this.currentFootBlend = THREE.MathUtils.lerp(
      this.currentFootBlend,
      targetBlend,
      0.40
    );

    const blend = this.currentFootBlend;
    if (blend <= 0.01) {
      return { active: false, blend: 0 };
    }

    const standUpLeg = leftLifted ? bones.RightUpLeg : bones.LeftUpLeg;
    const standLeg = leftLifted ? bones.RightLeg : bones.LeftLeg;
    const standFoot = leftLifted ? bones.RightFoot : bones.LeftFoot;
    const liftUpLeg = leftLifted ? bones.LeftUpLeg : bones.RightUpLeg;
    const liftLeg = leftLifted ? bones.LeftLeg : bones.RightLeg;
    const liftFoot = leftLifted ? bones.LeftFoot : bones.RightFoot;

    if (!standUpLeg || !standLeg || !standFoot || !liftUpLeg || !liftLeg || !liftFoot) {
      return { active: false, blend: 0 };
    }

    bones.Hips?.updateWorldMatrix(true, true);
    standUpLeg.getWorldPosition(_standHipW);
    standLeg.getWorldPosition(_standKneeW);
    standFoot.getWorldPosition(_standAnkleW);
    liftUpLeg.getWorldPosition(_liftHipW);
    liftLeg.getWorldPosition(_liftKneeW);

    const userThighSpanY = Math.max(0.08, standHip.y - standKnee.y);
    const liftedHighestY = Math.max(liftedAnk.y, liftedFoot.y);
    const thighFraction = (standHip.y - liftedHighestY) / userThighSpanY;

    const isPlacedOnThigh = thighFraction <= 1.15;
    if (isPlacedOnThigh) {
      const tThigh = THREE.MathUtils.clamp(thighFraction * 0.68, 0.30, 0.72);
      _contactPt.lerpVectors(_standHipW, _standKneeW, tThigh);
    } else {
      const userShinSpanY = Math.max(0.08, standKnee.y - standAnk.y);
      const shinFraction = (standKnee.y - liftedHighestY) / userShinSpanY;
      const tShin = THREE.MathUtils.clamp(shinFraction, 0.30, 0.75);
      _contactPt.lerpVectors(_standKneeW, _standAnkleW, tShin);
    }

    const innerSign = leftLifted ? 1 : -1;
    _contactPt.x += innerSign * cfg.treePoseThighSurfaceOffsetMeters;

    _outwardDir.subVectors(liftedKnee, liftedHip);
    if (leftLifted) {
      _outwardDir.x = Math.max(0.55 * _outwardDir.length(), _outwardDir.x);
    } else {
      _outwardDir.x = Math.min(-0.55 * _outwardDir.length(), _outwardDir.x);
    }
    _outwardDir.z = THREE.MathUtils.clamp(_outwardDir.z, -0.15, 0.20);
    if (_outwardDir.lengthSq() < 1e-4) {
      _outwardDir.set(leftLifted ? 1 : -1, -0.25, 0.12);
    }
    _outwardDir.normalize();

    solveTwoBoneIK(liftUpLeg, liftLeg, liftFoot, _contactPt, blend, _outwardDir);

    liftLeg.getWorldQuaternion(_parentWorldQ);
    const desToeDir = new THREE.Vector3(0, -1, 0.15).normalize();
    const restFootDir = new THREE.Vector3(0, 0, 1);
    _deltaWorldQ.setFromUnitVectors(restFootDir, desToeDir);
    liftFoot.getWorldQuaternion(_boneWorldQ);
    _targetLocalQ.copy(_parentWorldQ).invert().multiply(_deltaWorldQ);
    liftFoot.quaternion.slerp(_targetLocalQ, blend * 0.65);
    liftFoot.updateWorldMatrix(true, true);

    return {
      active: true,
      blend,
      leftLifted,
      isPlacedOnThigh,
      contactWorld: _contactPt.clone(),
    };
  }
}

function pointToSegmentDistance(p, a, b, outClosest) {
  _segVec.subVectors(b, a);
  const lenSq = _segVec.lengthSq();
  if (lenSq < 1e-6) {
    outClosest.copy(a);
    return { dist: p.distanceTo(a), t: 0 };
  }
  const t = THREE.MathUtils.clamp(
    new THREE.Vector3().subVectors(p, a).dot(_segVec) / lenSq,
    0,
    1
  );
  outClosest.copy(a).addScaledVector(_segVec, t);
  return { dist: p.distanceTo(outClosest), t };
}
