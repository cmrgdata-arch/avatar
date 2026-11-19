/**
 * Ideal joint-angle targets (degrees) per practice pose for compare_pose-style feedback.
 * Order: [R_elbow, L_elbow, R_shoulder, L_shoulder, R_hip, L_hip, R_knee, L_knee]
 *
 * Includes exact keys for all 9 supported asanas in src/data/poses.js as well as
 * correction-engine Sanskrit-qualified pose names.
 */
export const PRACTICE_POSE_TARGETS = {
  // ── 9 Supported Project Asanas (Consultant-Approved Final Postures) ───────
  // 1. Tadasana (STA-01): Both feet grounded, body upright, arms stretched overhead beside ears,
  //    fingers interlocked, palms rotated upward toward the ceiling.
  "Mountain Pose": [175, 175, 175, 175, 175, 175, 175, 175],
  "Mountain Pose (Overhead)": [175, 175, 175, 175, 175, 175, 175, 175],
  "Mountain Pose (Arms at Sides)": [175, 175, 15, 15, 175, 175, 175, 175],
  "Urdhva Hastasana": [175, 175, 175, 175, 175, 175, 175, 175],

  // 2. Vrikshasana (STA-02): Raised foot on inner thigh, standing leg straight, Namaste hands
  "Tree Pose": [165, 170, 160, 175, 110, 175, 165, 175],

  // 3. Padahastasana (STA-03): Forward fold from hips, hands reaching toward feet/ankles
  "Hand-to-Foot Pose": [175, 175, 165, 165, 80, 80, 170, 170],

  // 4. Ardha Chakrasana (STA-04-I): Controlled standing backbend with hands supporting lower back
  "Half Wheel Pose": [160, 160, 60, 60, 165, 165, 175, 175],
  "Half Waist Wheel Pose": [175, 50, 165, 90, 175, 175, 175, 175],

  // 5. Trikonasana (STA-05-I): Wide-stance lateral bend, opposing vertical arms
  "Triangle Pose": [170, 170, 120, 120, 100, 170, 165, 165],
  "Revolved Triangle Pose": [100, 170, 120, 120, 170, 100, 165, 165],

  // 6. Ardha Ushtrasana (SIA-01 - PENDING consultant sitting table)
  "Half Camel Pose": [160, 160, 55, 55, 145, 145, 90, 90],

  // 7. Vakrasana (SIA-02 - PENDING consultant sitting table)
  "Twisted Pose": [160, 160, 130, 90, 90, 170, 130, 150],

  // 8. Pavanamukthasana (SU-01): Supine knees drawn to chest, hands clasped around shins
  "Wind-Relieving Pose": [130, 130, 45, 45, 75, 75, 65, 65],

  // 9. Savasana (SU-02): Supine relaxation, legs slightly apart, arms ~25-35 deg from sides, palms up
  "Corpse Pose": [175, 175, 25, 25, 175, 175, 175, 175],

  // Legacy / auxiliary poses
  "Crocodile Pose": [110, 110, 90, 90, 175, 175, 175, 175],
  "Cobra Pose": [165, 165, 55, 55, 140, 140, 165, 165],
  "Half Plough Pose": [175, 175, 135, 135, 90, 90, 175, 175],
  "Warrior I": [170, 170, 165, 165, 110, 165, 110, 170],
  "Warrior II": [160, 160, 95, 95, 105, 105, 165, 165],
  "Downward Dog": [175, 175, 180, 180, 165, 165, 165, 165],
  "Chair Pose": [160, 160, 150, 150, 95, 95, 95, 95],
  "Bridge Pose": [160, 160, 120, 120, 85, 85, 85, 85],
  "Child's Pose": [130, 130, 35, 35, 115, 115, 85, 85],

  // Sanskrit & Correction-Engine qualified names
  "Tadasana": [175, 175, 175, 175, 175, 175, 175, 175],
  "Tadasana (Mountain Pose)": [175, 175, 175, 175, 175, 175, 175, 175],
  "Vrksasana": [165, 170, 160, 175, 110, 175, 165, 175],
  "Vrikshasana": [165, 170, 160, 175, 110, 175, 165, 175],
  "Vrkasana (Tree Pose)": [165, 170, 160, 175, 110, 175, 165, 175],
  "Pada Hastasana": [175, 175, 165, 165, 80, 80, 170, 170],
  "Padahastasana": [175, 175, 165, 165, 80, 80, 170, 170],
  "Pada-hastasana (Hand-to-Foot Pose)": [175, 175, 165, 165, 80, 80, 170, 170],
  "Ardha Chakrasana": [160, 160, 60, 60, 165, 165, 175, 175],
  "Ardha Cakrasana (Half-Wheel Pose)": [160, 160, 60, 60, 165, 165, 175, 175],
  "Ardha Katichakrasana": [175, 50, 165, 90, 175, 175, 175, 175],
  "Ardha Katichakrasana (Half Waist-Wheel Pose)": [175, 50, 165, 90, 175, 175, 175, 175],
  "Trikonasana": [170, 170, 120, 120, 100, 170, 165, 165],
  "Trikonasana (Triangle Pose)": [170, 170, 120, 120, 100, 170, 165, 165],
  "Parivritta Trikonasana (Revolved Triangle Pose)": [100, 170, 120, 120, 170, 100, 165, 165],
  "Ardha Ushtrasana": [160, 160, 55, 55, 145, 145, 90, 90],
  "Ardha Ustrasana": [160, 160, 55, 55, 145, 145, 90, 90],
  "Ardha Ustrasana (Half Camel Pose)": [160, 160, 55, 55, 145, 145, 90, 90],
  "Vakrasana": [160, 160, 130, 90, 90, 170, 130, 150],
  "Vakrasana (Twisted Pose)": [160, 160, 130, 90, 90, 170, 130, 150],
  "Makarasana (Crocodile Pose)": [110, 110, 90, 90, 175, 175, 175, 175],
  "Bhujangasana (Cobra Pose)": [165, 165, 55, 55, 140, 140, 165, 165],
  "Ardha Halasana (Half Plough Pose)": [175, 175, 135, 135, 90, 90, 175, 175],
  "Pavanamukthasana": [130, 130, 45, 45, 75, 75, 65, 65],
  "Pavanamukthasana (Wind-Relieving Pose)": [130, 130, 45, 45, 75, 75, 65, 65],
  "Savasana": [175, 175, 25, 25, 175, 175, 175, 175],
  "Savasana (Corpse Pose)": [175, 175, 25, 25, 175, 175, 175, 175],
};

export function getTargetAnglesForPoseName(name) {
  if (!name) return null;
  return PRACTICE_POSE_TARGETS[name] ?? null;
}
