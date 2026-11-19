/**
 * CorrectiveTwin.js
 * Dedicated controller for the Corrective Twin + 3D Glowing Skeletal Highlight Overlay.
 *
 * Strictly enforces:
 * - Remains in a calm, relaxed neutral home-standing posture (arms resting naturally at the sides,
 *   never a T-pose, never performing Vrikshasana during Tadasana) when `isFeedbackEnabled` is false
 *   or when the user's posture is aligned (`GOOD_FORM` / `IDLE`).
 * - Activates ONLY after `isFeedbackEnabled` (`isRecording && isFullBodyDetected && isTrackingStable`)
 *   is true AND the existing corrective-feedback engine reports a genuine error for >= 400 ms.
 * - Demonstrates hybrid corrections (user's live coordinates for correct joints + engine's
 *   corrected coordinates only for incorrect joints) via `CorrectiveCoordinateAdapter`.
 * - Immediately clears obsolete correction data when `poseName` changes or when tracking/recording stops.
 */

import * as THREE from "three";
import { AvatarRetargeter } from "./AvatarRetargeter.js";
import {
  CorrectiveCoordinateAdapter,
  isTreePoseName,
} from "./CorrectiveCoordinateAdapter.js";
import { TWIN_CONFIG } from "./TwinConfig.js";

/**
 * Bone connection pairs for the glowing green skeletal overlay on the Corrective Twin.
 */
const OVERLAY_BONE_LINKS = [
  ["LeftShoulder", "RightShoulder"],
  ["LeftShoulder", "LeftArm"],
  ["LeftArm", "LeftForeArm"],
  ["LeftForeArm", "LeftHand"],
  ["RightShoulder", "RightArm"],
  ["RightArm", "RightForeArm"],
  ["RightForeArm", "RightHand"],
  ["Spine2", "Spine1"],
  ["Spine1", "Spine"],
  ["Spine", "Hips"],
  ["LeftShoulder", "Hips"],
  ["RightShoulder", "Hips"],
  ["Hips", "LeftUpLeg"],
  ["LeftUpLeg", "LeftLeg"],
  ["LeftLeg", "LeftFoot"],
  ["Hips", "RightUpLeg"],
  ["RightUpLeg", "RightLeg"],
  ["RightLeg", "RightFoot"],
];

const OVERLAY_JOINT_NAMES = [
  "LeftShoulder",
  "RightShoulder",
  "LeftArm",
  "RightArm",
  "LeftForeArm",
  "RightForeArm",
  "LeftHand",
  "RightHand",
  "Spine2",
  "Spine1",
  "Hips",
  "LeftUpLeg",
  "RightUpLeg",
  "LeftLeg",
  "RightLeg",
  "LeftFoot",
  "RightFoot",
];

export class CorrectiveTwinController {
  /**
   * @param {object} avatarInstance - Independent cloned avatar from `AvatarLoader`
   * @param {object} [options]
   */
  constructor(avatarInstance, options = {}) {
    this.id = "corrective-twin";
    this.avatarInstance = avatarInstance;
    this.rootGroup = avatarInstance.rootGroup;
    this.bones = avatarInstance.bones;

    this.retargeter = new AvatarRetargeter(avatarInstance, {
      slerpFactor: options.slerpFactor ?? TWIN_CONFIG.CORRECTIVE_TWIN_SLERP,
      mirrorMode: options.mirrorMode ?? TWIN_CONFIG.MIRROR_MODE,
      minConfidence:
        options.minConfidence ?? TWIN_CONFIG.LANDMARK_CONFIDENCE_THRESHOLD,
    });

    this.adapter = new CorrectiveCoordinateAdapter(options.adapterOptions);

    this.liveLandmarks = null;
    this.correctionState = {};
    this.poseName = "";
    this.isFeedbackEnabled = true;
    this.isActive = false;
    this.affectedGroups = [];
    this.affectedBones = new Set();
    this.statusLabel = "Idle — Awaiting user pose";

    // Build 3D glowing green skeletal overlay (matching reference UI screenshot)
    this.overlayGroup = new THREE.Group();
    this.overlayGroup.name = "CorrectiveSkeletalOverlay";
    this.jointMeshes = {};
    this._buildSkeletalOverlay();
    this.rootGroup.add(this.overlayGroup);

    // Start immediately in calibrated relaxed neutral standing posture (arms at sides, never T-pose)
    this.retargeter.snapToNeutralStandingPose();
    this._updateSkeletalOverlay(0);
  }

