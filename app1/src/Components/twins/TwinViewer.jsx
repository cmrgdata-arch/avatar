/**
 * TwinViewer.jsx
 * Side-by-side Digital Twin + Corrective Twin 3D Stage Component matching the
 * attached final UI reference (`media_1794466081300_db9724e2.png`).
 *
 * Features:
 * - Loads gender-specific GLB once (`male.glb` or `female.glb`) based on user's stored gender
 *   and creates two completely independent cloned skeletons (`SkeletonUtils.clone`).
 * - Left Panel (Blue Holographic Theme): "DIGITAL TWIN" — "Replicates your movements"
 *   driven exclusively by live user landmarks (and metric worldLandmarks) when
 *   `isMirroringEnabled` (`isRecording && isFullBodyDetected && isTrackingStable`) is true.
 * - Right Panel (Green Holographic Theme): "CORRECTIVE TWIN" —
 *   "Corrective twin analyzes and corrects your posture."
 *   remains in a relaxed standing posture (`ALIGNED / IDLE`) when posture is aligned, idle, or loading,
 *   and activates smoothly (`ACTIVE CORRECTION`) with glowing green 3D skeletal highlights
 *   ONLY when `isFeedbackEnabled` is true and the existing correction engine reports an active mistake.
 */

import React, { useEffect, useRef, useState } from "react";
import { loadTwinPairForGender } from "./AvatarLoader.js";
import { DigitalTwinController } from "./DigitalTwin.js";
import { CorrectiveTwinController } from "./CorrectiveTwin.js";
import {
  TwinStageRenderer,
  TwinAnimationController,
} from "./TwinAnimationController.js";
import { resolveAvatarGender } from "./TwinConfig.js";
import "./TwinViewer.css";

