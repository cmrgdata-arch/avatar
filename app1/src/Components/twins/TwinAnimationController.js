/**
 * TwinAnimationController.js
 * Synchronized Three.js WebGL Stage & Animation Loop Controller.
 *
 * Manages:
 * - Single coordinated animation loop per stage (no competing `requestAnimationFrame` loops).
 * - Automatic full-body + overhead reach camera framing (`_applyFullBodyFraming`) with ~10% margin
 *   so head, overhead hands (Urdhva Hastasana / Namaste overhead), wide arms (Warrior II), torso,
 *   legs, and feet are 100% visible at any viewport aspect ratio without zoom hunting.
 * - Futuristic hologram floor rings and perspective grid matching the attached UI reference
 *   screenshot (`media_1794466081300_db9724e2.png`).
 * - Studio 3-point lighting with rim light and floor glow.
 * - Automatic WebGL context loss/restore handling and complete disposal on unmount.
 */

import * as THREE from "three";
import { TWIN_CONFIG } from "./TwinConfig.js";

/**
 * Creates the glowing concentric holographic floor rings + perspective grid
 * matching the reference UI screenshot (`media_1794466081300_db9724e2.png`).
 *
 * @param {"blue" | "green"} theme
 */
function createHolographicFloorStage(theme = "blue") {
  const isGreen = theme === "green";
  const primaryHex = isGreen ? 0x22c55e : 0x0ea5e9;
  const brightHex = isGreen ? 0x86efac : 0x7dd3fc;
  const gridMainHex = isGreen ? 0x064e3b : 0x0c4a6e;
  const gridSubHex = isGreen ? 0x042f2e : 0x082f49;

  const group = new THREE.Group();
  group.name = `HoloFloor_${theme}`;

  const grid = new THREE.GridHelper(4.8, 16, gridMainHex, gridSubHex);
  grid.position.y = -0.004;
  if (Array.isArray(grid.material)) {
    grid.material.forEach((m) => {
      m.transparent = true;
      m.opacity = 0.42;
    });
  } else if (grid.material) {
    grid.material.transparent = true;
    grid.material.opacity = 0.42;
  }
  group.add(grid);

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createRadialGradient(128, 128, 4, 128, 128, 128);
  if (isGreen) {
    grad.addColorStop(0.0, "rgba(74, 222, 128, 0.85)");
    grad.addColorStop(0.28, "rgba(16, 185, 129, 0.42)");
    grad.addColorStop(0.65, "rgba(5, 150, 105, 0.14)");
    grad.addColorStop(1.0, "rgba(0, 0, 0, 0.0)");
  } else {
    grad.addColorStop(0.0, "rgba(56, 189, 248, 0.85)");
    grad.addColorStop(0.28, "rgba(14, 165, 233, 0.42)");
    grad.addColorStop(0.65, "rgba(2, 132, 199, 0.14)");
    grad.addColorStop(1.0, "rgba(0, 0, 0, 0.0)");
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const glowTex = new THREE.CanvasTexture(canvas);
  const glowMat = new THREE.MeshBasicMaterial({
    map: glowTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const glowDisc = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 1.75), glowMat);
  glowDisc.rotation.x = -Math.PI / 2;
  glowDisc.position.y = 0.001;
  group.add(glowDisc);

  const ringSpecs = [
    { inner: 0.46, outer: 0.485, opacity: 0.85, color: brightHex },
    { inner: 0.56, outer: 0.595, opacity: 0.65, color: primaryHex },
    { inner: 0.68, outer: 0.70, opacity: 0.80, color: brightHex },
    { inner: 0.78, outer: 0.82, opacity: 0.40, color: primaryHex },
  ];

  const animatedRings = [];
  ringSpecs.forEach((spec, i) => {
    const rGeo = new THREE.RingGeometry(spec.inner, spec.outer, 64);
    const rMat = new THREE.MeshBasicMaterial({
      color: spec.color,
      transparent: true,
      opacity: spec.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const rMesh = new THREE.Mesh(rGeo, rMat);
    rMesh.rotation.x = -Math.PI / 2;
    rMesh.position.y = 0.002 + i * 0.0005;
    group.add(rMesh);
    animatedRings.push({ mesh: rMesh, baseOpacity: spec.opacity, phase: i * 0.9 });
  });

  const arcGeo = new THREE.RingGeometry(0.615, 0.64, 48, 1, 0, Math.PI * 1.35);
  const arcMat = new THREE.MeshBasicMaterial({
    color: brightHex,
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const arcMesh = new THREE.Mesh(arcGeo, arcMat);
  arcMesh.rotation.x = -Math.PI / 2;
  arcMesh.position.y = 0.004;
  group.add(arcMesh);

  return {
    group,
    update(nowMs, isEmphasized = false) {
      arcMesh.rotation.z = nowMs * 0.00045;
      const pulseBoost = isEmphasized ? 1.25 : 1.0;
      for (const r of animatedRings) {
        const wave = 0.85 + 0.15 * Math.sin(nowMs * 0.003 + r.phase);
        r.mesh.material.opacity = Math.min(1.0, r.baseOpacity * wave * pulseBoost);
      }
    },
    dispose() {
      glowTex.dispose();
      group.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
    },
  };
}

/**
 * Manages a Three.js stage canvas + camera + lights + floor + single animation loop for a twin.
 */
export class TwinStageRenderer {
  /**
   * @param {HTMLElement} container - DOM element to mount the WebGL canvas into
   * @param {object} [options]
   * @param {"blue" | "green"} [options.theme="blue"]
   * @param {object} [options.twinController] - `DigitalTwinController` or `CorrectiveTwinController`
   */
  constructor(container, options = {}) {
    this.container = container;
    this.theme = options.theme || "blue";
    this.twinController = options.twinController || null;
    this.disposed = false;
    this.contextLost = false;

    const width = Math.max(1, container.clientWidth || 360);
    const height = Math.max(1, container.clientHeight || 460);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      TWIN_CONFIG.RENDER.cameraFov,
      width / height,
      0.1,
      25
    );
    this._applyFullBodyFraming(width / height);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, TWIN_CONFIG.RENDER.maxPixelRatio)
    );
    this.renderer.setSize(width, height, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    const canvas = this.renderer.domElement;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    container.innerHTML = "";
    container.appendChild(canvas);

    this._setupLighting();
    this.floorStage = createHolographicFloorStage(this.theme);
    this.scene.add(this.floorStage.group);

    if (this.twinController?.rootGroup) {
      this.scene.add(this.twinController.rootGroup);
    }

    this._onContextLost = (e) => {
      e.preventDefault();
      this.contextLost = true;
    };
    this._onContextRestored = () => {
      this.contextLost = false;
    };
    canvas.addEventListener("webglcontextlost", this._onContextLost, false);
    canvas.addEventListener("webglcontextrestored", this._onContextRestored, false);

    this._resizeObserver = new ResizeObserver(() => this._handleResize());
    this._resizeObserver.observe(container);
  }

  /**
   * Computes static full-body + maximum arm reach camera framing with ~10% margin
   * so overhead hands (y up to 2.25m), wide arms (x in [-1.08m, 1.08m]), head, torso,
   * legs, and feet on the platform (y = 0) are always 100% inside the frustum without zoom hunting.
   */
  _applyFullBodyFraming(aspect = 0.8) {
    const cfg = TWIN_CONFIG.RENDER;
    const minY = cfg.fullBodyMinY ?? -0.12;
    const maxY = cfg.fullBodyMaxY ?? 2.25;
    const maxHalfW = cfg.fullBodyMaxHalfWidth ?? 1.08;
    const margin = 1 + (cfg.framingMarginRatio ?? 0.10);

    const vFovRad = THREE.MathUtils.degToRad(cfg.cameraFov || 34);
    const tanHalfVFov = Math.tan(vFovRad * 0.5);
    const tanHalfHFov = tanHalfVFov * Math.max(0.45, aspect);

    const reqHalfHeight = ((maxY - minY) * 0.5) * margin;
    const reqHalfWidth = maxHalfW * margin;

    const distForHeight = reqHalfHeight / tanHalfVFov;
    const distForWidth = reqHalfWidth / tanHalfHFov;
    const zDist = Math.max(cfg.cameraPosition[2], distForHeight, distForWidth);

    const centerY = (minY + maxY) * 0.5;
    this.camera.aspect = aspect;
    this.camera.position.set(0, centerY + 0.02, zDist);
    this.camera.lookAt(0, centerY - 0.02, 0);
    this.camera.updateProjectionMatrix();
  }

  _setupLighting() {
    const isGreen = this.theme === "green";

    const hemi = new THREE.HemisphereLight(
      0xe2e8f0,
      isGreen ? 0x064e3b : 0x0c4a6e,
      1.25
    );
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.55);
    keyLight.position.set(1.8, 3.2, 2.8);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(
      isGreen ? 0xa7f3d0 : 0xbae6fd,
      0.75
    );
    fillLight.position.set(-2.0, 1.8, 1.6);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(
      isGreen ? 0x34d399 : 0x38bdf8,
      0.95
    );
    rimLight.position.set(0, 2.4, -2.5);
    this.scene.add(rimLight);

    const floorLight = new THREE.PointLight(
      isGreen ? 0x10b981 : 0x0ea5e9,
      0.85,
      2.2
    );
    floorLight.position.set(0, 0.08, 0.35);
    this.scene.add(floorLight);
  }

  setTwinController(controller) {
    if (this.twinController?.rootGroup) {
      this.scene.remove(this.twinController.rootGroup);
    }
    this.twinController = controller;
    if (controller?.rootGroup) {
      this.scene.add(controller.rootGroup);
    }
  }

  _handleResize() {
    if (this.disposed || !this.container) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this._applyFullBodyFraming(w / h);
    this.renderer.setSize(w, h, false);
  }

  renderFrame(nowMs) {
    if (this.disposed || this.contextLost) return;

    if (this.twinController) {
      this.twinController.update(nowMs);
    }

    const isEmphasized = Boolean(this.twinController?.isActive);
    this.floorStage.update(nowMs, isEmphasized);

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }

    const canvas = this.renderer?.domElement;
    if (canvas) {
      canvas.removeEventListener("webglcontextlost", this._onContextLost);
      canvas.removeEventListener("webglcontextrestored", this._onContextRestored);
    }

    if (this.twinController?.dispose) {
      this.twinController.dispose();
    }

    if (this.floorStage) {
      this.floorStage.dispose();
    }

    if (this.renderer) {
      this.renderer.dispose();
      if (canvas && canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
    }
  }
}

/**
 * Coordinates both TwinStageRenderers in a single synchronized `requestAnimationFrame` loop.
 */
export class TwinAnimationController {
  constructor() {
    this.stages = new Set();
    this.rafId = null;
    this.running = false;
    this._tick = this._tick.bind(this);
  }

  addStage(stage) {
    this.stages.add(stage);
  }

  removeStage(stage) {
    this.stages.delete(stage);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.rafId = window.requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  _tick(nowMs) {
    if (!this.running) return;
    for (const stage of this.stages) {
      stage.renderFrame(nowMs);
    }
    this.rafId = window.requestAnimationFrame(this._tick);
  }

  dispose() {
    this.stop();
    for (const stage of this.stages) {
      stage.dispose();
    }
    this.stages.clear();
  }
}
