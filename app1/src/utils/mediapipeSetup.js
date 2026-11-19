/**
 * MediaPipe Pose via CDN globals (Pose, Camera utils).
 * Uses requestAnimationFrame to feed frames instead of Camera.start() so we do not
 * replace the existing getUserMedia stream on the video element during recording.
 *
 * Overlay alignment: landmarks are normalized (0–1) to the full video frame that
 * MediaPipe processes. The <video> uses object-fit: cover, which crops that frame
 * when the element's aspect ratio differs. Drawing must map normalized coords into
 * the same visible sub-rectangle as the video, then scale by devicePixelRatio.
 */

const LANDMARK_NAMES = [
  "nose",
  "left_eye_inner",
  "left_eye",
  "left_eye_outer",
  "right_eye_inner",
  "right_eye",
  "right_eye_outer",
  "left_ear",
  "right_ear",
  "mouth_left",
  "mouth_right",
  "left_shoulder",
  "right_shoulder",
  "left_elbow",
  "right_elbow",
  "left_wrist",
  "right_wrist",
  "left_pinky",
  "right_pinky",
  "left_index",
  "right_index",
  "left_thumb",
  "right_thumb",
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
  "left_ankle",
  "right_ankle",
  "left_heel",
  "right_heel",
  "left_foot_index",
  "right_foot_index",
];

/**
 * Visible rect of the video bitmap inside the element when object-fit is `cover`
 * (same math as CSS).
 */
function getObjectFitCoverLayout(
  intrinsicWidth,
  intrinsicHeight,
  containerWidth,
  containerHeight
) {
  const scale = Math.max(
    containerWidth / intrinsicWidth,
    containerHeight / intrinsicHeight
  );
  const displayedWidth = intrinsicWidth * scale;
  const displayedHeight = intrinsicHeight * scale;
  const offsetX = (containerWidth - displayedWidth) / 2;
  const offsetY = (containerHeight - displayedHeight) / 2;
  return { displayedWidth, displayedHeight, offsetX, offsetY };
}

function drawNormalizedLandmarksAsDots(
  ctx,
  landmarks,
  mapX,
  mapY,
  options
) {
  if (!landmarks?.length) return;
  const { color, radius = 4 } = options || {};
  ctx.fillStyle = color || "#FF0000";
  for (const lm of landmarks) {
    if (!lm || (lm.visibility != null && lm.visibility < 0.25)) continue;
    ctx.beginPath();
    ctx.arc(mapX(lm), mapY(lm), radius, 0, 2 * Math.PI);
    ctx.fill();
  }
}

function drawNormalizedConnections(
  ctx,
  landmarks,
  connections,
  mapX,
  mapY,
  options
) {
  if (!connections?.length || !landmarks?.length) return;
  const { color, lineWidth = 3 } = options || {};
  ctx.strokeStyle = color || "#00FF00";
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  for (const conn of connections) {
    const startIdx =
      conn?.start !== undefined ? conn.start : conn?.[0];
    const endIdx =
      conn?.end !== undefined ? conn.end : conn?.[1];
    const a = landmarks[startIdx];
    const b = landmarks[endIdx];
    if (!a || !b) continue;
    if ((a.visibility ?? 1) < 0.25 || (b.visibility ?? 1) < 0.25) continue;
    ctx.moveTo(mapX(a), mapY(a));
    ctx.lineTo(mapX(b), mapY(b));
  }
  ctx.stroke();
}