export default function TwinViewer({
  gender,
  liveLandmarksRef,
  liveWorldLandmarksRef,
  liveLandmarks,
  liveWorldLandmarks,
  correctionState,
  poseName,
  isMirroringEnabled = true,
  isFeedbackEnabled = true,
  trackingStatusMessage = "",
  sessionState = null,
  onReady,
}) {
  const digitalMountRef = useRef(null);
  const correctiveMountRef = useRef(null);

  const digitalCtrlRef = useRef(null);
  const correctiveCtrlRef = useRef(null);
  const animCtrlRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [resolvedGender, setResolvedGender] = useState(() =>
    resolveAvatarGender(gender)
  );
  const [correctiveActive, setCorrectiveActive] = useState(false);

  // Latest-value refs so the 60fps syncInputs loop never restarts on React re-renders
  const liveLandmarksPropRef = useRef(liveLandmarks);
  const liveWorldLandmarksPropRef = useRef(liveWorldLandmarks);
  const correctionStateRef = useRef(correctionState);
  const poseNameRef = useRef(poseName);
  const isMirroringEnabledRef = useRef(isMirroringEnabled);
  const isFeedbackEnabledRef = useRef(isFeedbackEnabled);
  const loadingRef = useRef(loading);
  const correctiveActiveRef = useRef(correctiveActive);

  liveLandmarksPropRef.current = liveLandmarks;
  liveWorldLandmarksPropRef.current = liveWorldLandmarks;
  correctionStateRef.current = correctionState;
  poseNameRef.current = poseName;
  isMirroringEnabledRef.current = isMirroringEnabled;
  isFeedbackEnabledRef.current = isFeedbackEnabled;
  loadingRef.current = loading;
  correctiveActiveRef.current = correctiveActive;

  // Initialize Three.js stages and load gender-specific twin pair
  useEffect(() => {
    const digEl = digitalMountRef.current;
    const corEl = correctiveMountRef.current;
    if (!digEl || !corEl) return undefined;

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setCorrectiveActive(false);

    const animController = new TwinAnimationController();
    animCtrlRef.current = animController;

    const digitalStage = new TwinStageRenderer(digEl, { theme: "blue" });
    const correctiveStage = new TwinStageRenderer(corEl, { theme: "green" });

    animController.addStage(digitalStage);
    animController.addStage(correctiveStage);
    animController.start();

    const targetGender = resolveAvatarGender(gender);
    setResolvedGender(targetGender);

    loadTwinPairForGender(targetGender)
      .then(({ digitalInstance, correctiveInstance, gender: loadedGender }) => {
        if (cancelled) return;

        const digCtrl = new DigitalTwinController(digitalInstance);
        const corCtrl = new CorrectiveTwinController(correctiveInstance);

        digCtrl.setMirroringEnabled(Boolean(isMirroringEnabledRef.current));

        digitalCtrlRef.current = digCtrl;
        correctiveCtrlRef.current = corCtrl;

        digitalStage.setTwinController(digCtrl);
        correctiveStage.setTwinController(corCtrl);

        setLoading(false);
        if (typeof onReady === "function") {
          onReady({
            gender: loadedGender,
            digitalController: digCtrl,
            correctiveController: corCtrl,
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load 3D avatar pair:", err);
        setLoadError(err?.message || "Failed to load 3D avatar model");
        setLoading(false);
      });

    return () => {
      cancelled = true;
      animController.dispose();
      digitalCtrlRef.current = null;
      correctiveCtrlRef.current = null;
      animCtrlRef.current = null;
    };
  }, [gender]);

  // Continuous 60fps synchronization loop (stable across renders)
  useEffect(() => {
    let rafId = null;
    let active = true;

    const syncInputs = () => {
      if (!active) return;
      const mirroringOn = Boolean(isMirroringEnabledRef.current);
      const feedbackOn = Boolean(isFeedbackEnabledRef.current);

      const rawLms =
        liveLandmarksRef?.current ?? liveLandmarksPropRef.current ?? null;
      const rawWorldLms =
        liveWorldLandmarksRef?.current ??
        liveWorldLandmarksPropRef.current ??
        null;

      const effectiveLms = mirroringOn ? rawLms : null;
      const effectiveWorldLms = mirroringOn ? rawWorldLms : null;

      if (digitalCtrlRef.current) {
        digitalCtrlRef.current.setPoseName(poseNameRef.current || "");
        digitalCtrlRef.current.setMirroringEnabled(mirroringOn);
        digitalCtrlRef.current.setLiveLandmarks(
          effectiveLms,
          false,
          effectiveWorldLms
        );
      }

      if (correctiveCtrlRef.current) {
        correctiveCtrlRef.current.setInputs({
          liveLandmarks: effectiveLms,
          correctionState: correctionStateRef.current,
          poseName: poseNameRef.current,
          isFeedbackEnabled: feedbackOn && mirroringOn,
        });
        const isNowActive =
          !loadingRef.current &&
          feedbackOn &&
          mirroringOn &&
          Boolean(correctiveCtrlRef.current.isActive);
        if (isNowActive !== correctiveActiveRef.current) {
          correctiveActiveRef.current = isNowActive;
          setCorrectiveActive(isNowActive);
        }
      }

      rafId = window.requestAnimationFrame(syncInputs);
    };

    rafId = window.requestAnimationFrame(syncInputs);
    return () => {
      active = false;
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [liveLandmarksRef, liveWorldLandmarksRef]);

  const showActiveBadge = !loading && correctiveActive && isFeedbackEnabled;
  const isTrackingLost = sessionState === "RECORDING_TRACKING_LOST";

  return (
    <div
      className="twin-trainer-viewports"
      data-gender={resolvedGender}
      data-session-state={sessionState || "ACTIVE"}
    >
      {/* LEFT PANEL: DIGITAL TWIN (Blue Holographic Theme) */}
      <section
        className="twin-panel twin-panel--digital"
        aria-label="Digital Twin Viewport"
        data-testid="digital-twin-panel"
      >
        <header className="twin-panel__header">
          <div className="twin-panel__title-row">
            <h2 className="twin-panel__title twin-panel__title--blue">
              DIGITAL TWIN
            </h2>
            <span
              className="twin-panel__badge twin-panel__badge--blue"
              data-testid="digital-twin-status-badge"
            >
              {isMirroringEnabled ? "LIVE MIRROR" : "HOME / STANDBY"}
            </span>
          </div>
          <div className="twin-panel__divider twin-panel__divider--blue" />
          <p className="twin-panel__subtitle">Replicates your movements</p>
        </header>

        <div className="twin-panel__stage-wrap">
          <div
            ref={digitalMountRef}
            className="twin-panel__canvas-mount"
            data-testid="digital-twin-canvas"
          />
          {!loading && !loadError && trackingStatusMessage ? (
            <div
              className={`twin-panel__tracking-banner ${
                isTrackingLost ? "twin-panel__tracking-banner--warn" : ""
              }`}
              role="status"
              aria-live="polite"
              data-testid="twin-tracking-status-banner"
            >
              {trackingStatusMessage}
            </div>
          ) : null}
          {loading && (
            <div className="twin-panel__overlay-msg">
              Loading {resolvedGender} Digital Twin…
            </div>
          )}
          {loadError && (
            <div className="twin-panel__overlay-msg twin-panel__overlay-msg--error">
              {loadError}
            </div>
          )}
        </div>
      </section>

      {/* RIGHT PANEL: CORRECTIVE TWIN (Green Holographic Theme) */}
      <section
        className={`twin-panel twin-panel--corrective ${
          showActiveBadge ? "twin-panel--corrective-active" : ""
        }`}
        aria-label="Corrective Twin Viewport"
        data-testid="corrective-twin-panel"
      >
        <header className="twin-panel__header">
          <div className="twin-panel__title-row">
            <h2 className="twin-panel__title twin-panel__title--green">
              CORRECTIVE TWIN
            </h2>
            <span
              className={`twin-panel__badge ${
                showActiveBadge
                  ? "twin-panel__badge--green-active"
                  : "twin-panel__badge--green-idle"
              }`}
              data-testid="corrective-twin-status-badge"
            >
              {showActiveBadge ? "ACTIVE CORRECTION" : "ALIGNED / IDLE"}
            </span>
          </div>
          <div className="twin-panel__divider twin-panel__divider--green" />
          <p className="twin-panel__subtitle">
            Corrective twin analyzes and corrects your posture.
          </p>
        </header>

        <div className="twin-panel__stage-wrap">
          <div
            ref={correctiveMountRef}
            className="twin-panel__canvas-mount"
            data-testid="corrective-twin-canvas"
          />
          {loading && (
            <div className="twin-panel__overlay-msg">
              Loading {resolvedGender} Corrective Twin…
            </div>
          )}
          {loadError && (
            <div className="twin-panel__overlay-msg twin-panel__overlay-msg--error">
              {loadError}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
