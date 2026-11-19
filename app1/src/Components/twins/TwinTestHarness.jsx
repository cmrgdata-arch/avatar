/**
 * TwinTestHarness.jsx
 * Interactive & Automated Verification Harness for Tests A, B, C, D, E, and F.
 * Accessible at `/twin-test` so all poses, hand-joining IK, single/multi-joint
 * corrective demonstrations, gender switching, and FPS/memory telemetry can be
 * verified deterministically.
 */

import React, { useMemo, useRef, useState } from "react";
import TwinViewer from "./TwinViewer.jsx";
import { CORRECTION_STATUS } from "../../hooks/useCorrectionEngine.js";

function makeBaseLandmarks() {
  const lm = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0.99,
  }));
  // Head
  lm[0] = { x: 0.5, y: 0.18, z: -0.04, visibility: 0.99 };
  lm[7] = { x: 0.54, y: 0.18, z: 0, visibility: 0.99 }; // L ear
  lm[8] = { x: 0.46, y: 0.18, z: 0, visibility: 0.99 }; // R ear
  // Shoulders
  lm[11] = { x: 0.60, y: 0.30, z: 0, visibility: 0.99 }; // L shoulder
  lm[12] = { x: 0.40, y: 0.30, z: 0, visibility: 0.99 }; // R shoulder
  // Elbows
  lm[13] = { x: 0.64, y: 0.45, z: 0, visibility: 0.99 };
  lm[14] = { x: 0.36, y: 0.45, z: 0, visibility: 0.99 };
  // Wrists & Hands
  lm[15] = { x: 0.65, y: 0.58, z: -0.02, visibility: 0.99 };
  lm[16] = { x: 0.35, y: 0.58, z: -0.02, visibility: 0.99 };
  lm[17] = { x: 0.66, y: 0.62, z: -0.02, visibility: 0.99 };
  lm[18] = { x: 0.34, y: 0.62, z: -0.02, visibility: 0.99 };
  lm[19] = { x: 0.65, y: 0.62, z: -0.03, visibility: 0.99 };
  lm[20] = { x: 0.35, y: 0.62, z: -0.03, visibility: 0.99 };
  lm[21] = { x: 0.64, y: 0.60, z: -0.04, visibility: 0.99 };
  lm[22] = { x: 0.36, y: 0.60, z: -0.04, visibility: 0.99 };
  // Hips
  lm[23] = { x: 0.55, y: 0.54, z: 0, visibility: 0.99 };
  lm[24] = { x: 0.45, y: 0.54, z: 0, visibility: 0.99 };
  // Knees
  lm[25] = { x: 0.56, y: 0.72, z: 0, visibility: 0.99 };
  lm[26] = { x: 0.44, y: 0.72, z: 0, visibility: 0.99 };
  // Ankles & Feet
  lm[27] = { x: 0.56, y: 0.89, z: 0, visibility: 0.99 };
  lm[28] = { x: 0.44, y: 0.89, z: 0, visibility: 0.99 };
  lm[29] = { x: 0.56, y: 0.91, z: 0.03, visibility: 0.99 };
  lm[30] = { x: 0.44, y: 0.91, z: 0.03, visibility: 0.99 };
  lm[31] = { x: 0.57, y: 0.92, z: -0.06, visibility: 0.99 };
  lm[32] = { x: 0.43, y: 0.92, z: -0.06, visibility: 0.99 };
  return lm;
}

