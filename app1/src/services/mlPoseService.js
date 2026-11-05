/**
 * Isolated ML Pose Classification Service Client.
 * Connects to the Machine Learning Pose Inference Backend (Port 5006)
 * running the Yoga-82 Multi-Level LightGBM Classifiers.
 */

const ML_API_URL = import.meta.env.VITE_ML_API_URL || "http://127.0.0.1:5006";

export const mlPoseService = {
  getBaseUrl() {
    return ML_API_URL;
  },

  getCameraPreviewUrl() {
    return `${ML_API_URL}/api/camera-preview`;
  },

  async checkHealth() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${ML_API_URL}/api/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      return {
        status: "offline",
        error: err.message,
      };
    }
  },

  async getLatestPose() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${ML_API_URL}/api/pose`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      return {
        error: err.message,
        current: {
          status: "connection_error",
          level_6: { class: null, class_id: null, confidence: 0 },
          level_20: { class: null, class_id: null, confidence: 0 },
          level_82: { class: null, class_id: null, confidence: 0 },
          timestamp: Date.now() / 1000,
        },
        last_detected: {
          level_6: null,
          level_20: null,
          level_82: null,
          timestamp: null,
        },
      };
    }
  },

  async switchCamera(targetIndex) {
    try {
      const res = await fetch(`${ML_API_URL}/api/camera/switch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(targetIndex !== undefined ? { camera: targetIndex } : {}),
      });
      return await res.json();
    } catch (err) {
      return { error: err.message };
    }
  },

  async acquireCamera() {
    try {
      const res = await fetch(`${ML_API_URL}/api/camera/acquire`, {
        method: "POST",
      });
      return await res.json();
    } catch {
      return { status: "offline" };
    }
  },

  async releaseCamera() {
    try {
      const res = await fetch(`${ML_API_URL}/api/camera/release`, {
        method: "POST",
      });
      return await res.json();
    } catch {
      return { status: "offline" };
    }
  },

  async classifyLandmarks(landmarks) {
    try {
      const res = await fetch(`${ML_API_URL}/api/classify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ landmarks }),
      });
      return await res.json();
    } catch (err) {
      return { error: err.message };
    }
  },
};

export default mlPoseService;
