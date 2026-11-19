/**
 * AvatarRetargeter.js
 * Complete 52-bone real-time skeletal retargeting engine for Male and Female Mixamo/GLB rigs.
 *
 * Implements:
 * 1. Coordinate conversion (`landmarksToPoints`) controlled by central `TWIN_CONFIG.MIRROR_MODE`,
 *    supporting both normalized 2D image landmarks and metric 3D world landmarks (`poseWorldLandmarks`).
 * 2. Exact world-space calibrated Neutral Standing Pose (`neutralPoseQuats`) with arms relaxed naturally
 *    at the sides (slight A-pose) and palms facing inward toward the thighs, eliminating any raw GLB T-pose.
 * 3. Independent Left/Right Hand bone-local basis calibration (`handLocalBasisQ`, `handLocalFingerDir`,
 *    `handLocalPalmNormal`, `handLocalThumbDir`) measured directly from each rig's (`male.glb` / `female.glb`)
 *    `Hand`, `HandMiddle1`, `HandIndex1`, and `HandPinky1` bones.
 * 4. Low-latency One-Euro filtering (`OneEuroFilter3D`) per landmark.
 * 5. Orthonormal frame rotations (`Hips`, `Spine`, `Spine1`, `Spine2`, `Neck`, `Head`) relative to rest pose,
 *    supporting full torso flexion and lateral bending (Forward Bend, Side Bend, Trikonasana).
 * 6. Anatomical direction-vector quaternion rotations for shoulders, upper arms, forearms, hands,
 *    thighs, shins, feet, and toes, plus landmark-driven palm orientation (`_applyOpenHandPalmOrientation`).
 * 7. Two-bone IK delegation (`ContactIKSolver`) for Namaste/Anjali Mudra hand joining and Vrikshasana foot contact.
 * 8. Root stability & floor contact pinning so the supporting foot remains grounded on the platform.
 */

import * as THREE from "three";
import { TWIN_CONFIG } from "./TwinConfig.js";
import { ContactIKSolver } from "./HandIK.js";

// MediaPipe 33-landmark indices
export const MP = {
  NOSE: 0,
  L_EYE_INNER: 1,
  L_EYE: 2,
  L_EYE_OUTER: 3,
  R_EYE_INNER: 4,
  R_EYE: 5,
  R_EYE_OUTER: 6,
  L_EAR: 7,
  R_EAR: 8,
  MOUTH_L: 9,
  MOUTH_R: 10,
  L_SHOULDER: 11,
  R_SHOULDER: 12,
  L_ELBOW: 13,
  R_ELBOW: 14,
  L_WRIST: 15,
  R_WRIST: 16,
  L_PINKY: 17,
  R_PINKY: 18,
  L_INDEX: 19,
  R_INDEX: 20,
  L_THUMB: 21,
  R_THUMB: 22,
  L_HIP: 23,
  R_HIP: 24,
  L_KNEE: 25,
  R_KNEE: 26,
  L_ANKLE: 27,
  R_ANKLE: 28,
  L_HEEL: 29,
  R_HEEL: 30,
  L_FOOT_INDEX: 31,
  R_FOOT_INDEX: 32,
};

const AIM_LIMBS = [
  { bone: "LeftShoulder", from: "neck", to: MP.L_SHOULDER, damp: 0.25, maxRad: TWIN_CONFIG.JOINT_LIMITS.clavicleMaxAngleRad },
  { bone: "RightShoulder", from: "neck", to: MP.R_SHOULDER, damp: 0.25, maxRad: TWIN_CONFIG.JOINT_LIMITS.clavicleMaxAngleRad },
  { bone: "LeftArm", from: MP.L_SHOULDER, to: MP.L_ELBOW, isUpperArm: true },
  { bone: "LeftForeArm", from: MP.L_ELBOW, to: MP.L_WRIST, isElbow: true },
  { bone: "LeftHand", from: MP.L_WRIST, to: "lHandTip", damp: 0.80 },
  { bone: "RightArm", from: MP.R_SHOULDER, to: MP.R_ELBOW, isUpperArm: true },
  { bone: "RightForeArm", from: MP.R_ELBOW, to: MP.R_WRIST, isElbow: true },
  { bone: "RightHand", from: MP.R_WRIST, to: "rHandTip", damp: 0.80 },
  { bone: "LeftUpLeg", from: MP.L_HIP, to: MP.L_KNEE },
  { bone: "LeftLeg", from: MP.L_KNEE, to: MP.L_ANKLE, isKnee: true },
  { bone: "LeftFoot", from: MP.L_ANKLE, to: MP.L_FOOT_INDEX, damp: 0.60, maxRad: TWIN_CONFIG.JOINT_LIMITS.ankleMaxAngleRad },
  { bone: "RightUpLeg", from: MP.R_HIP, to: MP.R_KNEE },
  { bone: "RightLeg", from: MP.R_KNEE, to: MP.R_ANKLE, isKnee: true },
  { bone: "RightFoot", from: MP.R_ANKLE, to: MP.R_FOOT_INDEX, damp: 0.60, maxRad: TWIN_CONFIG.JOINT_LIMITS.ankleMaxAngleRad },
];

/**
 * Low-latency 1D One-Euro filter (Casiez et al., CHI 2012)
 */