export const TEST_SCENARIOS = {
  tadasana_good: {
    label: "1. Tadasana (Correct Posture — Corrective Twin Idle)",
    poseName: "Tadasana",
    buildLandmarks: () => makeBaseLandmarks(),
    correctionState: {
      status: CORRECTION_STATUS.GOOD_FORM,
      corrections: [],
      feedback: "Looking good — hold the position! ✅",
    },
  },
  namaste_chest: {
    label: "2. Namaste / Anjali Mudra (Chest Prayer Pose — Hand IK)",
    poseName: "Tadasana",
    buildLandmarks: () => {
      const lm = makeBaseLandmarks();
      lm[13] = { x: 0.63, y: 0.43, z: -0.06, visibility: 0.99 };
      lm[14] = { x: 0.37, y: 0.43, z: -0.06, visibility: 0.99 };
      lm[15] = { x: 0.515, y: 0.37, z: -0.14, visibility: 0.99 };
      lm[16] = { x: 0.485, y: 0.37, z: -0.14, visibility: 0.99 };
      lm[19] = { x: 0.508, y: 0.32, z: -0.15, visibility: 0.99 };
      lm[20] = { x: 0.492, y: 0.32, z: -0.15, visibility: 0.99 };
      lm[17] = { x: 0.512, y: 0.33, z: -0.14, visibility: 0.99 };
      lm[18] = { x: 0.488, y: 0.33, z: -0.14, visibility: 0.99 };
      return lm;
    },
    correctionState: {
      status: CORRECTION_STATUS.GOOD_FORM,
      corrections: [],
      feedback: "Palms joined in Anjali Mudra — hold steady!",
    },
  },
  vrikshasana_tree: {
    label: "3. Vrikshasana (Tree Pose — Foot-on-Thigh + Overhead Namaste IK)",
    poseName: "Vrikshasana",
    buildLandmarks: () => {
      const lm = makeBaseLandmarks();
      // Overhead joined hands
      lm[13] = { x: 0.59, y: 0.17, z: -0.03, visibility: 0.99 };
      lm[14] = { x: 0.41, y: 0.17, z: -0.03, visibility: 0.99 };
      lm[15] = { x: 0.515, y: 0.07, z: -0.05, visibility: 0.99 };
      lm[16] = { x: 0.485, y: 0.07, z: -0.05, visibility: 0.99 };
      lm[19] = { x: 0.508, y: 0.03, z: -0.05, visibility: 0.99 };
      lm[20] = { x: 0.492, y: 0.03, z: -0.05, visibility: 0.99 };
      // Right leg lifted with foot against left inner thigh
      lm[26] = { x: 0.34, y: 0.64, z: -0.02, visibility: 0.99 };
      lm[28] = { x: 0.52, y: 0.65, z: -0.02, visibility: 0.99 };
      lm[30] = { x: 0.53, y: 0.64, z: 0.0, visibility: 0.99 };
      lm[32] = { x: 0.52, y: 0.68, z: -0.04, visibility: 0.99 };
      return lm;
    },
    correctionState: {
      status: CORRECTION_STATUS.GOOD_FORM,
      corrections: [],
      feedback: "Tree Pose balanced — palms joined overhead!",
    },
  },
  warrior2_single_error: {
    label: "4. Warrior II / Trikonasana (Single-Joint Error: Dropped Right Arm)",
    poseName: "Warrior II",
    buildLandmarks: () => {
      const lm = makeBaseLandmarks();
      // Wide stance
      lm[25] = { x: 0.68, y: 0.70, z: 0, visibility: 0.99 };
      lm[27] = { x: 0.70, y: 0.89, z: 0, visibility: 0.99 };
      lm[26] = { x: 0.33, y: 0.72, z: 0, visibility: 0.99 };
      lm[28] = { x: 0.26, y: 0.89, z: 0, visibility: 0.99 };
      // Left arm horizontal (correct), Right arm dropped down (mistake!)
      lm[13] = { x: 0.74, y: 0.30, z: 0, visibility: 0.99 };
      lm[15] = { x: 0.86, y: 0.30, z: 0, visibility: 0.99 };
      lm[14] = { x: 0.36, y: 0.46, z: 0, visibility: 0.99 }; // dropped right elbow
      lm[16] = { x: 0.34, y: 0.58, z: 0, visibility: 0.99 }; // dropped right wrist
      return lm;
    },
    correctionState: {
      status: CORRECTION_STATUS.ADJUST,
      corrections: ["Raise your right arm higher to shoulder level."],
      feedback: "Raise your right arm higher to shoulder level.",
      targetAngles: [175, 175, 95, 95, 110, 160, 170, 110],
    },
  },
  multi_joint_error: {
    label: "5. Multi-Joint Error (Bent Arms + Narrow Stance)",
    poseName: "Trikonasana",
    buildLandmarks: () => {
      const lm = makeBaseLandmarks();
      // Both arms bent and low
      lm[13] = { x: 0.65, y: 0.44, z: -0.05, visibility: 0.99 };
      lm[15] = { x: 0.60, y: 0.36, z: -0.10, visibility: 0.99 };
      lm[14] = { x: 0.35, y: 0.44, z: -0.05, visibility: 0.99 };
      lm[16] = { x: 0.40, y: 0.36, z: -0.10, visibility: 0.99 };
      return lm;
    },
    correctionState: {
      status: CORRECTION_STATUS.ADJUST,
      corrections: [
        "Straighten your left arm a bit more.",
        "Straighten your right arm a bit more.",
        "Widen the stance between your legs.",
      ],
      feedback: "Extend both arms sideways and widen your stance.",
      targetAngles: [175, 175, 95, 95, 115, 155, 170, 170],
    },
  },
  raise_right_hand: {
    label: "6. Mirror Test: User Raises Physical Right Hand",
    poseName: "Tadasana",
    buildLandmarks: () => {
      const lm = makeBaseLandmarks();
      lm[14] = { x: 0.37, y: 0.18, z: -0.03, visibility: 0.99 };
      lm[16] = { x: 0.36, y: 0.06, z: -0.04, visibility: 0.99 };
      lm[20] = { x: 0.36, y: 0.02, z: -0.04, visibility: 0.99 };
      return lm;
    },
    correctionState: {
      status: CORRECTION_STATUS.GOOD_FORM,
      corrections: [],
      feedback: "Right hand raised.",
    },
  },
};

