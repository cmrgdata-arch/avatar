/**
 * Maps the app's 9 supported pose names and Sanskrit names (src/data/poses.js)
 * to the exact pose names served by the Yoga Pose Correction engine (`correction-engine/server.js`).
 */
export const APP_TO_CORRECTION_POSE = {
  // English names from src/data/poses.js
  "Mountain Pose": "Tadasana (Mountain Pose)",
  "Tree Pose": "Vrkasana (Tree Pose)",
  "Hand-to-Foot Pose": "Pada-hastasana (Hand-to-Foot Pose)",
  "Half Wheel Pose": "Ardha Cakrasana (Half-Wheel Pose)",
  "Triangle Pose": "Trikonasana (Triangle Pose)",
  "Half Camel Pose": "Ardha Ustrasana (Half Camel Pose)",
  "Twisted Pose": "Vakrasana (Twisted Pose)",
  "Wind-Relieving Pose": "Pavanamukthasana (Wind-Relieving Pose)",
  "Corpse Pose": "Savasana (Corpse Pose)",

  // Exact Sanskrit names for the 9 supported asanas
  "Tadasana": "Tadasana (Mountain Pose)",
  "Vrikshasana": "Vrkasana (Tree Pose)",
  "Vrksasana": "Vrkasana (Tree Pose)",
  "Padahastasana": "Pada-hastasana (Hand-to-Foot Pose)",
  "Pada Hastasana": "Pada-hastasana (Hand-to-Foot Pose)",
  "Ardha Chakrasana": "Ardha Cakrasana (Half-Wheel Pose)",
  "Trikonasana": "Trikonasana (Triangle Pose)",
  "Ardha Ushtrasana": "Ardha Ustrasana (Half Camel Pose)",
  "Ardha Ustrasana": "Ardha Ustrasana (Half Camel Pose)",
  "Vakrasana": "Vakrasana (Twisted Pose)",
  "Pavanamukthasana": "Pavanamukthasana (Wind-Relieving Pose)",
  "Savasana": "Savasana (Corpse Pose)",
};

/**
 * @param {string} appPoseName - a pose `name` or `sanskrit` from src/data/poses.js
 * @returns {string|null} the engine pose name, or null if unsupported
 */
export function getCorrectionPoseName(appPoseName) {
  return APP_TO_CORRECTION_POSE[appPoseName] ?? null;
}
