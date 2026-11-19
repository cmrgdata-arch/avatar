/**
 * AvatarLoader.js
 * Gender-aware GLB avatar loader with caching and independent SkeletonUtils cloning.
 *
 * Ensures that:
 * 1. The GLB asset for the requested gender ("male" or "female") is fetched and parsed only once.
 * 2. Digital Twin and Corrective Twin receive completely independent cloned hierarchies,
 *    skeletons, bone instances, and materials via SkeletonUtils.clone.
 * 3. Both models are normalized to TWIN_CONFIG.TARGET_AVATAR_HEIGHT (1.7m) with feet planted at y = 0.
 * 4. `rootGroup.visible` starts as `false` until the retargeter applies the initial neutral standing
 *    posture, preventing any single-frame raw T-pose flash during initialization.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { TWIN_CONFIG, resolveAvatarGender } from "./TwinConfig.js";

/** In-memory cache of parsed GLTF scenes keyed by URL */
const gltfCache = new Map();

/** Shared GLTFLoader singleton */
let sharedLoader = null;
function getLoader() {
  if (!sharedLoader) {
    sharedLoader = new GLTFLoader();
  }
  return sharedLoader;
}

/**
 * Loads and caches a GLTF asset from URL.
 * Deduplicates concurrent requests for the same URL.
 * @param {string} url
 * @returns {Promise<import('three/examples/jsm/loaders/GLTFLoader.js').GLTF>}
 */
export function loadGLTFOnce(url) {
  if (gltfCache.has(url)) {
    return gltfCache.get(url);
  }
  const promise = new Promise((resolve, reject) => {
    getLoader().load(
      url,
      (gltf) => resolve(gltf),
      undefined,
      (err) => {
        gltfCache.delete(url);
        reject(err);
      }
    );
  });
  gltfCache.set(url, promise);
  return promise;
}

/**
 * Resolves the GLB asset path for a given user gender ("male" | "female" | null).
 */
export function getAvatarUrlForGender(gender) {
  const resolved = resolveAvatarGender(gender);
  return TWIN_CONFIG.AVATARS[resolved] || TWIN_CONFIG.AVATARS.female;
}

/**
 * Creates a completely independent, skeleton-cloned avatar instance from a loaded GLTF.
 * Clones materials as well so tinting/highlighting one twin never affects the other.
 *
 * @param {object} gltf - Loaded GLTF object
 * @param {object} [options]
 * @param {string} [options.instanceId] - Identifier ("digital-twin" | "corrective-twin")
 * @returns {{ rootGroup: THREE.Group, modelRoot: THREE.Object3D, bones: Record<string, THREE.Bone>, restQuats: Record<string, THREE.Quaternion>, restPositions: Record<string, THREE.Vector3> }}
 */
export function createIndependentAvatarInstance(gltf, options = {}) {
  const { instanceId = "twin" } = options;

  // SkeletonUtils.clone deep-clones SkinnedMesh + Skeleton + Bone hierarchy independently
  const clonedScene = SkeletonUtils.clone(gltf.scene);
  clonedScene.name = `AvatarScene_${instanceId}`;

  const rootGroup = new THREE.Group();
  rootGroup.name = `AvatarRoot_${instanceId}`;
  // Hide until AvatarRetargeter applies the calibrated neutral standing A-pose (never show raw T-pose)
  rootGroup.visible = false;
  rootGroup.add(clonedScene);

  const bones = {};
  const restQuats = {};
  const restPositions = {};

  clonedScene.traverse((obj) => {
    if (obj.isMesh || obj.isSkinnedMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
      obj.frustumCulled = false;
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material = obj.material.map((m) => cloneAndEnhanceMaterial(m));
        } else {
          obj.material = cloneAndEnhanceMaterial(obj.material);
        }
      }
    }
    if (obj.isBone && !bones[obj.name]) {
      bones[obj.name] = obj;
      restQuats[obj.name] = obj.quaternion.clone();
      restPositions[obj.name] = obj.position.clone();
    }
  });

  // Normalize scale to TARGET_AVATAR_HEIGHT and plant soles at y = 0
  clonedScene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(clonedScene);
  const size = new THREE.Vector3();
  box.getSize(size);

  if (size.y > 0.001) {
    const scale = TWIN_CONFIG.TARGET_AVATAR_HEIGHT / size.y;
    clonedScene.scale.setScalar(scale);
    clonedScene.updateMatrixWorld(true);

    const scaledBox = new THREE.Box3().setFromObject(clonedScene);
    const center = new THREE.Vector3();
    scaledBox.getCenter(center);

    clonedScene.position.set(
      -center.x,
      -scaledBox.min.y,
      -center.z
    );
    clonedScene.updateMatrixWorld(true);
  }

  return {
    rootGroup,
    modelRoot: clonedScene,
    bones,
    restQuats,
    restPositions,
  };
}

function cloneAndEnhanceMaterial(mat) {
  const m = mat.clone();
  if ("roughness" in m) {
    m.roughness = Math.min(Math.max(m.roughness, 0.35), 0.78);
  }
  if ("metalness" in m) {
    m.metalness = Math.min(m.metalness, 0.15);
  }
  return m;
}

/**
 * Loads the gender-appropriate GLB once and returns two strictly independent
 * avatar instances: one for the Digital Twin and one for the Corrective Twin.
 *
 * @param {string} gender - User's profile gender ("male" | "female" | "other" | null)
 */
export async function loadTwinPairForGender(gender) {
  const resolvedGender = resolveAvatarGender(gender);
  const url = getAvatarUrlForGender(resolvedGender);
  const gltf = await loadGLTFOnce(url);

  const digitalInstance = createIndependentAvatarInstance(gltf, {
    instanceId: `digital-${resolvedGender}`,
  });
  const correctiveInstance = createIndependentAvatarInstance(gltf, {
    instanceId: `corrective-${resolvedGender}`,
  });

  return {
    gender: resolvedGender,
    url,
    digitalInstance,
    correctiveInstance,
  };
}