class OneEuro1D {
  constructor(
    minCutoff = TWIN_CONFIG.ONE_EURO_FILTER.minCutoff,
    beta = TWIN_CONFIG.ONE_EURO_FILTER.beta,
    dCutoff = TWIN_CONFIG.ONE_EURO_FILTER.dCutoff
  ) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }

  reset() {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }

  _alpha(cutoff, dt) {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  filter(x, tSec) {
    if (this.tPrev === null || this.xPrev === null) {
      this.xPrev = x;
      this.tPrev = tSec;
      return x;
    }
    const dt = Math.max(1 / 120, Math.min(0.25, tSec - this.tPrev));
    this.tPrev = tSec;

    const dx = (x - this.xPrev) / dt;
    const edx =
      this._alpha(this.dCutoff, dt) * dx +
      (1 - this._alpha(this.dCutoff, dt)) * this.dxPrev;
    this.dxPrev = edx;

    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    const a = this._alpha(cutoff, dt);
    const xHat = a * x + (1 - a) * this.xPrev;
    this.xPrev = xHat;
    return xHat;
  }
}

class OneEuroFilter3D {
  constructor(minCutoff, beta, dCutoff) {
    this.fx = new OneEuro1D(minCutoff, beta, dCutoff);
    this.fy = new OneEuro1D(minCutoff, beta, dCutoff);
    this.fz = new OneEuro1D(minCutoff, beta, dCutoff);
  }
  reset() {
    this.fx.reset();
    this.fy.reset();
    this.fz.reset();
  }
  filter(vec3, tSec) {
    vec3.x = this.fx.filter(vec3.x, tSec);
    vec3.y = this.fy.filter(vec3.y, tSec);
    vec3.z = this.fz.filter(vec3.z, tSec);
    return vec3;
  }
}

/**
 * Converts 33 MediaPipe landmarks into Three.js world space (+X avatar-left/screen-right, +Y up, +Z toward viewer).
 */
export function landmarksToPoints(landmarks, opts = {}) {
  if (!Array.isArray(landmarks) || landmarks.length < 33) return null;
  const isWorld = Boolean(opts.isWorld);
  const worldLms =
    Array.isArray(opts.worldLandmarks) && opts.worldLandmarks.length >= 33
      ? opts.worldLandmarks
      : null;
  const mirror = opts.mirrorMode ?? TWIN_CONFIG.MIRROR_MODE;
  const depthScale = isWorld ? 0.55 : TWIN_CONFIG.IMAGE_DEPTH_SCALE;

  // Estimate torso scale in 2D so Z depth is proportional to actual 2D body size in frame
  const lSh = landmarks[MP.L_SHOULDER];
  const rSh = landmarks[MP.R_SHOULDER];
  const lHip = landmarks[MP.L_HIP];
  const rHip = landmarks[MP.R_HIP];
  let torso2D = 0.35;
  if (lSh && rSh && lHip && rHip) {
    const shMidX = (lSh.x + rSh.x) * 0.5;
    const shMidY = (lSh.y + rSh.y) * 0.5;
    const hipMidX = (lHip.x + rHip.x) * 0.5;
    const hipMidY = (lHip.y + rHip.y) * 0.5;
    torso2D = Math.max(0.12, Math.hypot(shMidX - hipMidX, shMidY - hipMidY));
  }

  const raw = landmarks.map((lm, idx) => {
    if (!lm || typeof lm.x !== "number" || typeof lm.y !== "number") {
      return { pos: new THREE.Vector3(0, 0, 0), vis: 0 };
    }
    const vis = lm.visibility ?? lm.presence ?? 1.0;
    const xCentered = isWorld ? lm.x : lm.x - 0.5;
    const yCentered = isWorld ? lm.y : lm.y - 0.5;

    let zVal = lm.z ?? 0;
    if (!isWorld && worldLms && worldLms[idx] && typeof worldLms[idx].z === "number") {
      zVal = worldLms[idx].z * (torso2D / 0.48);
    }

    return {
      pos: new THREE.Vector3(
        mirror ? -xCentered : xCentered,
        -yCentered,
        -zVal * depthScale
      ),
      vis,
    };
  });

  if (!mirror) return raw;

  // Swap anatomical L/R pairs so the avatar's Left side (+X) receives the user's mirrored right side
  const SWAP_PAIRS = [
    [MP.L_EYE_INNER, MP.R_EYE_INNER],
    [MP.L_EYE, MP.R_EYE],
    [MP.L_EYE_OUTER, MP.R_EYE_OUTER],
    [MP.L_EAR, MP.R_EAR],
    [MP.MOUTH_L, MP.MOUTH_R],
    [MP.L_SHOULDER, MP.R_SHOULDER],
    [MP.L_ELBOW, MP.R_ELBOW],
    [MP.L_WRIST, MP.R_WRIST],
    [MP.L_PINKY, MP.R_PINKY],
    [MP.L_INDEX, MP.R_INDEX],
    [MP.L_THUMB, MP.R_THUMB],
    [MP.L_HIP, MP.R_HIP],
    [MP.L_KNEE, MP.R_KNEE],
    [MP.L_ANKLE, MP.R_ANKLE],
    [MP.L_HEEL, MP.R_HEEL],
    [MP.L_FOOT_INDEX, MP.R_FOOT_INDEX],
  ];

  const out = raw.slice();
  for (const [lIdx, rIdx] of SWAP_PAIRS) {
    const tmp = out[lIdx];
    out[lIdx] = out[rIdx];
    out[rIdx] = tmp;
  }
  return out;
}

// Scratch quaternions & vectors
const _parentWorldQ = new THREE.Quaternion();
const _deltaWorldQ = new THREE.Quaternion();
const _targetWorldQ = new THREE.Quaternion();
const _targetLocalQ = new THREE.Quaternion();
const _clampAxis = new THREE.Vector3();
const _sideAxis = new THREE.Vector3();
const _upAxis = new THREE.Vector3();
const _fwdAxis = new THREE.Vector3();
const _rotMat = new THREE.Matrix4();

