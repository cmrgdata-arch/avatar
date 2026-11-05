import React, { useState } from "react";
import DlPoseEstimationView from "./DlPoseEstimationView";
import MlPoseEstimationView from "./MlPoseEstimationView";
import "./PoseEstimation.css";

const PoseEstimationPage = () => {
  // viewMode is "selection", "dl", or "ml"
  const [viewMode, setViewMode] = useState("selection");

  return (
    <div className="pose-est-container">
      {viewMode === "dl" ? (
        <DlPoseEstimationView onBack={() => setViewMode("selection")} />
      ) : viewMode === "ml" ? (
        <MlPoseEstimationView onBack={() => setViewMode("selection")} />
      ) : (
        <>
          <div className="pose-est-header">
            <span className="pose-est-badge">Pose Analysis Engine</span>
            <h1 className="pose-est-title">Yoga Pose Estimation</h1>
            <p className="pose-est-subtitle">
              Select an inference model paradigm to begin real-time posture analysis and asana classification.
            </p>
          </div>

          {/* Exactly two buttons: DL and ML */}
          <div className="pose-mode-selection">
            {/* 1. DL Button Card */}
            <div
              className="pose-mode-card pose-mode-card--dl"
              onClick={() => setViewMode("dl")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setViewMode("dl")}
            >
              <div className="pose-mode-icon">⚡</div>
              <h2 className="pose-mode-name">DL</h2>
              <p className="pose-mode-desc">
                Deep Learning temporal sequence classifier trained on 60-frame MediaPipe pose feature vectors for real-time 8-asana recognition.
              </p>
              <button
                type="button"
                className="pose-btn pose-btn--dl"
                onClick={(e) => {
                  e.stopPropagation();
                  setViewMode("dl");
                }}
              >
                Launch DL Inference →
              </button>
              <div className="pose-mode-meta">
                Model: <code>task3_video_only.keras</code> (Port 5005)
              </div>
            </div>

            {/* 2. ML Button Card */}
            <div
              className="pose-mode-card pose-mode-card--ml"
              onClick={() => setViewMode("ml")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setViewMode("ml")}
            >
              <div className="pose-mode-icon">⚙</div>
              <h2 className="pose-mode-name">ML</h2>
              <p className="pose-mode-desc">
                Multi-level LightGBM classifier evaluating 59 geometric features across 6 broad categories, 20 pose groups, and 82 individual asanas.
              </p>
              <button
                type="button"
                className="pose-btn pose-btn--ml"
                onClick={(e) => {
                  e.stopPropagation();
                  setViewMode("ml");
                }}
              >
                Launch ML Inference →
              </button>
              <div className="pose-mode-meta">
                Models: LightGBM (6 / 20 / 82 classes) (Port 5006)
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default PoseEstimationPage;