export function initMediaPipe(
  videoElement,
  canvasElement,
  onLandmarks,
  tZero,
  onRawResults
) {
  if (typeof window.Pose !== "function") {
    console.warn("MediaPipe Pose script not loaded");
    return function noop() {};
  }

  canvasElement.style.position = "absolute";
  canvasElement.style.top = "0";
  canvasElement.style.left = "0";
  canvasElement.style.width = "100%";
  canvasElement.style.height = "100%";
  canvasElement.style.pointerEvents = "none";
  canvasElement.style.zIndex = "2";

  const pose = new window.Pose({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
  });

  pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    smoothSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  const canvasCtx = canvasElement.getContext("2d");
  let frameCount = 0;
  let isRunning = true;
  let rafId = 0;
  let inFlight = false;
  let lastVideoTime = -1;
  let lastValidOverlayLandmarks = null;
  let lastValidOverlayTs = 0;

  pose.onResults((results) => {
    if (!isRunning) return;
    if (!videoElement.videoWidth) return;

    const rect = videoElement.getBoundingClientRect();
    const cssW = rect.width;
    const cssH = rect.height;
    if (cssW <= 0 || cssH <= 0) return;

    const vw = videoElement.videoWidth;
    const vh = videoElement.videoHeight;

    const { displayedWidth, displayedHeight, offsetX, offsetY } =
      getObjectFitCoverLayout(vw, vh, cssW, cssH);

    const dpr =
      typeof window !== "undefined"
        ? Math.min(window.devicePixelRatio || 1, 2)
        : 1;

    const bufW = Math.max(1, Math.round(cssW * dpr));
    const bufH = Math.max(1, Math.round(cssH * dpr));

    // Only resize backing store when dimensions actually change (prevents GPU flicker)
    if (canvasElement.width !== bufW || canvasElement.height !== bufH) {
      canvasElement.width = bufW;
      canvasElement.height = bufH;
      canvasElement.style.width = cssW + "px";
      canvasElement.style.height = cssH + "px";
    }

    canvasCtx.save();
    canvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvasCtx.clearRect(0, 0, cssW, cssH);

    const mapX = (lm) => offsetX + lm.x * displayedWidth;
    const mapY = (lm) => offsetY + lm.y * displayedHeight;
    const nowMs = performance.now();

    if (results.poseLandmarks && results.poseLandmarks.length >= 33) {
      lastValidOverlayLandmarks = results.poseLandmarks;
      lastValidOverlayTs = nowMs;

      if (typeof onRawResults === "function") {
        onRawResults(results.poseLandmarks, results.poseWorldLandmarks || null);
      }

      drawNormalizedConnections(
        canvasCtx,
        results.poseLandmarks,
        window.POSE_CONNECTIONS,
        mapX,
        mapY,
        {
          color: "#00FF00",
          lineWidth: 3,
        }
      );

      drawNormalizedLandmarksAsDots(
        canvasCtx,
        results.poseLandmarks,
        mapX,
        mapY,
        {
          color: "#FF0000",
          radius: 4,
        }
      );

      const namedLandmarks = results.poseLandmarks.map((lm, i) => ({
        name: LANDMARK_NAMES[i] ?? `joint_${i}`,
        x: parseFloat(lm.x.toFixed(6)),
        y: parseFloat(lm.y.toFixed(6)),
        z: parseFloat((lm.z ?? 0).toFixed(6)),
        visibility:
          lm.visibility != null
            ? parseFloat(lm.visibility.toFixed(4))
            : null,
      }));

      if (typeof onLandmarks === "function") {
        onLandmarks({
          frame: frameCount,
          relative_timestamp: Date.now() - tZero,
          landmarks: namedLandmarks,
        });
      }

      frameCount++;
    } else {
      // Short 160ms anti-blink overlay persistence for single missed frames,
      // while immediately notifying downstream when tracking drops beyond 160ms
      if (
        lastValidOverlayLandmarks &&
        nowMs - lastValidOverlayTs <= 160
      ) {
        drawNormalizedConnections(
          canvasCtx,
          lastValidOverlayLandmarks,
          window.POSE_CONNECTIONS,
          mapX,
          mapY,
          {
            color: "#00FF00",
            lineWidth: 3,
          }
        );
        drawNormalizedLandmarksAsDots(
          canvasCtx,
          lastValidOverlayLandmarks,
          mapX,
          mapY,
          {
            color: "#FF0000",
            radius: 4,
          }
        );
      } else {
        lastValidOverlayLandmarks = null;
        if (typeof onRawResults === "function") {
          onRawResults(null, null);
        }
        if (typeof onLandmarks === "function") {
          onLandmarks({
            frame: frameCount,
            relative_timestamp: Date.now() - tZero,
            landmarks: null,
          });
        }
      }
    }

    canvasCtx.restore();
  });

  const tick = async () => {
    if (!isRunning) return;
    if (
      !inFlight &&
      videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      videoElement.videoWidth > 0 &&
      videoElement.currentTime !== lastVideoTime
    ) {
      inFlight = true;
      lastVideoTime = videoElement.currentTime;
      try {
        await pose.send({ image: videoElement });
      } catch (_) {
        /* ignore single-frame failures */
      } finally {
        inFlight = false;
      }
    }
    if (isRunning) {
      rafId = requestAnimationFrame(tick);
    }
  };

  rafId = requestAnimationFrame(tick);

  return function cleanup() {
    isRunning = false;
    cancelAnimationFrame(rafId);
    try {
      pose.close();
    } catch (_) {
      /* noop */
    }
    try {
      canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    } catch (_) {
      /* noop */
    }
  };
}
