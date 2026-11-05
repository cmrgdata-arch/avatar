/**
 * Isolated DL Pose Estimation Service Client.
 * Connects to the Deep Learning Pose Inference Backend (Port 5005).
 */

const DL_API_URL = import.meta.env.VITE_DL_API_URL || "http://127.0.0.1:5005";

export const dlPoseService = {
  getBaseUrl() {
    return DL_API_URL;
  },

  getCameraPreviewUrl() {
    return `${DL_API_URL}/api/camera-preview`;
  },

  async checkHealth() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${DL_API_URL}/api/health`, {
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
      const res = await fetch(`${DL_API_URL}/api/pose`, {
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
          pose: null,
          confidence: 0,
          status: "connection_error",
          frames_collected: 0,
          frames_required: 60,
          timestamp: Date.now() / 1000,
        },
        last_detected: {
          pose: null,
          confidence: 0,
          timestamp: null,
        },
      };
    }
  },

  async switchCamera(targetIndex) {
    try {
      const res = await fetch(`${DL_API_URL}/api/camera/switch`, {
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
      const res = await fetch(`${DL_API_URL}/api/camera/acquire`, {
        method: "POST",
      });
      return await res.json();
    } catch {
      return { status: "offline" };
    }
  },

  async releaseCamera() {
    try {
      const res = await fetch(`${DL_API_URL}/api/camera/release`, {
        method: "POST",
      });
      return await res.json();
    } catch {
      return { status: "offline" };
    }
  },

  async classifyLandmarks(landmarks) {
    try {
      const res = await fetch(`${DL_API_URL}/api/classify`, {
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

export default dlPoseService;