export default function TwinTestHarness() {
  const [gender, setGender] = useState("female");
  const [scenarioKey, setScenarioKey] = useState("warrior2_single_error");
  const readyInfoRef = useRef(null);

  const scenario = TEST_SCENARIOS[scenarioKey] || TEST_SCENARIOS.tadasana_good;
  const landmarks = useMemo(() => scenario.buildLandmarks(), [scenario]);

  return (
    <div className="twin-trainer-workspace">
      <div className="twin-trainer-topbar">
        <div className="twin-trainer-topbar__left">
          <h1 className="twin-trainer-brand">
            Digital Twin & Corrective Twin Verification Suite
          </h1>
        </div>
        <div className="twin-trainer-topbar__right">
          <div className="btn-group btn-group-sm" role="group" aria-label="Gender toggle">
            <button
              type="button"
              data-testid="btn-gender-female"
              className={`btn ${gender === "female" ? "btn-info" : "btn-outline-info"}`}
              onClick={() => setGender("female")}
            >
              Female Avatar
            </button>
            <button
              type="button"
              data-testid="btn-gender-male"
              className={`btn ${gender === "male" ? "btn-info" : "btn-outline-info"}`}
              onClick={() => setGender("male")}
            >
              Male Avatar
            </button>
          </div>

          <select
            data-testid="scenario-select"
            className="form-select form-select-sm bg-dark text-white border-info w-auto"
            value={scenarioKey}
            onChange={(e) => setScenarioKey(e.target.value)}
          >
            {Object.entries(TEST_SCENARIOS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="twin-trainer-grid">
        <TwinViewer
          gender={gender}
          liveLandmarks={landmarks}
          correctionState={scenario.correctionState}
          poseName={scenario.poseName}
          onReady={(info) => {
            readyInfoRef.current = info;
            window.__TWIN_TEST_INFO__ = info;
          }}
        />

        <aside className="twin-trainer-sidebar">
          <div className="twin-telemetry-card">
            <h2 className="twin-telemetry-pose-name">{scenario.poseName}</h2>
            <div className="twin-telemetry-pose-sub">{scenario.label}</div>
            <div className="twin-telemetry-divider" />

            <div className="twin-score-label">ALIGNMENT SCORE</div>
            <div className="twin-score-value">
              {scenario.correctionState.status === CORRECTION_STATUS.GOOD_FORM
                ? "96%"
                : "74%"}
            </div>
            <div className="twin-score-bar-track">
              <div
                className="twin-score-bar-fill"
                style={{
                  width:
                    scenario.correctionState.status === CORRECTION_STATUS.GOOD_FORM
                      ? "96%"
                      : "74%",
                }}
              />
            </div>

            <div className="twin-corrections-heading">CORRECTIONS</div>
            <ul className="twin-corrections-list">
              {(scenario.correctionState.corrections?.length
                ? scenario.correctionState.corrections
                : [
                    "Front knee aligned with ankle.",
                    "Arms parallel to the floor.",
                    "Back foot angled properly.",
                    "Keep your spine straight.",
                  ]
              ).map((c, i) => (
                <li key={i} className="twin-corrections-item">
                  <span
                    className={`twin-corrections-icon ${
                      scenario.correctionState.corrections?.length
                        ? "twin-corrections-icon--warn"
                        : "twin-corrections-icon--ok"
                    }`}
                  >
                    {scenario.correctionState.corrections?.length ? "!" : "✓"}
                  </span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="twin-coach-card">
            <h3 className="twin-coach-title">AI COACH</h3>
            <div className="twin-telemetry-divider" />
            <div className="twin-coach-body">
              <div className="twin-coach-avatar" aria-hidden="true">
                <svg
                  width="30"
                  height="30"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#7dd3fc"
                  strokeWidth="1.8"
                >
                  <rect x="3" y="11" width="18" height="10" rx="4" />
                  <circle cx="12" cy="5" r="2" />
                  <path d="M12 7v4" />
                  <circle cx="8.5" cy="16" r="1.2" fill="#7dd3fc" />
                  <circle cx="15.5" cy="16" r="1.2" fill="#7dd3fc" />
                </svg>
              </div>
              <p className="twin-coach-text">{scenario.correctionState.feedback}</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