function frameRotation(xAxis, yAxis) {
  const x = xAxis.clone().normalize();
  const y = yAxis.clone().normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  if (z.lengthSq() < 1e-6) return new THREE.Quaternion();
  z.normalize();
  const yOrtho = new THREE.Vector3().crossVectors(z, x).normalize();
  const m = new THREE.Matrix4().makeBasis(x, yOrtho, z);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

function clampQuaternionAngle(q, maxAngleRad) {
  const w = Math.max(-1, Math.min(1, q.w));
  const angle = 2 * Math.acos(Math.abs(w));
  if (angle <= maxAngleRad || angle < 1e-5) return q;
  const sinHalf = Math.sqrt(1 - w * w);
  if (sinHalf < 1e-5) return q;
  const sign = w < 0 ? -1 : 1;
  _clampAxis.set(q.x / sinHalf, q.y / sinHalf, q.z / sinHalf).multiplyScalar(sign);
  return q.setFromAxisAngle(_clampAxis, maxAngleRad);
}

/**
 * Independent retargeter instance bound to a single avatar clone.
 */
export class AvatarRetargeter {
  constructor(avatarInstance, options = {}) {
    this.rootGroup = avatarInstance.rootGroup;
    this.modelRoot = avatarInstance.modelRoot;
    this.bones = avatarInstance.bones;
    this.restQuats = avatarInstance.restQuats;
    this.restPositions = avatarInstance.restPositions;

    this.slerpFactor = options.slerpFactor ?? TWIN_CONFIG.DIGITAL_TWIN_SLERP;
    this.mirrorMode = options.mirrorMode ?? TWIN_CONFIG.MIRROR_MODE;
    this.minConfidence =
      options.minConfidence ?? TWIN_CONFIG.LANDMARK_CONFIDENCE_THRESHOLD;

    // 33 independent One-Euro filters for this twin
    this.filters = Array.from({ length: 33 }, () => new OneEuroFilter3D());
    this.contactIK = new ContactIKSolver();

    this._rigCalibrated = false;
    this.restDirsWorld = {};
    this.restWorldQuats = {};
    this.neutralPoseQuats = {};
    this.lastReliableQuats = {};
    this.handLocalBasisQ = {};
    this.handLocalFingerDir = {};
    this.handLocalPalmNormal = {};
    this.handLocalThumbDir = {};

    this.hipsRestLocalPos = this.bones.Hips
      ? this.bones.Hips.position.clone()
      : new THREE.Vector3();
    this.modelRestPos = this.modelRoot.position.clone();
    this.smoothedRootOffset = new THREE.Vector3();

    this._calibrateRig();
  }

  _calibrateRig() {
    // 1. Temporarily set raw GLB bind pose to measure world bone axes
    for (const [name, bone] of Object.entries(this.bones)) {
      if (this.restQuats[name]) bone.quaternion.copy(this.restQuats[name]);
      if (this.restPositions[name]) bone.position.copy(this.restPositions[name]);
    }
    this.modelRoot.position.copy(this.modelRestPos || new THREE.Vector3());
    this.modelRoot.updateMatrixWorld(true);

    for (const [name, bone] of Object.entries(this.bones)) {
      this.restWorldQuats[name] = bone.getWorldQuaternion(new THREE.Quaternion());
      this.neutralPoseQuats[name] = bone.quaternion.clone();
      this.lastReliableQuats[name] = bone.quaternion.clone();
    }

    const CHILD_OF = {
      LeftShoulder: "LeftArm",
      RightShoulder: "RightArm",
      LeftArm: "LeftForeArm",
      LeftForeArm: "LeftHand",
      LeftHand: "LeftHandMiddle1",
      RightArm: "RightForeArm",
      RightForeArm: "RightHand",
      RightHand: "RightHandMiddle1",
      LeftUpLeg: "LeftLeg",
      LeftLeg: "LeftFoot",
      LeftFoot: "LeftToeBase",
      RightUpLeg: "RightLeg",
      RightLeg: "RightFoot",
      RightFoot: "RightToeBase",
    };

    for (const [bName, cName] of Object.entries(CHILD_OF)) {
      const b = this.bones[bName];
      const c = this.bones[cName];
      if (!b || !c) continue;
      const p0 = b.getWorldPosition(new THREE.Vector3());
      const p1 = c.getWorldPosition(new THREE.Vector3());
      const dir = p1.sub(p0);
      if (dir.lengthSq() > 1e-6) {
        this.restDirsWorld[bName] = dir.normalize();
      }
    }

    // 2. Calibrate exact bone-local hand basis (Finger dir, Palm normal, Thumb side) independently for LeftHand & RightHand
    for (const side of ["Left", "Right"]) {
      const isLeft = side === "Left";
      const handName = `${side}Hand`;
      const hand = this.bones[handName];
      const mid1 = this.bones[`${side}HandMiddle1`];
      const idx1 = this.bones[`${side}HandIndex1`];
      const pnk1 = this.bones[`${side}HandPinky1`];
      if (!hand || !mid1 || !idx1 || !pnk1) continue;

      const wQ = hand.getWorldQuaternion(new THREE.Quaternion());
      const invWQ = wQ.clone().invert();
      const pHand = hand.getWorldPosition(new THREE.Vector3());
      const pMid1 = mid1.getWorldPosition(new THREE.Vector3());
      const pIdx1 = idx1.getWorldPosition(new THREE.Vector3());
      const pPnk1 = pnk1.getWorldPosition(new THREE.Vector3());

      const localFinger = pMid1.clone().sub(pHand).applyQuaternion(invWQ).normalize();
      const localPinkyToIndex = pIdx1.clone().sub(pPnk1).applyQuaternion(invWQ).normalize();
      const localPalmNormal = isLeft
        ? new THREE.Vector3().crossVectors(localFinger, localPinkyToIndex).normalize()
        : new THREE.Vector3().crossVectors(localPinkyToIndex, localFinger).normalize();
      const localSide = new THREE.Vector3().crossVectors(localFinger, localPalmNormal).normalize();
      const localPalmOrtho = new THREE.Vector3().crossVectors(localSide, localFinger).normalize();

      const localMat = new THREE.Matrix4().makeBasis(localSide, localFinger, localPalmOrtho);
      this.handLocalBasisQ[handName] = new THREE.Quaternion().setFromRotationMatrix(localMat);
      this.handLocalFingerDir[handName] = localFinger;
      this.handLocalPalmNormal[handName] = localPalmOrtho;
      this.handLocalThumbDir[handName] = localPinkyToIndex;
    }

    // 3. Compute exact world-space Neutral Standing Pose quaternions (arms relaxed at sides, slight A-pose)
    const NEUTRAL_LIMB_DIRS = [
      { bone: "LeftArm", dir: new THREE.Vector3(0.15, -0.988, 0.02).normalize() },
      { bone: "LeftForeArm", dir: new THREE.Vector3(0.10, -0.988, 0.10).normalize() },
      { bone: "LeftHand", dir: new THREE.Vector3(0.06, -0.992, 0.08).normalize() },
      { bone: "RightArm", dir: new THREE.Vector3(-0.15, -0.988, 0.02).normalize() },
      { bone: "RightForeArm", dir: new THREE.Vector3(-0.10, -0.988, 0.10).normalize() },
      { bone: "RightHand", dir: new THREE.Vector3(-0.06, -0.992, 0.08).normalize() },
    ];

    for (const { bone: bName, dir: desDir } of NEUTRAL_LIMB_DIRS) {
      const bone = this.bones[bName];
      const restDir = this.restDirsWorld[bName];
      const restWQ = this.restWorldQuats[bName];
      if (!bone || !restDir || !restWQ) continue;

      _deltaWorldQ.setFromUnitVectors(restDir, desDir);
      _targetWorldQ.multiplyQuaternions(_deltaWorldQ, restWQ);
      bone.parent.updateWorldMatrix(true, false);
      bone.parent.getWorldQuaternion(_parentWorldQ);
      _targetLocalQ.copy(_parentWorldQ).invert().multiply(_targetWorldQ);

      bone.quaternion.copy(_targetLocalQ);
      bone.updateMatrixWorld(true);
      this.neutralPoseQuats[bName] = _targetLocalQ.clone();
      this.lastReliableQuats[bName] = _targetLocalQ.clone();
    }

    // Also orient neutral LeftHand & RightHand palms inward toward the thighs
    for (const side of ["Left", "Right"]) {
      const isLeft = side === "Left";
      const handName = `${side}Hand`;
      const handBone = this.bones[handName];
      const localBasisQ = this.handLocalBasisQ[handName];
      if (!handBone || !localBasisQ) continue;

      const desFinger = new THREE.Vector3(isLeft ? 0.06 : -0.06, -0.992, 0.08).normalize();
      const desPalm = new THREE.Vector3(isLeft ? -0.96 : 0.96, 0, -0.25).normalize();
      _upAxis.copy(desFinger);
      _fwdAxis.copy(desPalm);
      _sideAxis.crossVectors(_upAxis, _fwdAxis).normalize();
      _fwdAxis.crossVectors(_sideAxis, _upAxis).normalize();
      _rotMat.makeBasis(_sideAxis, _upAxis, _fwdAxis);
      _targetWorldQ.setFromRotationMatrix(_rotMat).multiply(localBasisQ.clone().invert());

      handBone.parent.updateWorldMatrix(true, false);
      handBone.parent.getWorldQuaternion(_parentWorldQ);
      _targetLocalQ.copy(_parentWorldQ).invert().multiply(_targetWorldQ);
      handBone.quaternion.copy(_targetLocalQ);
      handBone.updateMatrixWorld(true);
      this.neutralPoseQuats[handName] = _targetLocalQ.clone();
      this.lastReliableQuats[handName] = _targetLocalQ.clone();
    }

    this._rigCalibrated = true;

    // 4. Immediately apply the neutral standing pose and reveal the avatar (never showing a T-pose)
    this.snapToNeutralStandingPose();
    if (this.rootGroup) {
      this.rootGroup.visible = true;
    }
  }

  /**
   * Immediately snaps all 52 bones to the calibrated neutral standing posture (arms relaxed at sides).
   */
  snapToNeutralStandingPose() {
    for (const [name, bone] of Object.entries(this.bones)) {
      const nQ = this.neutralPoseQuats[name] || this.restQuats[name];
      if (nQ) {
        bone.quaternion.copy(nQ);
        this.lastReliableQuats[name] = nQ.clone();
      }
      if (this.restPositions[name]) {
        bone.position.copy(this.restPositions[name]);
      }
    }
    this.modelRoot.position.copy(this.modelRestPos || new THREE.Vector3());
    this.smoothedRootOffset.set(0, 0, 0);
    this._pinLowestFootToFloor(1.0);
    this.contactIK.reset();
    this.filters.forEach((f) => f.reset());
  }

  resetToNeutralImmediate() {
    this.snapToNeutralStandingPose();
  }

  /**
   * Smoothly transitions the avatar toward the calibrated natural relaxed standing posture
   * (arms resting comfortably at the sides, never T-pose).
   */
  transitionTowardNeutral(slerp = TWIN_CONFIG.NEUTRAL_RETURN_SLERP) {
    if (!this._rigCalibrated) this._calibrateRig();

    for (const [name, bone] of Object.entries(this.bones)) {
      const targetQ = this.neutralPoseQuats[name] || this.restQuats[name];
      if (!targetQ) continue;
      bone.quaternion.slerp(targetQ, slerp);
      this.lastReliableQuats[name] = bone.quaternion.clone();
    }

    if (this.bones.Hips) {
      this.bones.Hips.position.lerp(this.hipsRestLocalPos, slerp);
    }
    this.smoothedRootOffset.lerp(new THREE.Vector3(0, 0, 0), slerp);
    this.modelRoot.position.x = this.modelRestPos.x + this.smoothedRootOffset.x;
    this.modelRoot.position.z = this.modelRestPos.z + this.smoothedRootOffset.z;
    this._pinLowestFootToFloor(slerp);
    this.contactIK.reset();
  }

  /**
   * Retargets a frame of 33 landmarks onto the avatar's 52-bone skeleton.
   *
   * @param {Array<{x:number, y:number, z?:number, visibility?:number}>} landmarks
   * @param {object} [opts]
   * @param {boolean} [opts.isWorld=false]
   * @param {Array<{x:number, y:number, z?:number, visibility?:number}>} [opts.worldLandmarks=null]
   * @param {number} [opts.timestampSec]
   * @param {number} [opts.slerpOverride]
   * @param {boolean} [opts.allowTreePoseIK=true]
   */
  applyLandmarks(landmarks, opts = {}) {
    if (!this._rigCalibrated) this._calibrateRig();

    const pts = landmarksToPoints(landmarks, {
      isWorld: opts.isWorld,
      worldLandmarks: opts.worldLandmarks,
      mirrorMode: this.mirrorMode,
    });
    if (!pts) {
      this.transitionTowardNeutral();
      return false;
    }

    // Verify core torso landmarks are visible; if user stepped out of frame, smoothly return to neutral
    const coreVisible =
      pts[MP.L_SHOULDER].vis >= this.minConfidence &&
      pts[MP.R_SHOULDER].vis >= this.minConfidence &&
      pts[MP.L_HIP].vis >= this.minConfidence &&
      pts[MP.R_HIP].vis >= this.minConfidence;

    if (!coreVisible) {
      this.transitionTowardNeutral();
      return false;
    }

    // Apply low-latency One-Euro filter to each visible landmark
    const nowSec = opts.timestampSec ?? performance.now() * 0.001;
    for (let i = 0; i < 33; i++) {
      if (pts[i].vis >= this.minConfidence) {
        this.filters[i].filter(pts[i].pos, nowSec);
      }
    }

    const slerp = opts.slerpOverride ?? this.slerpFactor;
    const minVis = this.minConfidence;

    // Reset modelRoot position before computing world-to-local bone rotations
    this.modelRoot.position.copy(this.modelRestPos);
    if (this.bones.Hips) {
      this.bones.Hips.position.copy(this.hipsRestLocalPos);
    }
    this.modelRoot.updateMatrixWorld(true);

    // Virtual anatomical landmarks
    const hipCenter = new THREE.Vector3()
      .addVectors(pts[MP.L_HIP].pos, pts[MP.R_HIP].pos)
      .multiplyScalar(0.5);
    const shoulderCenter = new THREE.Vector3()
      .addVectors(pts[MP.L_SHOULDER].pos, pts[MP.R_SHOULDER].pos)
      .multiplyScalar(0.5);
    const spineUp = new THREE.Vector3().subVectors(shoulderCenter, hipCenter);
    const torsoLen = spineUp.length();
    if (torsoLen < 1e-4) return false;

    const virtual = {
      neck: {
        pos: shoulderCenter,
        vis: Math.min(pts[MP.L_SHOULDER].vis, pts[MP.R_SHOULDER].vis),
      },
      lHandTip: {
        pos: new THREE.Vector3()
          .addVectors(pts[MP.L_INDEX].pos, pts[MP.L_PINKY].pos)
          .multiplyScalar(0.5),
        vis: Math.min(pts[MP.L_INDEX].vis, pts[MP.L_PINKY].vis),
      },
      rHandTip: {
        pos: new THREE.Vector3()
          .addVectors(pts[MP.R_INDEX].pos, pts[MP.R_PINKY].pos)
          .multiplyScalar(0.5),
        vis: Math.min(pts[MP.R_INDEX].vis, pts[MP.R_PINKY].vis),
      },
    };
    const getPt = (k) => (typeof k === "number" ? pts[k] : virtual[k]);

    // ── 1. Torso & Pelvis Orthonormal Frames ─────────────────────────────────
    const hipLeft = new THREE.Vector3().subVectors(
      pts[MP.L_HIP].pos,
      pts[MP.R_HIP].pos
    );
    const shLeft = new THREE.Vector3().subVectors(
      pts[MP.L_SHOULDER].pos,
      pts[MP.R_SHOULDER].pos
    );

    // Filter excessive monocular depth skew on lateral hip/shoulder vectors while preserving coronal/sagittal tilt
    const hipXY = Math.max(0.04, Math.hypot(hipLeft.x, hipLeft.y));
    const shXY = Math.max(0.04, Math.hypot(shLeft.x, shLeft.y));
    hipLeft.z = THREE.MathUtils.clamp(hipLeft.z, -hipXY * 0.45, hipXY * 0.45);
    shLeft.z = THREE.MathUtils.clamp(shLeft.z, -shXY * 0.55, shXY * 0.55);

    // Detect deep forward fold (Uttanasana / Pada-hastasana) where shoulders drop near or below hip level
    const isForwardFold =
      spineUp.y < 0.18 * torsoLen && Math.abs(spineUp.x) < 0.45 * torsoLen;
    if (isForwardFold) {
      // Ensure forward fold pitches toward +Z (front of body) rather than folding straight vertical or backward
      spineUp.z = Math.max(spineUp.z, 0.24 * torsoLen);
    }

    const pelvisWorldQ = frameRotation(hipLeft, spineUp);
    const chestWorldQ = frameRotation(shLeft, spineUp);

    // Allow full coronal side-bends (Trikonasana / Side Bend) and deep forward bends (Pada-hastasana up to ~135 deg)
    clampQuaternionAngle(pelvisWorldQ, isForwardFold ? 1.95 : 1.15);
    clampQuaternionAngle(chestWorldQ, isForwardFold ? 2.35 : 1.65);

    const hipsDamp = isForwardFold ? 0.12 : 0.25;
    this._applyWorldQuat(
      "Hips",
      pelvisWorldQ.clone().slerp(new THREE.Quaternion(), hipsDamp),
      slerp
    );

    const spineStep1 = pelvisWorldQ.clone().slerp(chestWorldQ, isForwardFold ? 0.65 : 0.35);
    const spineStep2 = pelvisWorldQ.clone().slerp(chestWorldQ, isForwardFold ? 0.88 : 0.70);
    const spineStep3 = chestWorldQ.clone();

    this._applyWorldQuat("Spine", spineStep1, slerp);
    this._applyWorldQuat("Spine1", spineStep2, slerp);
    this._applyWorldQuat("Spine2", spineStep3, slerp);

    // ── 2. Neck & Head Orientation ───────────────────────────────────────────
    if (
      pts[MP.L_EAR].vis >= minVis &&
      pts[MP.R_EAR].vis >= minVis &&
      pts[MP.NOSE].vis >= minVis
    ) {
      const earLeft = new THREE.Vector3().subVectors(
        pts[MP.L_EAR].pos,
        pts[MP.R_EAR].pos
      );
      const earMid = new THREE.Vector3()
        .addVectors(pts[MP.L_EAR].pos, pts[MP.R_EAR].pos)
        .multiplyScalar(0.5);
      const headUp = new THREE.Vector3().subVectors(earMid, shoulderCenter);
      if (headUp.lengthSq() > 1e-5 && earLeft.lengthSq() > 1e-5) {
        const rawHeadQ = frameRotation(earLeft, headUp);
        const relHeadQ = chestWorldQ.clone().invert().multiply(rawHeadQ);
        clampQuaternionAngle(relHeadQ, TWIN_CONFIG.JOINT_LIMITS.headMaxAngleRad);
        const clampedHeadWorldQ = chestWorldQ.clone().multiply(relHeadQ);
        const neckWorldQ = chestWorldQ.clone().slerp(clampedHeadWorldQ, 0.45);
        this._applyWorldQuat("Neck", neckWorldQ, slerp);
        this._applyWorldQuat("Head", clampedHeadWorldQ, slerp);
      }
    }

    // ── 3. Limbs (Shoulders, Arms, Forearms, Hands, Legs, Feet) ──────────────
    for (const spec of AIM_LIMBS) {
      const bone = this.bones[spec.bone];
      const restDir = this.restDirsWorld[spec.bone];
      const restWQ = this.restWorldQuats[spec.bone];
      if (!bone || !restDir || !restWQ) continue;

      const a = getPt(spec.from);
      const b = getPt(spec.to);
      if (!a || !b || a.vis < minVis || b.vis < minVis) {
        if (this.lastReliableQuats[spec.bone]) {
          bone.quaternion.slerp(this.lastReliableQuats[spec.bone], slerp * 0.5);
          bone.updateMatrixWorld(true);
        }
        continue;
      }

      const curDir = new THREE.Vector3().subVectors(b.pos, a.pos);
      if (curDir.lengthSq() < 1e-6) continue;

      // Prevent monocular Z foreshortening from pitching upper arms forward toward camera when elbows are below shoulders
      if (spec.isUpperArm && curDir.y < 0) {
        const xyLen = Math.hypot(curDir.x, curDir.y);
        if (xyLen > 1e-4) {
          curDir.z = THREE.MathUtils.clamp(curDir.z, -xyLen * 0.35, xyLen * 0.35);
        }
      }

      curDir.normalize();

      _deltaWorldQ.setFromUnitVectors(restDir, curDir);
      if (spec.damp !== undefined && spec.damp < 1) {
        _deltaWorldQ.slerp(new THREE.Quaternion(), 1 - spec.damp);
      }
      if (spec.maxRad !== undefined) {
        clampQuaternionAngle(_deltaWorldQ, spec.maxRad);
      }

      _targetWorldQ.multiplyQuaternions(_deltaWorldQ, restWQ);
      bone.parent.updateWorldMatrix(true, false);
      bone.parent.getWorldQuaternion(_parentWorldQ);
      _targetLocalQ.copy(_parentWorldQ).invert().multiply(_targetWorldQ);

      // Anatomical clamping on local hinge joints (elbows & knees)
      if (spec.isKnee || spec.isElbow) {
        clampQuaternionAngle(
          _targetLocalQ,
          spec.isKnee
            ? TWIN_CONFIG.JOINT_LIMITS.kneeMaxAngleRad
            : TWIN_CONFIG.JOINT_LIMITS.elbowMaxAngleRad
        );
      }

      bone.quaternion.slerp(_targetLocalQ, slerp);
      this.lastReliableQuats[spec.bone] = bone.quaternion.clone();
      bone.updateMatrixWorld(true);
    }

    // ── 4. Palm Normal Orientation from Hand Landmarks (When Hands Are Separated) ─
    this._applyOpenHandPalmOrientation(pts, minVis, slerp, opts.poseName);

    // ── 5. Two-Bone Contact IK (Tadasana Interlocked Hands, Namaste & Vrikshasana Foot) ─
    this.contactIK.applyHandJoiningIK({
      bones: this.bones,
      restQuats: this.restQuats,
      handLocalBasisQ: this.handLocalBasisQ,
      pts,
      minConfidence: minVis,
      poseName: opts.poseName || "",
      handConfigMode: opts.handConfigMode || null,
      nowMs: nowSec * 1000,
    });

    this.contactIK.applyTreePoseFootIK({
      bones: this.bones,
      pts,
      minConfidence: minVis,
      allowTreePoseIK: opts.allowTreePoseIK ?? true,
    });

    // ── 6. Subtle Root Horizontal Tracking & Floor Contact Pinning ───────────
    const targetOffsetX = THREE.MathUtils.clamp(
      hipCenter.x * 0.45,
      -TWIN_CONFIG.MAX_ROOT_HORIZONTAL_OFFSET,
      TWIN_CONFIG.MAX_ROOT_HORIZONTAL_OFFSET
    );
    this.smoothedRootOffset.x = THREE.MathUtils.lerp(
      this.smoothedRootOffset.x,
      targetOffsetX,
      TWIN_CONFIG.ROOT_POSITION_LERP
    );
    this.modelRoot.position.x = this.modelRestPos.x + this.smoothedRootOffset.x;

    this._pinLowestFootToFloor(0.35);

    return true;
  }

  _applyWorldQuat(boneName, targetWorldQ, slerp) {
    const bone = this.bones[boneName];
    const restWQ = this.restWorldQuats[boneName];
    if (!bone || !restWQ) return;

    bone.parent.updateWorldMatrix(true, false);
    bone.parent.getWorldQuaternion(_parentWorldQ);
    _targetWorldQ.multiplyQuaternions(targetWorldQ, restWQ);
    _targetLocalQ.copy(_parentWorldQ).invert().multiply(_targetWorldQ);
    bone.quaternion.slerp(_targetLocalQ, slerp);
    this.lastReliableQuats[boneName] = bone.quaternion.clone();
    bone.updateMatrixWorld(true);
  }

  /**
   * Calculates palm orientation from wrist, index MCP, and pinky MCP landmarks
   * when hands are separated, converting into each avatar's calibrated local hand bone basis.
   */
  _applyOpenHandPalmOrientation(pts, minVis, slerp, poseName = "") {
    if (this.contactIK.currentHandBlend > 0.5) return;

    const lSh = pts[MP.L_SHOULDER];
    const rSh = pts[MP.R_SHOULDER];
    const lHip = pts[MP.L_HIP];
    const rHip = pts[MP.R_HIP];
    const shoulderWidth =
      lSh && rSh ? Math.max(0.08, lSh.pos.distanceTo(rSh.pos)) : 0.25;
    const hipY =
      lHip && rHip ? (lHip.pos.y + rHip.pos.y) * 0.5 : -0.15;
    const shY =
      lSh && rSh ? (lSh.pos.y + rSh.pos.y) * 0.5 : 0.20;

    const normPose = String(poseName || "").toLowerCase();
    const isTadasana =
      normPose.includes("tadasana") || normPose.includes("mountain");
    const isSavasana =
      normPose.includes("savasana") || normPose.includes("corpse");
    const isTrikonasana =
      normPose.includes("trikonasana") || normPose.includes("triangle");

    const orientOpenSide = (isLeft) => {
      const side = isLeft ? "Left" : "Right";
      const handName = `${side}Hand`;
      const handBone = this.bones[handName];
      const foreBone = this.bones[`${side}ForeArm`];
      const localBasisQ = this.handLocalBasisQ[handName];
      if (!handBone || !foreBone || !localBasisQ) return;

      const wr = pts[isLeft ? MP.L_WRIST : MP.R_WRIST];
      const el = pts[isLeft ? MP.L_ELBOW : MP.R_ELBOW];
      const idx = pts[isLeft ? MP.L_INDEX : MP.R_INDEX];
      const pnk = pts[isLeft ? MP.L_PINKY : MP.R_PINKY];
      if (!wr || !el || wr.vis < minVis || el.vis < minVis) return;

      // 1. Finger direction from wrist -> midpoint(index, pinky), fallback to forearm direction
      const fingerDir = new THREE.Vector3();
      if (idx && pnk && idx.vis >= minVis * 0.8 && pnk.vis >= minVis * 0.8) {
        const midTip = new THREE.Vector3().addVectors(idx.pos, pnk.pos).multiplyScalar(0.5);
        fingerDir.subVectors(midTip, wr.pos);
      }
      if (fingerDir.lengthSq() < 1e-5) {
        fingerDir.subVectors(wr.pos, el.pos);
      }
      if (fingerDir.lengthSq() < 1e-5) return;
      fingerDir.normalize();

      // 2. Anatomical prior for palm normal based on asana & arm posture:
      const isArmWideHorizontal =
        Math.abs(wr.pos.x) > shoulderWidth * 0.95 &&
        wr.pos.y > hipY + 0.15 * (shY - hipY) &&
        wr.pos.y < shY + 0.35 * (shY - hipY);

      let priorPalm;
      if (isTadasana && wr.pos.y > shY + 0.15 * (shY - hipY)) {
        // Tadasana overhead stretch: palms turn upward toward ceiling (+Y)
        priorPalm = new THREE.Vector3(0, 1, 0.12).normalize();
      } else if (isSavasana) {
        // Savasana: palms turned upward/open (+Z/+Y)
        priorPalm = new THREE.Vector3(0, 0.35, 0.94).normalize();
      } else if (isTrikonasana) {
        // Trikonasana: palms face forward (+Z) in coronal plane
        priorPalm = new THREE.Vector3(0, 0, 1);
      } else if (isArmWideHorizontal) {
        priorPalm = new THREE.Vector3(0, -1, 0.15).normalize();
      } else {
        priorPalm = new THREE.Vector3(isLeft ? -1 : 1, 0, 0.10).normalize();
      }

      // 3. Landmark-derived palm normal from cross(fingerDir, pinkyToIndex)
      const palmNormal = priorPalm.clone();
      if (idx && pnk && idx.vis >= minVis && pnk.vis >= minVis) {
        const pinkyToIndex = new THREE.Vector3().subVectors(idx.pos, pnk.pos);
        if (pinkyToIndex.lengthSq() > 1e-5) {
          pinkyToIndex.normalize();
          const rawNormal = isLeft
            ? new THREE.Vector3().crossVectors(fingerDir, pinkyToIndex)
            : new THREE.Vector3().crossVectors(pinkyToIndex, fingerDir);
          if (rawNormal.lengthSq() > 1e-4) {
            rawNormal.normalize();
            // Ensure landmark depth noise never flips the palm backward (>90 deg from anatomical prior)
            if (rawNormal.dot(priorPalm) < 0) {
              rawNormal.negate();
            }
            palmNormal.lerp(rawNormal, 0.45).normalize();
          }
        }
      }

      // Build orthonormal world basis and convert using calibrated `localBasisQ`
      _upAxis.copy(fingerDir);
      _fwdAxis.copy(palmNormal);
      _sideAxis.crossVectors(_upAxis, _fwdAxis);
      if (_sideAxis.lengthSq() < 1e-5) return;
      _sideAxis.normalize();
      _fwdAxis.crossVectors(_sideAxis, _upAxis).normalize();

      _rotMat.makeBasis(_sideAxis, _upAxis, _fwdAxis);
      _targetWorldQ.setFromRotationMatrix(_rotMat).multiply(localBasisQ.clone().invert());

      foreBone.updateWorldMatrix(true, false);
      foreBone.getWorldQuaternion(_parentWorldQ);
      _targetLocalQ.copy(_parentWorldQ).invert().multiply(_targetWorldQ);
      clampQuaternionAngle(_targetLocalQ, 1.05); // Prevent unnatural wrist twist > 60 deg
      handBone.quaternion.slerp(_targetLocalQ, slerp * 0.75);
      handBone.updateMatrixWorld(true);

      // Keep fingers naturally extended at rest
      for (const fname of ["Thumb", "Index", "Middle", "Ring", "Pinky"]) {
        for (let j = 1; j <= 3; j++) {
          const bName = `${side}Hand${fname}${j}`;
          const fBone = this.bones[bName];
          const rQ = this.restQuats[bName];
          if (fBone && rQ) {
            fBone.quaternion.slerp(rQ, slerp * 0.5);
          }
        }
      }
    };

    orientOpenSide(true);
    orientOpenSide(false);
  }

  /**
   * Returns the current world-space palm normal and finger direction for a hand ("Left" or "Right").
   * Useful for automated verification tests.
   */
  getHandWorldAxes(side = "Left") {
    const handName = `${side}Hand`;
    const handBone = this.bones[handName];
    const localFinger = this.handLocalFingerDir[handName];
    const localPalm = this.handLocalPalmNormal[handName];
    const localThumb = this.handLocalThumbDir[handName];
    if (!handBone || !localFinger || !localPalm) return null;

    handBone.updateWorldMatrix(true, false);
    const wQ = handBone.getWorldQuaternion(new THREE.Quaternion());
    return {
      fingerDir: localFinger.clone().applyQuaternion(wQ).normalize(),
      palmNormal: localPalm.clone().applyQuaternion(wQ).normalize(),
      thumbDir: localThumb ? localThumb.clone().applyQuaternion(wQ).normalize() : null,
      wristPos: handBone.getWorldPosition(new THREE.Vector3()),
    };
  }

  _pinLowestFootToFloor(lerpFactor = 0.35) {
    this.modelRoot.updateMatrixWorld(true);
    const footBones = [
      this.bones.LeftFoot,
      this.bones.RightFoot,
      this.bones.LeftToeBase,
      this.bones.RightToeBase,
    ].filter(Boolean);

    if (footBones.length === 0) return;

    let minY = Infinity;
    const tmp = new THREE.Vector3();
    for (const fb of footBones) {
      fb.getWorldPosition(tmp);
      if (tmp.y < minY) minY = tmp.y;
    }

    if (Number.isFinite(minY)) {
      const soleOffset = 0.032;
      const desiredDeltaY = -(minY - soleOffset);
      const targetY = this.modelRoot.position.y + desiredDeltaY;
      this.modelRoot.position.y = THREE.MathUtils.lerp(
        this.modelRoot.position.y,
        targetY,
        lerpFactor
      );
      this.modelRoot.updateMatrixWorld(true);
    }
  }
}