  _buildSkeletalOverlay() {
    const numLinks = OVERLAY_BONE_LINKS.length;
    const positions = new Float32Array(numLinks * 2 * 3);
    const colors = new Float32Array(numLinks * 2 * 3);

    this.lineGeo = new THREE.BufferGeometry();
    this.lineGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );
    this.lineGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    this.lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      linewidth: 2,
    });

    this.lineSegments = new THREE.LineSegments(this.lineGeo, this.lineMat);
    this.lineSegments.renderOrder = 10;
    this.overlayGroup.add(this.lineSegments);

    const sphereGeo = new THREE.SphereGeometry(0.022, 12, 12);
    for (const jName of OVERLAY_JOINT_NAMES) {
      const mat = new THREE.MeshBasicMaterial({
        color: TWIN_CONFIG.CORRECTIVE_TWIN.highlightColorHex,
        transparent: true,
        opacity: 0.92,
        depthTest: false,
      });
      const mesh = new THREE.Mesh(sphereGeo, mat);
      mesh.renderOrder = 11;
      this.jointMeshes[jName] = mesh;
      this.overlayGroup.add(mesh);
    }
  }

  /**
   * Feeds latest user landmarks + correction engine state into the Corrective Twin.
   */
  setInputs({ liveLandmarks, correctionState, poseName, isFeedbackEnabled = true }) {
    if (poseName !== undefined && poseName !== this.poseName) {
      this.poseName = poseName;
      this.adapter.reset();
    }
    this.isFeedbackEnabled = Boolean(isFeedbackEnabled);
    this.liveLandmarks = this.isFeedbackEnabled ? liveLandmarks : null;
    if (correctionState) this.correctionState = correctionState;
  }

  /**
   * Per-frame update called by `TwinAnimationController`.
   * @param {number} nowMs
   */
  update(nowMs = performance.now()) {
    const res = this.adapter.update({
      liveLandmarks: this.liveLandmarks,
      correctionState: this.correctionState,
      poseName: this.poseName,
      isFeedbackEnabled: this.isFeedbackEnabled,
      nowMs,
    });

    this.isActive = res.active;
    this.affectedGroups = res.affectedGroups;
    this.affectedBones = new Set(res.affectedBones);
    this.statusLabel = res.statusLabel;

    if (this.isActive && Array.isArray(res.correctedLandmarks)) {
      // Active correction demonstration: smoothly animate toward hybrid corrected coordinates.
      // Pass `poseName` so Tadasana uses overhead interlocked hands (+Y palms) and Tree Pose uses Namaste + foot IK.
      this.retargeter.applyLandmarks(res.correctedLandmarks, {
        isWorld: false,
        timestampSec: nowMs * 0.001,
        slerpOverride: TWIN_CONFIG.CORRECTIVE_TWIN_SLERP,
        poseName: this.poseName,
        allowTreePoseIK: isTreePoseName(this.poseName),
      });
    } else {
      // When user's pose is correct, before recording starts, or when tracking is lost:
      // Corrective Twin smoothly holds the natural relaxed home-standing posture (never T-pose)
      this.retargeter.transitionTowardNeutral(TWIN_CONFIG.NEUTRAL_RETURN_SLERP);
    }

    this._updateSkeletalOverlay(nowMs);
  }

  _updateSkeletalOverlay(nowMs) {
    this.rootGroup.updateMatrixWorld(true);

    const posAttr = this.lineGeo.attributes.position;
    const colAttr = this.lineGeo.attributes.color;
    const pA = new THREE.Vector3();
    const pB = new THREE.Vector3();

    const pulse = this.isActive
      ? 0.8 + 0.2 * Math.sin(nowMs * 0.006)
      : 0.45;

    const activeColor = new THREE.Color(0x4ade80);
    const emphasizedColor = new THREE.Color(0x86efac);
    const idleColor = new THREE.Color(0x10b981);

    this.lineMat.opacity = this.isActive ? 0.92 : 0.42;

    for (let i = 0; i < OVERLAY_BONE_LINKS.length; i++) {
      const [b1Name, b2Name] = OVERLAY_BONE_LINKS[i];
      const b1 = this.bones[b1Name];
      const b2 = this.bones[b2Name];
      if (!b1 || !b2) continue;

      b1.getWorldPosition(pA);
      b2.getWorldPosition(pB);

      pA.z += 0.04;
      pB.z += 0.04;

      this.rootGroup.worldToLocal(pA);
      this.rootGroup.worldToLocal(pB);

      const idx = i * 6;
      posAttr.array[idx] = pA.x;
      posAttr.array[idx + 1] = pA.y;
      posAttr.array[idx + 2] = pA.z;
      posAttr.array[idx + 3] = pB.x;
      posAttr.array[idx + 4] = pB.y;
      posAttr.array[idx + 5] = pB.z;

      const isHighlighted =
        this.isActive &&
        (this.affectedBones.has(b1Name) || this.affectedBones.has(b2Name));
      const c = isHighlighted
        ? emphasizedColor
        : this.isActive
        ? activeColor
        : idleColor;

      colAttr.array[idx] = c.r;
      colAttr.array[idx + 1] = c.g;
      colAttr.array[idx + 2] = c.b;
      colAttr.array[idx + 3] = c.r;
      colAttr.array[idx + 4] = c.g;
      colAttr.array[idx + 5] = c.b;
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    for (const jName of OVERLAY_JOINT_NAMES) {
      const bone = this.bones[jName];
      const mesh = this.jointMeshes[jName];
      if (!bone || !mesh) continue;

      bone.getWorldPosition(pA);
      pA.z += 0.045;
      this.rootGroup.worldToLocal(pA);
      mesh.position.copy(pA);

      const isJointHighlighted =
        this.isActive && this.affectedBones.has(jName);
      if (isJointHighlighted) {
        mesh.scale.setScalar(1.35 * pulse);
        mesh.material.color.setHex(0x86efac);
        mesh.material.opacity = 1.0;
      } else if (this.isActive) {
        mesh.scale.setScalar(0.95);
        mesh.material.color.setHex(0x22c55e);
        mesh.material.opacity = 0.85;
      } else {
        mesh.scale.setScalar(0.72);
        mesh.material.color.setHex(0x10b981);
        mesh.material.opacity = 0.42;
      }
    }
  }

  reset() {
    this.adapter.reset();
    this.liveLandmarks = null;
    this.isActive = false;
    this.affectedGroups = [];
    this.affectedBones.clear();
    this.retargeter.snapToNeutralStandingPose();
    this._updateSkeletalOverlay(0);
  }

  dispose() {
    if (this.lineGeo) this.lineGeo.dispose();
    if (this.lineMat) this.lineMat.dispose();
    Object.values(this.jointMeshes).forEach((m) => {
      m.geometry?.dispose();
      m.material?.dispose();
    });
  }
}
