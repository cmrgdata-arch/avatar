/**
 * asanaReferenceTable.js
 * Authoritative Consultant-Approved Reference Specification for the Nine Supported Asanas
 * in the CMRG Yoga Assistant (YogaTwin) Project.
 *
 * Strictly defines the 9 supported project asanas across three categories:
 * - Standing (5): Tadasana, Vrikshasana, Padahastasana, Ardha Chakrasana, Trikonasana
 * - Sitting  (2): Ardha Ushtrasana, Vakrasana (marked PENDING – consultant-approved sitting-asana tables awaited)
 * - Supine   (2): Pavanamukthasana, Savasana
 *
 * Note on Hand & Finger Tracking:
 * MediaPipe Pose provides 33 body landmarks (including L/R_WRIST [15,16], L/R_PINKY [17,18],
 * L/R_INDEX [19,20], and L/R_THUMB [21,22]), not 21-point MediaPipe Hands per-phalange tracking.
 * Both `male.glb` and `female.glb` contain 30 individual finger bones (`Thumb1..3`, `Index1..3`,
 * `Middle1..3`, `Ring1..3`, `Pinky1..3` per hand), which are articulated using wrist/palm
 * orientation landmarks combined with each asana's validated `handConfigMode`.
 */

export const HAND_CONFIG_MODE = {
  TADASANA_INTERLOCKED_UP: "tadasana_interlocked_up",
  NAMASTE_CHEST: "namaste_chest",
  NAMASTE_OVERHEAD: "namaste_overhead",
  PADAHASTASANA_FLOOR_REACH: "padahastasana_floor_reach",
  ARDHA_CHAKRASANA_WAIST_SUPPORT: "ardha_chakrasana_waist_support",
  TRIKONASANA_OPPOSING_ARMS: "trikonasana_opposing_arms",
  PAVANAMUKTHASANA_SHIN_CLASP: "pavanamukthasana_shin_clasp",
  SAVASANA_SUPINE_PALMS_UP: "savasana_supine_palms_up",
  PENDING_SITTING: "pending_sitting",
  OPEN_NATURAL: "open_natural",
};

export const ASANA_REFERENCE_STATUS = {
  APPROVED: "APPROVED_CONSULTANT_TABLE",
  PENDING: "PENDING – consultant-approved sitting-asana tables awaited",
};

/**
 * Complete Consultant-Approved Reference Table for the 9 Supported Asanas.
 * Target 8-angle order: [R_elbow, L_elbow, R_shoulder, L_shoulder, R_hip, L_hip, R_knee, L_knee]
 */
export const ASANA_REFERENCE_TABLE = {
  "STA-01": {
    id: "STA-01",
    sanskritName: "Tadasana",
    englishName: "Mountain Pose",
    displayName: "Tadasana (Mountain Pose)",
    correctionEngineName: "Tadasana (Mountain Pose)",
    category: "Standing",
    source: "Consultant-Approved Standing Asana Reference Table (STA-01)",
    status: ASANA_REFERENCE_STATUS.APPROVED,
    handConfigMode: HAND_CONFIG_MODE.TADASANA_INTERLOCKED_UP,
    startingPosture:
      "Stand erect with feet 2 inches apart (or shoulder-width for stability), arms resting beside the body, weight evenly distributed on both feet.",
    stepByStepMethod: [
      "Stand erect with feet grounded evenly and spine upright.",
      "Interlock the fingers of both hands in front of the body and turn the palms outward.",
      "Inhale and raise both arms straight up above the head with fingers interlocked and palms facing upward toward the ceiling.",
      "Extend the elbows fully so the arms are aligned beside the ears, stretching the entire body vertically without arching the lower back.",
      "Gaze straight ahead, breathe normally, and hold the posture steadily.",
    ],
    finalPosture:
      "Both feet grounded, legs straight and symmetric, torso vertical, both arms stretched straight overhead beside the ears with fingers interlocked and palms rotated upward toward the ceiling (+Y normal). No prayer/Namaste hand position.",
    holdingTime: {
      under40: "20–30 seconds per round (up to 3 rounds)",
      over40: "10–20 seconds per round with normal breathing and heels grounded",
      defaultSeconds: 30,
    },
    recoveryTime: {
      under40: "10–15 seconds in relaxed standing posture",
      over40: "15–20 seconds in relaxed standing posture",
      defaultSeconds: 15,
    },
    correctnessCriteria: [
      "Both feet remain flat and grounded at equal height (never lifting one foot).",
      "Knees and hips extended symmetrically (~175°–180°) with neutral pelvis.",
      "Spine elongated vertically with shoulders level.",
      "Both arms raised straight overhead (~170°–180° shoulder flexion, ~170°–180° elbow extension).",
      "Fingers of left and right hands interlocked above the crown of the head with palms turned upward toward the ceiling.",
    ],
    keyJointAnglesAndAlignment: {
      targetEightAngles: [175, 175, 175, 175, 175, 175, 175, 175],
      armsAtSidesTargetEightAngles: [175, 175, 15, 15, 175, 175, 175, 175],
      headAndNeck: "Head upright, chin parallel to floor, gaze forward, neck aligned with spine.",
      shoulderDeg: 175,
      elbowDeg: 175,
      wristAndPalmOrientation:
        "Wrists centered above the crown of the head; palms rotated upward toward the ceiling (+Y world normal), NOT facing each other in Namaste.",
      fingerConfiguration:
        "Proximal, intermediate, and distal phalanges curled into an interlocked finger clasp across the midline.",
      torsoAndSpine: "Vertical, axially elongated, no lumbar hyperextension or lateral lean.",
      hipDeg: 175,
      kneeDeg: 175,
      ankleAndFootPlacement: "Both feet flat on the floor, parallel, weight balanced between heels and toes.",
      permittedVariationDeg: { under40: 15, over40: 22 },
    },
    commonErrors: [
      "Joining palms in front of the chest or overhead in Namaste (Prayer Pose) instead of interlocking fingers with palms facing upward.",
      "Bending the elbows or letting the arms drift forward away from the ears.",
      "Tilting the torso to one side or overarching the lower back.",
      "Shifting body weight onto one leg or lifting a foot off the mat.",
    ],
    correctionCues: {
      general: [
        "Stand tall with weight balanced evenly on both feet.",
        "Raise both arms overhead, interlock your fingers, and turn your palms upward toward the ceiling.",
        "Keep both elbows straight and align your upper arms near your ears.",
        "Keep your shoulders level and elongate your spine vertically.",
      ],
      under40: [
        "Stretch upward actively from the waist through the upturned palms while keeping your ribs drawn in.",
      ],
      over40: [
        "Keep both heels firmly on the floor and stretch your arms upward within a comfortable shoulder range.",
      ],
    },
    contraindications: [
      "Severe acute shoulder impingement or frozen shoulder (avoid full overhead elevation).",
      "Severe vertigo or uncontrolled orthostatic hypotension.",
    ],
    precautions: {
      general: [
        "Do not hold the breath while stretching the arms overhead.",
        "Keep the neck relaxed between the upper arms.",
      ],
      under40: ["Avoid lumbar overarching when pressing the palms toward the ceiling."],
      over40: [
        "Keep both heels grounded on the mat for balance; stand near a wall if experiencing mild dizziness.",
      ],
    },
    beforeAsanaMessages: [
      "Stand straight with your feet grounded and weight balanced evenly.",
      "Interlock your fingers, turn your palms upward toward the ceiling, and stretch both arms straight overhead.",
    ],
    afterAsanaMessages: [
      "Exhale, release the interlocked fingers, and gently lower your arms back to your sides.",
    ],
  },

  "STA-02": {
    id: "STA-02",
    sanskritName: "Vrikshasana",
    englishName: "Tree Pose",
    displayName: "Vrikshasana (Tree Pose)",
    correctionEngineName: "Vrkasana (Tree Pose)",
    category: "Standing",
    source: "Consultant-Approved Standing Asana Reference Table (STA-02)",
    status: ASANA_REFERENCE_STATUS.APPROVED,
    handConfigMode: HAND_CONFIG_MODE.NAMASTE_OVERHEAD,
    startingPosture:
      "Stand tall in Samasthiti with feet together, arms at the sides, and gaze fixed on a steady point straight ahead.",
    stepByStepMethod: [
      "Shift your weight firmly onto one standing leg and keep the standing knee straight.",
      "Bend the opposite knee and place the sole of the raised foot flat against the inner thigh of the standing leg (heel near the perineum, toes pointing downward).",
      "Open the bent knee laterally to the side while keeping the pelvis and shoulders facing straight forward.",
      "Inhale, raise both arms overhead (or at the sternum for stability), and join the palms together in Namaste (Anjali Mudra).",
      "Maintain steady breathing and balance on the standing leg.",
    ],
    finalPosture:
      "Single-leg standing balance with the raised foot pressed firmly against the inner thigh of the standing leg, bent knee turned outward in the coronal plane, spine upright, and palms joined in Namaste.",
    holdingTime: {
      under40: "20–30 seconds on each leg",
      over40: "10–15 seconds on each leg (may place foot on inner calf below knee if needed)",
      defaultSeconds: 25,
    },
    recoveryTime: {
      under40: "10–15 seconds between sides",
      over40: "15–20 seconds between sides",
      defaultSeconds: 15,
    },
    correctnessCriteria: [
      "Standing leg remains straight and vertical (~170°–180° knee extension).",
      "Raised foot sole rests against the inner thigh (or inner calf for 40+ safety modification), NEVER pressing directly on the knee joint.",
      "Bent knee opens laterally with hips level and facing forward.",
      "Torso remains upright without leaning toward the standing leg.",
      "Palms are joined cleanly in Namaste (inward-facing palm normals -X / +X, fingers pointing upward +Y).",
    ],
    keyJointAnglesAndAlignment: {
      targetEightAngles: [165, 170, 160, 175, 110, 175, 165, 175],
      headAndNeck: "Head level, eyes focused on a fixed point (Drishti) straight ahead.",
      shoulderDeg: 165,
      elbowDeg: 165,
      wristAndPalmOrientation:
        "Palms pressed flat together facing each other (LeftPalm = -X, RightPalm = +X), fingers pointing straight upward (+Y).",
      fingerConfiguration: "Fingers extended and adducted together in Anjali Mudra.",
      torsoAndSpine: "Vertical, centered directly above the standing foot.",
      hipDeg: 110,
      kneeDeg: 75,
      ankleAndFootPlacement:
        "Standing foot grounded flat; raised foot sole placed on the inner thigh above the knee (never on the knee joint).",
      permittedVariationDeg: { under40: 15, over40: 25 },
    },
    commonErrors: [
      "Placing the raised foot directly against the side of the standing knee joint.",
      "Allowing the standing hip to jut out laterally or leaning the torso to one side.",
      "Bending the standing leg knee.",
      "Separating the palms or twisting the torso.",
    ],
    correctionCues: {
      general: [
        "Keep your standing leg firm and straight.",
        "Place your raised foot on your inner thigh above the knee — never press directly on the knee joint.",
        "Open your bent knee gently to the side while keeping your hips level.",
        "Join your palms cleanly in Namaste and keep your spine upright.",
      ],
      under40: [
        "Draw the raised heel higher on the inner thigh and lengthen your arms overhead in Namaste.",
      ],
      over40: [
        "Focus on steady balance; you may keep your hands in Namaste at chest level or place your foot lower on the inner calf if needed.",
      ],
    },
    contraindications: [
      "Acute ankle or knee injury on the standing leg.",
      "Severe vertigo, inner-ear balance disorder, or uncontrolled hypertension (avoid overhead arm elevation).",
    ],
    precautions: {
      general: [
        "Never place the raised foot directly on the knee joint.",
        "Keep your gaze fixed on a stationary point ahead to maintain balance.",
      ],
      under40: ["Engage the core and standing glute to prevent hip drop."],
      over40: [
        "Practice near a wall for light support if needed, and keep hands at heart center if raising arms overhead challenges balance.",
      ],
    },
    beforeAsanaMessages: [
      "Fix your gaze on a steady point in front of you.",
      "Place one foot on the opposite inner thigh (avoiding the knee) and bring your palms together in Namaste.",
    ],
    afterAsanaMessages: [
      "Exhale, lower your arms and raised leg smoothly back to the floor, and repeat on the other side.",
    ],
  },

  "STA-03": {
    id: "STA-03",
    sanskritName: "Padahastasana",
    englishName: "Hand-to-Foot Pose",
    displayName: "Padahastasana (Hand-to-Foot Pose)",
    correctionEngineName: "Pada-hastasana (Hand-to-Foot Pose)",
    category: "Standing",
    source: "Consultant-Approved Standing Asana Reference Table (STA-03)",
    status: ASANA_REFERENCE_STATUS.APPROVED,
    handConfigMode: HAND_CONFIG_MODE.PADAHASTASANA_FLOOR_REACH,
    startingPosture:
      "Stand erect with feet 2 inches apart, legs straight, and arms beside the body.",
    stepByStepMethod: [
      "Inhale and raise both arms straight up overhead without interlocking the fingers.",
      "Exhale and hinge forward slowly from the hip joints (not the waist), keeping the spine long as the torso descends.",
      "Reach both hands downward toward the feet, ankles, or floor beside the feet.",
      "Relax the head and neck downward toward the knees while keeping weight balanced across both feet.",
      "Hold the forward fold with calm, steady breathing.",
    ],
    finalPosture:
      "Standing forward fold hinging at the hips, torso and head relaxed downward toward the legs, hands reaching the feet/ankles or floor beside the feet, legs vertical.",
    holdingTime: {
      under40: "20–30 seconds with normal breathing",
      over40: "10–20 seconds with gentle knee micro-bend if hamstrings are tight",
      defaultSeconds: 25,
    },
    recoveryTime: {
      under40: "15 seconds standing upright",
      over40: "20–25 seconds standing upright (rise slowly to avoid dizziness)",
      defaultSeconds: 20,
    },
    correctnessCriteria: [
      "Forward fold initiates from the hip joints rather than rounding only the upper back.",
      "Both arms extend downward toward the feet/ankles.",
      "Head and neck hang relaxed in line with the upper spine.",
      "Both feet remain grounded with hips stacked above the ankles.",
    ],
    keyJointAnglesAndAlignment: {
      targetEightAngles: [175, 175, 165, 165, 80, 80, 170, 170],
      headAndNeck: "Crown of the head directed toward the floor, neck relaxed without tension.",
      shoulderDeg: 165,
      elbowDeg: 170,
      wristAndPalmOrientation: "Hands reaching down beside the feet or grasping the ankles.",
      fingerConfiguration: "Fingers extended downward toward the floor/toes.",
      torsoAndSpine: "Lengthened downward from the pelvis in sagittal flexion.",
      hipDeg: 80,
      kneeDeg: 170,
      ankleAndFootPlacement: "Both feet parallel and grounded, hips aligned over ankles.",
      permittedVariationDeg: { under40: 15, over40: 25 },
    },
    commonErrors: [
      "Forcing the upper back to round sharply while keeping the pelvis stiff.",
      "Hyperextending or locking the knees aggressively.",
      "Straining the neck by looking up during the forward fold.",
    ],
    correctionCues: {
      general: [
        "Hinge forward from your hips and lengthen your spine downward.",
        "Reach both hands down toward your feet or ankles.",
        "Relax your neck and let the crown of your head hang gently.",
      ],
      under40: ["Keep your legs straight and shift weight slightly toward the balls of your feet."],
      over40: [
        "Keep a gentle micro-bend in your knees to protect your lower back and hamstrings.",
      ],
    },
    contraindications: [
      "Acute lumbar disc herniation, severe sciatica, or acute lower back pain.",
      "Uncontrolled hypertension, glaucoma, or severe vertigo.",
    ],
    precautions: {
      general: [
        "Never bounce or force the trunk downward.",
        "Inhale and rise up slowly to avoid lightheadedness.",
      ],
      under40: ["Lengthen the front torso before deepening the fold."],
      over40: [
        "Rest hands on shins if needed and come up slowly with knees slightly bent.",
      ],
    },
    beforeAsanaMessages: [
      "Inhale to lengthen your spine, then exhale and fold forward from the hips.",
      "Reach your hands toward your ankles or the floor without straining your lower back.",
    ],
    afterAsanaMessages: [
      "Inhale and roll up slowly vertebra by vertebra, bringing your head up last.",
    ],
  },

  "STA-04-I": {
    id: "STA-04-I",
    sanskritName: "Ardha Chakrasana",
    englishName: "Half Wheel Pose",
    displayName: "Ardha Chakrasana (Half Wheel Pose)",
    correctionEngineName: "Ardha Cakrasana (Half-Wheel Pose)",
    category: "Standing",
    source: "Consultant-Approved Standing Asana Reference Table (STA-04-I)",
    status: ASANA_REFERENCE_STATUS.APPROVED,
    handConfigMode: HAND_CONFIG_MODE.ARDHA_CHAKRASANA_WAIST_SUPPORT,
    startingPosture:
      "Stand upright with feet hip-width apart for stability and arms resting beside the body.",
    stepByStepMethod: [
      "Support the lower back (lumbar/iliac crest region) firmly with the palms of both hands, fingers pointing downward or inward.",
      "Draw both elbows inward toward each other behind the back to open the chest.",
      "Inhale, lift the sternum upward, and gently bend backward from the upper and middle back.",
      "Keep the knees straight and feet firmly grounded while breathing normally.",
    ],
    finalPosture:
      "Controlled standing backward bend with hands supporting the lower waist/pelvis, elbows drawn back, chest lifted, and legs firm.",
    holdingTime: {
      under40: "15–30 seconds with normal breathing",
      over40: "10–15 seconds with mild, supported thoracic extension",
      defaultSeconds: 20,
    },
    recoveryTime: {
      under40: "15 seconds in neutral standing",
      over40: "20 seconds in neutral standing",
      defaultSeconds: 15,
    },
    correctnessCriteria: [
      "Both hands support the lower back/hips symmetrically.",
      "Chest lifts upward and arches gently backward without collapsing into the lower lumbar spine.",
      "Both feet remain flat and hip-width apart with knees straight (~170°–180°).",
      "Shoulders remain level without twisting.",
    ],
    keyJointAnglesAndAlignment: {
      targetEightAngles: [160, 160, 60, 60, 165, 165, 175, 175],
      headAndNeck: "Neck extends smoothly in line with the thoracic curve without dropping the head sharply.",
      shoulderDeg: 60,
      elbowDeg: 115,
      wristAndPalmOrientation: "Palms placed firmly against the posterior pelvis / lower back.",
      fingerConfiguration: "Fingers supporting the lumbar/hip region.",
      torsoAndSpine: "Controlled sagittal extension lifting through the sternum.",
      hipDeg: 165,
      kneeDeg: 175,
      ankleAndFootPlacement: "Feet hip-width apart and grounded.",
      permittedVariationDeg: { under40: 15, over40: 22 },
    },
    commonErrors: [
      "Dropping the head back abruptly and compressing the cervical spine.",
      "Bending the knees excessively instead of lifting the chest.",
      "Holding the breath during the backward bend.",
    ],
    correctionCues: {
      general: [
        "Support your lower back firmly with both hands and draw your elbows inward.",
        "Lift your chest upward before arching gently backward.",
        "Keep both feet grounded and legs firm.",
      ],
      under40: ["Open across the collarbones and lengthen the upper spine into the backbend."],
      over40: [
        "Keep the backward arch gentle and keep your chin slightly tucked if you have neck sensitivity.",
      ],
    },
    contraindications: [
      "Severe cervical spondylosis, acute lumbar spine injury, or severe vertigo.",
      "Uncontrolled high blood pressure or recent abdominal surgery.",
    ],
    precautions: {
      general: [
        "Always support the lower back with your hands.",
        "Keep breathing smoothly; never hold your breath in a backbend.",
      ],
      under40: ["Distribute the arch evenly through the thoracic spine."],
      over40: ["Keep your gaze forward-upward rather than dropping the head all the way back."],
    },
    beforeAsanaMessages: [
      "Place your palms firmly on your lower back for support.",
      "Inhale, lift your chest, and arch backward gently within a comfortable range.",
    ],
    afterAsanaMessages: [
      "Inhale to return slowly to an upright standing position, then release your hands.",
    ],
  },

  "STA-05-I": {
    id: "STA-05-I",
    sanskritName: "Trikonasana",
    englishName: "Triangle Pose",
    displayName: "Trikonasana (Triangle Pose)",
    correctionEngineName: "Trikonasana (Triangle Pose)",
    category: "Standing",
    source: "Consultant-Approved Standing Asana Reference Table (STA-05-I)",
    status: ASANA_REFERENCE_STATUS.APPROVED,
    handConfigMode: HAND_CONFIG_MODE.TRIKONASANA_OPPOSING_ARMS,
    startingPosture:
      "Stand upright with feet wide apart (~3 to 3.5 feet), legs straight, and spine erect.",
    stepByStepMethod: [
      "Turn one foot out 90 degrees laterally and keep the other foot slightly angled in for stability.",
      "Inhale and raise both arms sideways to shoulder height so they are parallel to the floor with palms facing down.",
      "Exhale and bend the torso laterally in the coronal plane over the lead leg without leaning the chest forward.",
      "Lower the lead hand onto the shin or ankle while extending the opposite arm straight upward toward the ceiling so both arms form one vertical line.",
      "Turn the head gently to gaze toward the raised thumb (or straight ahead if neck is sensitive) and hold.",
    ],
    finalPosture:
      "Wide-stance lateral torso bend with both knees straight, lower hand resting on the lead shin/ankle, upper arm extended vertically toward the ceiling in a single vertical line with the lower arm, palms facing forward.",
    holdingTime: {
      under40: "20–30 seconds per side",
      over40: "10–20 seconds per side (rest lower hand higher on shin above ankle)",
      defaultSeconds: 25,
    },
    recoveryTime: {
      under40: "15 seconds between sides",
      over40: "20 seconds between sides",
      defaultSeconds: 15,
    },
    correctnessCriteria: [
      "Wide stance with both knees kept straight (~165°–180°).",
      "Torso bends purely laterally in the coronal plane without pitching forward.",
      "Lower arm reaches downward toward the shin/ankle while the upper arm extends vertically upward (~180° opposing line).",
      "Chest and pelvis remain open toward the front.",
    ],
    keyJointAnglesAndAlignment: {
      targetEightAngles: [170, 170, 120, 120, 100, 170, 165, 165],
      headAndNeck: "Neck aligned with the spine, gaze directed upward toward the raised hand or straight ahead.",
      shoulderDeg: 120,
      elbowDeg: 170,
      wristAndPalmOrientation:
        "Both arms straight in opposing vertical alignment; palms facing forward (+Z).",
      fingerConfiguration: "Fingers extended together in line with the forearms.",
      torsoAndSpine: "Lateral coronal bend with both sides of the waist elongated.",
      hipDeg: 100,
      kneeDeg: 165,
      ankleAndFootPlacement: "Feet wide apart (~3–3.5 ft), lead foot turned out 90°, back heel grounded.",
      permittedVariationDeg: { under40: 15, over40: 24 },
    },
    commonErrors: [
      "Bending the front knee into a lunge instead of keeping both legs straight.",
      "Collapsing the chest forward toward the floor just to touch the ground.",
      "Allowing the raised arm to fall behind or in front of the shoulder line.",
    ],
    correctionCues: {
      general: [
        "Keep both knees straight and ground firmly through your feet.",
        "Bend sideways from the hip while keeping your chest open to the front.",
        "Stack your top shoulder above your bottom shoulder and stretch your top arm straight up.",
      ],
      under40: ["Slide your lower hand along the shin toward the ankle while keeping your spine long."],
      over40: [
        "Rest your lower hand lightly on your upper shin above the ankle and gaze straight ahead if your neck feels strained.",
      ],
    },
    contraindications: [
      "Acute sacroiliac joint dysfunction, severe sciatica, or acute hamstring tear.",
      "Severe migraine or cervical spondylosis (do not turn head upward).",
    ],
    precautions: {
      general: [
        "Keep the torso in one flat plane; prioritize spinal alignment over reaching the floor.",
      ],
      under40: ["Engage both quadriceps to protect the knee joints."],
      over40: ["Use a slightly shorter stance and keep the lower hand higher on the shin."],
    },
    beforeAsanaMessages: [
      "Step your feet wide apart, raise both arms to shoulder height, and bend laterally over your front leg.",
      "Keep both legs straight and extend your top arm vertically toward the ceiling.",
    ],
    afterAsanaMessages: [
      "Inhale to lift your torso back to center, lower your arms, and step your feet together.",
    ],
  },

  "SIA-01": {
    id: "SIA-01",
    sanskritName: "Ardha Ushtrasana",
    englishName: "Half Camel Pose",
    displayName: "Ardha Ushtrasana (Half Camel Pose)",
    correctionEngineName: "Ardha Ustrasana (Half Camel Pose)",
    category: "Sitting",
    source: "PENDING – consultant-approved sitting-asana tables awaited",
    status: ASANA_REFERENCE_STATUS.PENDING,
    handConfigMode: HAND_CONFIG_MODE.PENDING_SITTING,
    startingPosture:
      "[PENDING – consultant-approved sitting-asana tables awaited] Kneel upright on the mat with knees and thighs parallel, hands supporting the lower back/hips.",
    stepByStepMethod: [
      "Sit in Vajrasana, then rise onto your knees with thighs vertical.",
      "Place both palms on the lower back/hips with fingers pointing downward and elbows drawn back.",
      "Inhale, lift the chest, and gently arch the upper spine backward while keeping thighs vertical.",
    ],
    finalPosture:
      "[PENDING – consultant-approved sitting-asana tables awaited] Kneeling supported backward bend with thighs perpendicular to the floor and palms supporting the lower waist.",
    holdingTime: {
      under40: "15–30 seconds (Configurable pending consultant table)",
      over40: "10–15 seconds (Configurable pending consultant table)",
      defaultSeconds: 20,
    },
    recoveryTime: {
      under40: "15 seconds in Vajrasana",
      over40: "20 seconds in Vajrasana",
      defaultSeconds: 15,
    },
    correctnessCriteria: [
      "Thighs remain vertical above the knees (~90° knee flexion).",
      "Hands support the lower back/hips with chest lifted.",
      "Controlled thoracic extension without lumbar crunching.",
    ],
    keyJointAnglesAndAlignment: {
      targetEightAngles: [160, 160, 55, 55, 145, 145, 90, 90],
      headAndNeck: "Neck aligned smoothly with thoracic extension.",
      shoulderDeg: 55,
      elbowDeg: 130,
      wristAndPalmOrientation: "Palms supporting the posterior pelvis / lower waist.",
      fingerConfiguration: "Fingers resting on lower back.",
      torsoAndSpine: "Kneeling thoracic extension.",
      hipDeg: 145,
      kneeDeg: 90,
      ankleAndFootPlacement: "Knees and shins grounded on the mat.",
      permittedVariationDeg: { under40: 18, over40: 25 },
    },
    commonErrors: [
      "Pushing the hips backward toward the heels instead of keeping thighs vertical.",
      "Dropping the head back abruptly.",
    ],
    correctionCues: {
      general: [
        "Keep your thighs vertical over your knees.",
        "Support your lower back with both hands and lift your chest gently.",
      ],
      under40: ["Draw your elbows closer behind your back to open the chest."],
      over40: ["Place a folded blanket under your knees and keep the backbend gentle."],
    },
    contraindications: ["Acute knee injury, severe lumbar disc disease, or vertigo."],
    precautions: {
      general: ["Cushion the knees if needed and breathe steadily."],
      under40: ["Keep hips stacked over the knees."],
      over40: ["Avoid dropping the head backward if you have neck stiffness."],
    },
    beforeAsanaMessages: [
      "Rise onto your knees, support your lower back with your hands, and gently lift your chest.",
    ],
    afterAsanaMessages: [
      "Inhale to return upright and sit back gently on your heels to relax.",
    ],
  },

  "SIA-02": {
    id: "SIA-02",
    sanskritName: "Vakrasana",
    englishName: "Twisted Pose",
    displayName: "Vakrasana (Twisted Pose)",
    correctionEngineName: "Vakrasana (Twisted Pose)",
    category: "Sitting",
    source: "PENDING – consultant-approved sitting-asana tables awaited",
    status: ASANA_REFERENCE_STATUS.PENDING,
    handConfigMode: HAND_CONFIG_MODE.PENDING_SITTING,
    startingPosture:
      "[PENDING – consultant-approved sitting-asana tables awaited] Sit erect in Dandasana with both legs extended forward and spine upright.",
    stepByStepMethod: [
      "Sit with both legs stretched out straight in front of the body and spine erect.",
      "Bend one knee and place the foot flat on the floor beside the opposite knee.",
      "Place the same-side hand behind the back on the floor for spinal support.",
      "Bring the opposite arm across the bent knee and exhale while twisting the upper torso and neck toward the back shoulder.",
    ],
    finalPosture:
      "[PENDING – consultant-approved sitting-asana tables awaited] Seated spinal twist with one leg extended, one knee bent with foot grounded beside the knee, spine upright, and torso rotated laterally.",
    holdingTime: {
      under40: "20–30 seconds per side (Configurable pending consultant table)",
      over40: "10–20 seconds per side (Configurable pending consultant table)",
      defaultSeconds: 25,
    },
    recoveryTime: {
      under40: "15 seconds in Dandasana",
      over40: "20 seconds in Dandasana",
      defaultSeconds: 15,
    },
    correctnessCriteria: [
      "Spine remains upright and vertical during the twist without slouching backward.",
      "Both sitting bones remain grounded on the mat.",
      "Shoulders remain level as the thoracic spine rotates.",
    ],
    keyJointAnglesAndAlignment: {
      targetEightAngles: [160, 160, 130, 90, 90, 170, 130, 150],
      headAndNeck: "Head turns gently over the rear shoulder in line with the spinal twist.",
      shoulderDeg: 110,
      elbowDeg: 160,
      wristAndPalmOrientation: "Rear palm grounded behind pelvis; front arm hugging or bracing the bent knee.",
      fingerConfiguration: "Fingers relaxed.",
      torsoAndSpine: "Vertical axial rotation without lumbar flexion.",
      hipDeg: 90,
      kneeDeg: 130,
      ankleAndFootPlacement: "Extended leg straight with toes up; bent foot flat beside the opposite knee.",
      permittedVariationDeg: { under40: 18, over40: 25 },
    },
    commonErrors: [
      "Rounding or slouching the lower back while twisting.",
      "Lifting the sitting bone off the floor.",
    ],
    correctionCues: {
      general: [
        "Lengthen your spine upward before twisting.",
        "Keep both sitting bones grounded on the mat and shoulders level.",
      ],
      under40: ["Use your front arm outside the bent knee to deepen the thoracic twist."],
      over40: ["Hug the bent knee gently with your front arm and twist within a comfortable range."],
    },
    contraindications: ["Acute spinal disc herniation or recent abdominal surgery."],
    precautions: {
      general: ["Never force the twist; lengthen on the inhale and rotate gently on the exhale."],
      under40: ["Keep the extended leg active."],
      over40: ["Sit on a folded blanket if hamstrings or hips are tight."],
    },
    beforeAsanaMessages: [
      "Sit tall with legs extended, bend one knee, and twist your upper body gently while keeping your spine upright.",
    ],
    afterAsanaMessages: [
      "Exhale to unwind back to center, straighten your leg, and repeat on the other side.",
    ],
  },

  "SU-01": {
    id: "SU-01",
    sanskritName: "Pavanamukthasana",
    englishName: "Wind-Relieving Pose",
    displayName: "Pavanamukthasana (Wind-Relieving Pose)",
    correctionEngineName: "Pavanamukthasana (Wind-Relieving Pose)",
    category: "Supine",
    source: "Consultant-Approved Supine Asana Reference Table (SU-01)",
    status: ASANA_REFERENCE_STATUS.APPROVED,
    handConfigMode: HAND_CONFIG_MODE.PAVANAMUKTHASANA_SHIN_CLASP,
    startingPosture:
      "Lie flat on your back (supine) with legs together, arms resting beside the body, and spine relaxed on the mat.",
    stepByStepMethod: [
      "Lie supine on the mat with legs extended together and arms alongside the body.",
      "Inhale and bend both knees, drawing the thighs gently up toward the chest.",
      "Interlock your fingers or clasp your hands around the shins just below the knees.",
      "Exhale and gently press the thighs against the abdomen (lifting head/chin toward knees only if neck is healthy, or keeping head resting on the mat for 40+ or cervical sensitivity).",
      "Breathe calmly and hold the posture.",
    ],
    finalPosture:
      "Supine posture with both knees flexed and drawn into the chest, hands/fingers clasped around the shins just below the knees, back supported on the mat.",
    holdingTime: {
      under40: "20–30 seconds",
      over40: "15–20 seconds with head resting comfortably on the mat",
      defaultSeconds: 25,
    },
    recoveryTime: {
      under40: "15 seconds in Savasana",
      over40: "20 seconds in Savasana",
      defaultSeconds: 15,
    },
    correctnessCriteria: [
      "Both knees are flexed (~60°–85°) and drawn symmetrically toward the chest.",
      "Hands/fingers clasp around the shins just below the knees.",
      "Lower back and pelvis remain grounded on the mat without rolling to one side.",
      "Shoulders remain relaxed away from the ears.",
    ],
    keyJointAnglesAndAlignment: {
      targetEightAngles: [130, 130, 45, 45, 75, 75, 65, 65],
      headAndNeck:
        "Chin gently tucked toward knees (under 40) or head resting flat on the mat (40+ / cervical precaution).",
      shoulderDeg: 45,
      elbowDeg: 130,
      wristAndPalmOrientation: "Hands wrapped around the front of the shins just below the knees.",
      fingerConfiguration: "Fingers interlocked or clasping opposite wrists/forearms over the shins.",
      torsoAndSpine: "Supine on the mat with lumbar spine gently flattened.",
      hipDeg: 75,
      kneeDeg: 65,
      ankleAndFootPlacement: "Feet relaxed side-by-side in the air as knees hug toward the chest.",
      permittedVariationDeg: { under40: 15, over40: 25 },
    },
    commonErrors: [
      "Straining the neck with shoulders hunched up toward the ears.",
      "Lifting the tailbone excessively off the mat or rolling sideways.",
      "Pulling directly on the kneecaps instead of clasping the shins below the knees.",
    ],
    correctionCues: {
      general: [
        "Draw both knees gently toward your chest and clasp your hands around your shins just below the knees.",
        "Keep your lower back grounded on the mat and relax your shoulders.",
      ],
      under40: [
        "Hug your thighs snugly toward your abdomen and breathe smoothly.",
      ],
      over40: [
        "Keep the back of your head resting on the mat to protect your neck, and hold behind your thighs if your knees are sensitive.",
      ],
    },
    contraindications: [
      "Recent abdominal surgery, abdominal hernia, or third-trimester pregnancy.",
      "Severe cervical spondylosis (do not lift the head off the mat).",
    ],
    precautions: {
      general: [
        "Clasp the shins below the knees (or behind the thighs if knees are sensitive) — do not press on the kneecaps.",
      ],
      under40: ["Keep the chin gently tucked rather than jutting forward."],
      over40: ["Keep head and neck resting on the floor throughout the hold."],
    },
    beforeAsanaMessages: [
      "Lie flat on your back, bend both knees to your chest, and clasp your hands around your shins.",
    ],
    afterAsanaMessages: [
      "Exhale, release your hands, and slowly lower your legs back down to the mat.",
    ],
  },

  "SU-02": {
    id: "SU-02",
    sanskritName: "Savasana",
    englishName: "Corpse Pose",
    displayName: "Savasana (Corpse Pose)",
    correctionEngineName: "Savasana (Corpse Pose)",
    category: "Supine",
    source: "Consultant-Approved Supine Asana Reference Table (SU-02)",
    status: ASANA_REFERENCE_STATUS.APPROVED,
    handConfigMode: HAND_CONFIG_MODE.SAVASANA_SUPINE_PALMS_UP,
    startingPosture:
      "Lie flat on your back along the center of the mat with spine neutral and head aligned.",
    stepByStepMethod: [
      "Lie supine on the back and separate the feet comfortably (~1.5 to 2 feet apart), allowing the toes to fall naturally outward.",
      "Place both arms at a 30–45 degree angle away from the sides of the body with palms facing upward toward the ceiling.",
      "Center the head and neck in line with the spine and gently close the eyes.",
      "Consciously relax every muscle group from the toes to the crown of the head while observing slow, natural abdominal breathing.",
    ],
    finalPosture:
      "Complete supine relaxation with legs extended and slightly apart, arms resting slightly away from the torso with palms facing upward and fingers naturally relaxed, spine and head aligned on the mat.",
    holdingTime: {
      under40: "60–180 seconds of deep relaxation",
      over40: "60–180 seconds (may place a thin cushion under knees/head for lumbar comfort)",
      defaultSeconds: 120,
    },
    recoveryTime: {
      under40: "Roll gently onto one side before sitting up",
      over40: "Roll onto the right side and pause for 2–3 breaths before sitting up slowly",
      defaultSeconds: 15,
    },
    correctnessCriteria: [
      "Body lies symmetrically supine with spine, pelvis, and shoulders flat and relaxed.",
      "Legs are extended (~170°–180°) and comfortably separated.",
      "Arms rest slightly away from the torso with elbows straight and palms turned upward.",
      "Head is centered in line with the spine without tension.",
    ],
    keyJointAnglesAndAlignment: {
      targetEightAngles: [175, 175, 25, 25, 175, 175, 175, 175],
      headAndNeck: "Head centered on the midline, chin slightly lower than forehead, facial muscles relaxed.",
      shoulderDeg: 25,
      elbowDeg: 175,
      wristAndPalmOrientation: "Wrists resting away from hips with palms facing upward toward the ceiling.",
      fingerConfiguration: "Fingers softly and naturally curved in complete relaxation.",
      torsoAndSpine: "Neutral supine alignment along the mat.",
      hipDeg: 175,
      kneeDeg: 175,
      ankleAndFootPlacement: "Feet 1.5–2 feet apart, ankles relaxed with toes falling gently outward.",
      permittedVariationDeg: { under40: 20, over40: 28 },
    },
    commonErrors: [
      "Keeping feet pressed tightly together or tensing the legs.",
      "Holding the arms rigid against the torso or placing palms face-down.",
      "Tilting the chin sharply upward and tensing the back of the neck.",
    ],
    correctionCues: {
      general: [
        "Allow your legs to rest comfortably apart and let your feet relax outward.",
        "Rest your arms slightly away from your sides with your palms facing upward.",
        "Relax your shoulders, jaw, and breath completely.",
      ],
      under40: ["Scan your body from toes to head and release any residual muscular tension."],
      over40: [
        "Support under your knees with a bolster or rolled towel if your lower back feels any tension.",
      ],
    },
    contraindications: [
      "Late pregnancy (lie on the left side instead of flat supine).",
    ],
    precautions: {
      general: [
        "Do not get up abruptly after Savasana; roll to one side first.",
      ],
      under40: ["Keep the mind attentive to slow, rhythmic breathing."],
      over40: ["Take extra time sitting up slowly after relaxation to allow blood pressure to stabilize."],
    },
    beforeAsanaMessages: [
      "Lie comfortably on your back with your legs slightly apart and palms facing upward.",
      "Close your eyes gently and let your entire body relax with slow, natural breathing.",
    ],
    afterAsanaMessages: [
      "Gently wiggle your fingers and toes, roll onto your side, and slowly come up to a seated posture.",
    ],
  },
};

export const NINE_SUPPORTED_ASANAS = Object.values(ASANA_REFERENCE_TABLE);

/**
 * Normalizes any pose identifier, Sanskrit name, English name, or correction-engine name
 * to the corresponding authoritative entry in `ASANA_REFERENCE_TABLE`.
 */
export function getAsanaReferenceByNameOrId(query = "") {
  if (!query) return null;
  const raw = String(query).trim();
  if (ASANA_REFERENCE_TABLE[raw]) {
    return ASANA_REFERENCE_TABLE[raw];
  }

  const lower = raw.toLowerCase();
  for (const entry of NINE_SUPPORTED_ASANAS) {
    if (
      entry.id.toLowerCase() === lower ||
      entry.sanskritName.toLowerCase() === lower ||
      entry.englishName.toLowerCase() === lower ||
      entry.displayName.toLowerCase() === lower ||
      entry.correctionEngineName.toLowerCase() === lower
    ) {
      return entry;
    }
  }

  if (lower.includes("tadasana") || lower.includes("mountain") || lower.includes("urdhva hastasana")) {
    return ASANA_REFERENCE_TABLE["STA-01"];
  }
  if (
    lower.includes("vrikshasana") ||
    lower.includes("vrksasana") ||
    lower.includes("vrkasana") ||
    lower.includes("tree")
  ) {
    return ASANA_REFERENCE_TABLE["STA-02"];
  }
  if (
    lower.includes("padahastasana") ||
    lower.includes("pada-hastasana") ||
    lower.includes("pada hastasana") ||
    lower.includes("hand-to-foot")
  ) {
    return ASANA_REFERENCE_TABLE["STA-03"];
  }
  if (
    lower.includes("ardha chakrasana") ||
    lower.includes("ardha cakrasana") ||
    lower.includes("half wheel") ||
    lower.includes("half-wheel")
  ) {
    return ASANA_REFERENCE_TABLE["STA-04-I"];
  }
  if (lower.includes("trikonasana") || lower.includes("triangle")) {
    return ASANA_REFERENCE_TABLE["STA-05-I"];
  }
  if (
    lower.includes("ardha ushtrasana") ||
    lower.includes("ardha ustrasana") ||
    lower.includes("half camel")
  ) {
    return ASANA_REFERENCE_TABLE["SIA-01"];
  }
  if (lower.includes("vakrasana") || lower.includes("twisted")) {
    return ASANA_REFERENCE_TABLE["SIA-02"];
  }
  if (
    lower.includes("pavanamukthasana") ||
    lower.includes("pavanamuktasana") ||
    lower.includes("wind-relieving") ||
    lower.includes("wind relieving")
  ) {
    return ASANA_REFERENCE_TABLE["SU-01"];
  }
  if (lower.includes("savasana") || lower.includes("shavasana") || lower.includes("corpse")) {
    return ASANA_REFERENCE_TABLE["SU-02"];
  }

  return null;
}

/**
 * Resolves the hand configuration mode (`HAND_CONFIG_MODE`) for a given pose name or ID.
 */
export function resolveHandConfigModeForPose(poseNameOrId = "") {
  const ref = getAsanaReferenceByNameOrId(poseNameOrId);
  return ref?.handConfigMode || HAND_CONFIG_MODE.OPEN_NATURAL;
}

/**
 * Builds a complete, validated 33-landmark target pose in normalized camera coordinates
 * scaled to the user's live body dimensions (`liveLandmarks`) for any of the 9 supported asanas.
 *
 * Used by `CorrectiveCoordinateAdapter` so that:
 * 1. Each of the 9 asanas has a distinct, consultant-validated target pose.
 * 2. Tadasana generates overhead interlocked hands with symmetric grounded legs (never Namaste, never Vrikshasana).
 * 3. Vrikshasana generates a single-leg balance with the raised foot placed on the inner thigh and overhead/chest Namaste hands.
 * 4. Padahastasana generates a hip-hinged forward fold with hands reaching toward the feet/ankles.
 * 5. Ardha Chakrasana generates a supported standing backbend with hands on the lower back.
 * 6. Trikonasana generates a wide-stance lateral torso bend with opposing vertical arms.
 * 7. Pavanamukthasana generates knees drawn to chest with hands clasping the shins.
 * 8. Savasana generates a relaxed posture with arms ~35 deg from the sides and palms up.
 */
export function buildValidatedAsanaTargetLandmarks(poseNameOrId, liveLandmarks = null) {
  const ref = getAsanaReferenceByNameOrId(poseNameOrId);
  const id = ref?.id || "STA-01";

  // Measure user's live center and torso scale if available, otherwise use standard centered proportions
  let cx = 0.5;
  let hipY = 0.54;
  let torsoLen = 0.22;
  let shHalfW = 0.095;
  let hipHalfW = 0.065;
  let upperArmLen = 0.125;
  let foreArmLen = 0.115;
  let thighLen = 0.175;
  let shinLen = 0.165;

  if (Array.isArray(liveLandmarks) && liveLandmarks.length >= 33) {
    const lSh = liveLandmarks[11];
    const rSh = liveLandmarks[12];
    const lHip = liveLandmarks[23];
    const rHip = liveLandmarks[24];
    const lEl = liveLandmarks[13];
    const lWr = liveLandmarks[15];
    const lKn = liveLandmarks[25];
    const lAn = liveLandmarks[27];

    if (lHip && rHip && lSh && rSh) {
      cx = (lHip.x + rHip.x) * 0.5;
      hipY = (lHip.y + rHip.y) * 0.5;
      const shX = (lSh.x + rSh.x) * 0.5;
      const shY = (lSh.y + rSh.y) * 0.5;
      torsoLen = Math.max(0.14, Math.min(0.28, Math.hypot(shX - cx, shY - hipY)));
      shHalfW = Math.max(0.065, Math.min(0.13, Math.hypot(lSh.x - rSh.x, lSh.y - rSh.y) * 0.5));
      hipHalfW = Math.max(0.045, Math.min(0.095, Math.hypot(lHip.x - rHip.x, lHip.y - rHip.y) * 0.5));
    }
    if (lSh && lEl && lWr) {
      upperArmLen = Math.max(0.09, Math.min(0.16, Math.hypot(lEl.x - lSh.x, lEl.y - lSh.y)));
      foreArmLen = Math.max(0.08, Math.min(0.15, Math.hypot(lWr.x - lEl.x, lWr.y - lEl.y)));
    }
    if (lHip && lKn && lAn) {
      thighLen = Math.max(0.12, Math.min(0.22, Math.hypot(lKn.x - lHip.x, lKn.y - lHip.y)));
      shinLen = Math.max(0.12, Math.min(0.22, Math.hypot(lAn.x - lKn.x, lAn.y - lKn.y)));
    }
  }

  // Note: In MediaPipe front-camera image coordinates (with MIRROR_MODE = true):
  // Left side of user's body (MP.L_*) is at x = cx + offset (right side of raw image),
  // Right side of user's body (MP.R_*) is at x = cx - offset (left side of raw image).
  let lSign = 1;
  if (Array.isArray(liveLandmarks) && liveLandmarks[11] && liveLandmarks[12]) {
    lSign = liveLandmarks[11].x >= liveLandmarks[12].x ? 1 : -1;
  }
  const rSign = -lSign;

  const pt = (x, y, z = 0) => ({ x, y, z, visibility: 0.99 });
  const lms = Array.from({ length: 33 }, () => pt(cx, hipY, 0));

  const setHeadFromShoulders = (shMidX, shMidY, headDirX = 0, headDirY = -1, headZ = 0) => {
    const neckLen = torsoLen * 0.42;
    const noseX = shMidX + headDirX * neckLen;
    const noseY = shMidY + headDirY * neckLen;
    lms[0] = pt(noseX, noseY, headZ - 0.03);
    lms[1] = pt(noseX + lSign * 0.012, noseY - 0.012, headZ - 0.03);
    lms[2] = pt(noseX + lSign * 0.018, noseY - 0.012, headZ - 0.03);
    lms[3] = pt(noseX + lSign * 0.024, noseY - 0.012, headZ - 0.03);
    lms[4] = pt(noseX + rSign * 0.012, noseY - 0.012, headZ - 0.03);
    lms[5] = pt(noseX + rSign * 0.018, noseY - 0.012, headZ - 0.03);
    lms[6] = pt(noseX + rSign * 0.024, noseY - 0.012, headZ - 0.03);
    lms[7] = pt(noseX + lSign * 0.035, noseY, headZ);
    lms[8] = pt(noseX + rSign * 0.035, noseY, headZ);
    lms[9] = pt(noseX + lSign * 0.012, noseY + 0.015, headZ - 0.03);
    lms[10] = pt(noseX + rSign * 0.012, noseY + 0.015, headZ - 0.03);
  };

  const setFeetFromAnkles = () => {
    for (const [ankIdx, heelIdx, toeIdx] of [
      [27, 29, 31],
      [28, 30, 32],
    ]) {
      const a = lms[ankIdx];
      lms[heelIdx] = pt(a.x, a.y + 0.018, a.z + 0.02);
      lms[toeIdx] = pt(a.x, a.y + 0.025, a.z - 0.05);
    }
  };

  if (id === "STA-01") {
    // 1. TADASANA: Grounded symmetric legs, upright spine, arms stretched overhead beside ears,
    // fingers interlocked above head, palms facing UPWARD toward ceiling (+Y world normal).
    const shY = hipY - torsoLen;
    lms[23] = pt(cx + lSign * hipHalfW, hipY, 0);
    lms[24] = pt(cx + rSign * hipHalfW, hipY, 0);
    lms[11] = pt(cx + lSign * shHalfW, shY, 0);
    lms[12] = pt(cx + rSign * shHalfW, shY, 0);
    setHeadFromShoulders(cx, shY, 0, -1, 0);

    // Arms stretched straight up beside ears, wrists meeting above the crown of the head
    const elY = shY - upperArmLen * 0.96;
    const wrY = elY - foreArmLen * 0.92;
    lms[13] = pt(cx + lSign * (shHalfW * 0.62), elY, -0.01);
    lms[14] = pt(cx + rSign * (shHalfW * 0.62), elY, -0.01);
    lms[15] = pt(cx + lSign * 0.018, wrY, -0.01);
    lms[16] = pt(cx + rSign * 0.018, wrY, -0.01);

    // Fingers interlocked horizontally across the midline with palms rotated upward
    lms[19] = pt(cx + rSign * 0.012, wrY - 0.012, -0.02);
    lms[17] = pt(cx + rSign * 0.012, wrY - 0.008, 0.02);
    lms[21] = pt(cx + lSign * 0.005, wrY - 0.010, -0.03);
    lms[20] = pt(cx + lSign * 0.012, wrY - 0.012, -0.02);
    lms[18] = pt(cx + lSign * 0.012, wrY - 0.008, 0.02);
    lms[22] = pt(cx + rSign * 0.005, wrY - 0.010, -0.03);

    // Symmetric straight grounded legs
    lms[25] = pt(cx + lSign * hipHalfW, hipY + thighLen, 0);
    lms[26] = pt(cx + rSign * hipHalfW, hipY + thighLen, 0);
    lms[27] = pt(cx + lSign * hipHalfW, hipY + thighLen + shinLen, 0);
    lms[28] = pt(cx + rSign * hipHalfW, hipY + thighLen + shinLen, 0);
    setFeetFromAnkles();
    return lms;
  }

  if (id === "STA-02") {
    // 2. VRIKSHASANA (Tree Pose): Standing leg straight, raised foot placed on inner thigh above knee,
    // bent knee turned outward laterally, palms joined in overhead Namaste.
    const shY = hipY - torsoLen;
    lms[23] = pt(cx + lSign * hipHalfW, hipY, 0);
    lms[24] = pt(cx + rSign * hipHalfW, hipY, 0);
    lms[11] = pt(cx + lSign * shHalfW, shY, 0);
    lms[12] = pt(cx + rSign * shHalfW, shY, 0);
    setHeadFromShoulders(cx, shY, 0, -1, 0);

    // Overhead Namaste hands (wrists together above head, fingers pointing straight up)
    const elY = shY - upperArmLen * 0.82;
    const wrY = elY - foreArmLen * 0.85;
    lms[13] = pt(cx + lSign * (shHalfW * 1.05), elY, -0.02);
    lms[14] = pt(cx + rSign * (shHalfW * 1.05), elY, -0.02);
    lms[15] = pt(cx + lSign * 0.014, wrY, -0.02);
    lms[16] = pt(cx + rSign * 0.014, wrY, -0.02);
    lms[19] = pt(cx + lSign * 0.010, wrY - 0.04, -0.03);
    lms[17] = pt(cx + lSign * 0.010, wrY - 0.04, 0.01);
    lms[21] = pt(cx + lSign * 0.012, wrY - 0.02, -0.04);
    lms[20] = pt(cx + rSign * 0.010, wrY - 0.04, -0.03);
    lms[18] = pt(cx + rSign * 0.010, wrY - 0.04, 0.01);
    lms[22] = pt(cx + rSign * 0.012, wrY - 0.02, -0.04);

    // Determine which leg the user is lifting (default to right leg lifted if neither is lifted yet)
    let liftLeft = false;
    if (Array.isArray(liveLandmarks) && liveLandmarks[27] && liveLandmarks[28]) {
      liftLeft = liveLandmarks[27].y < liveLandmarks[28].y - 0.02;
    }

    if (liftLeft) {
      // Right leg standing straight, Left foot placed on Right inner thigh
      const standX = cx + rSign * (hipHalfW * 0.55);
      lms[26] = pt(standX, hipY + thighLen, 0);
      lms[28] = pt(standX, hipY + thighLen + shinLen, 0);
      lms[25] = pt(cx + lSign * (hipHalfW + thighLen * 0.78), hipY + thighLen * 0.42, -0.02);
      lms[27] = pt(standX + lSign * 0.028, hipY + thighLen * 0.48, -0.01);
    } else {
      // Left leg standing straight, Right foot placed on Left inner thigh
      const standX = cx + lSign * (hipHalfW * 0.55);
      lms[25] = pt(standX, hipY + thighLen, 0);
      lms[27] = pt(standX, hipY + thighLen + shinLen, 0);
      lms[26] = pt(cx + rSign * (hipHalfW + thighLen * 0.78), hipY + thighLen * 0.42, -0.02);
      lms[28] = pt(standX + rSign * 0.028, hipY + thighLen * 0.48, -0.01);
    }
    setFeetFromAnkles();
    return lms;
  }

  if (id === "STA-03") {
    // 3. PADAHASTASANA (Hand-to-Foot Pose): Forward fold from hips, torso & head hanging downward,
    // hands reaching down toward the ankles/feet, legs vertical and grounded.
    const shY = hipY + torsoLen * 0.68;
    const shZ = -0.14;
    lms[23] = pt(cx + lSign * hipHalfW, hipY, 0.04);
    lms[24] = pt(cx + rSign * hipHalfW, hipY, 0.04);
    lms[11] = pt(cx + lSign * shHalfW, shY, shZ);
    lms[12] = pt(cx + rSign * shHalfW, shY, shZ);
    setHeadFromShoulders(cx, shY, 0, 0.85, shZ - 0.04);

    // Arms reaching straight down toward the ankles/feet
    const elY = shY + upperArmLen * 0.82;
    const wrY = Math.min(hipY + thighLen + shinLen * 0.88, elY + foreArmLen * 0.82);
    lms[13] = pt(cx + lSign * shHalfW, elY, shZ - 0.02);
    lms[14] = pt(cx + rSign * shHalfW, elY, shZ - 0.02);
    lms[15] = pt(cx + lSign * (hipHalfW * 1.15), wrY, -0.08);
    lms[16] = pt(cx + rSign * (hipHalfW * 1.15), wrY, -0.08);
    lms[19] = pt(lms[15].x, wrY + 0.03, -0.09);
    lms[17] = pt(lms[15].x, wrY + 0.03, -0.06);
    lms[21] = pt(lms[15].x, wrY + 0.02, -0.10);
    lms[20] = pt(lms[16].x, wrY + 0.03, -0.09);
    lms[18] = pt(lms[16].x, wrY + 0.03, -0.06);
    lms[22] = pt(lms[16].x, wrY + 0.02, -0.10);

    // Grounded straight legs
    lms[25] = pt(cx + lSign * hipHalfW, hipY + thighLen, 0.02);
    lms[26] = pt(cx + rSign * hipHalfW, hipY + thighLen, 0.02);
    lms[27] = pt(cx + lSign * hipHalfW, hipY + thighLen + shinLen, 0);
    lms[28] = pt(cx + rSign * hipHalfW, hipY + thighLen + shinLen, 0);
    setFeetFromAnkles();
    return lms;
  }

  if (id === "STA-04-I") {
    // 4. ARDHA CHAKRASANA (Half Wheel Pose): Controlled standing backward bend,
    // hands supporting the lower back/hips, elbows drawn back, chest lifted.
    const shY = hipY - torsoLen * 0.94;
    const shZ = 0.10; // Shoulders arched backward behind hips
    lms[23] = pt(cx + lSign * hipHalfW, hipY, -0.04);
    lms[24] = pt(cx + rSign * hipHalfW, hipY, -0.04);
    lms[11] = pt(cx + lSign * shHalfW, shY, shZ);
    lms[12] = pt(cx + rSign * shHalfW, shY, shZ);
    setHeadFromShoulders(cx, shY, 0, -0.88, shZ + 0.08);

    // Elbows bent behind back, wrists supporting the posterior waist/hips
    lms[13] = pt(cx + lSign * (shHalfW * 1.18), shY + upperArmLen * 0.68, shZ + 0.12);
    lms[14] = pt(cx + rSign * (shHalfW * 1.18), shY + upperArmLen * 0.68, shZ + 0.12);
    lms[15] = pt(cx + lSign * (hipHalfW * 0.95), hipY - 0.02, 0.08);
    lms[16] = pt(cx + rSign * (hipHalfW * 0.95), hipY - 0.02, 0.08);
    lms[19] = pt(lms[15].x, hipY + 0.02, 0.09);
    lms[17] = pt(lms[15].x, hipY + 0.02, 0.07);
    lms[21] = pt(lms[15].x + lSign * 0.01, hipY, 0.07);
    lms[20] = pt(lms[16].x, hipY + 0.02, 0.09);
    lms[18] = pt(lms[16].x, hipY + 0.02, 0.07);
    lms[22] = pt(lms[16].x + rSign * 0.01, hipY, 0.07);

    // Grounded legs hip-width apart
    lms[25] = pt(cx + lSign * hipHalfW, hipY + thighLen, -0.02);
    lms[26] = pt(cx + rSign * hipHalfW, hipY + thighLen, -0.02);
    lms[27] = pt(cx + lSign * hipHalfW, hipY + thighLen + shinLen, 0);
    lms[28] = pt(cx + rSign * hipHalfW, hipY + thighLen + shinLen, 0);
    setFeetFromAnkles();
    return lms;
  }

  if (id === "STA-05-I") {
    // 5. TRIKONASANA (Triangle Pose): Wide-leg stance, lateral coronal torso bend (~58 deg),
    // lower hand reaching lead shin/ankle, upper arm extending vertically toward ceiling.
    const bendSign = rSign; // Default lateral bend toward user's right leg
    const tiltRad = 1.02; // ~58 deg lateral tilt from vertical
    const spineMidX = cx + bendSign * Math.sin(tiltRad) * torsoLen;
    const spineMidY = hipY - Math.cos(tiltRad) * torsoLen;

    lms[23] = pt(cx + lSign * hipHalfW, hipY, 0);
    lms[24] = pt(cx + rSign * hipHalfW, hipY, 0);

    // Stack top shoulder (L_SHOULDER) above bottom shoulder (R_SHOULDER)
    lms[11] = pt(spineMidX, spineMidY - shHalfW * 0.92, 0);
    lms[12] = pt(spineMidX, spineMidY + shHalfW * 0.92, 0);
    setHeadFromShoulders(
      spineMidX,
      spineMidY,
      bendSign * Math.sin(tiltRad),
      -Math.cos(tiltRad),
      0
    );

    // Top arm (Left) extends straight up toward ceiling (-Y in image)
    lms[13] = pt(spineMidX, lms[11].y - upperArmLen, -0.01);
    lms[15] = pt(spineMidX, lms[13].y - foreArmLen, -0.02);
    lms[19] = pt(spineMidX, lms[15].y - 0.035, -0.03);
    lms[17] = pt(spineMidX + bendSign * 0.015, lms[15].y - 0.035, -0.02);
    lms[21] = pt(spineMidX - bendSign * 0.015, lms[15].y - 0.02, -0.03);

    // Bottom arm (Right) extends straight down toward the right shin/ankle (+Y in image)
    lms[14] = pt(spineMidX, lms[12].y + upperArmLen * 0.95, -0.02);
    lms[16] = pt(spineMidX, lms[14].y + foreArmLen * 0.95, -0.03);
    lms[20] = pt(spineMidX, lms[16].y + 0.035, -0.04);
    lms[18] = pt(spineMidX + bendSign * 0.015, lms[16].y + 0.035, -0.03);
    lms[22] = pt(spineMidX - bendSign * 0.015, lms[16].y + 0.02, -0.04);

    // Wide straight legs
    const wideSpan = (thighLen + shinLen) * 0.42;
    lms[25] = pt(cx + lSign * (hipHalfW + wideSpan * 0.48), hipY + thighLen * 0.88, 0);
    lms[27] = pt(cx + lSign * (hipHalfW + wideSpan), hipY + (thighLen + shinLen) * 0.88, 0);
    lms[26] = pt(cx + rSign * (hipHalfW + wideSpan * 0.48), hipY + thighLen * 0.88, 0);
    lms[28] = pt(cx + rSign * (hipHalfW + wideSpan), hipY + (thighLen + shinLen) * 0.88, 0);
    setFeetFromAnkles();
    return lms;
  }

  if (id === "SIA-01") {
    // 6. ARDHA USHTRASANA (Half Camel Pose - PENDING consultant table):
    // Kneeling upright on shins, hands supporting lower back, chest lifted in mild backbend.
    const shY = hipY - torsoLen * 0.94;
    const shZ = 0.09;
    lms[23] = pt(cx + lSign * hipHalfW, hipY, -0.03);
    lms[24] = pt(cx + rSign * hipHalfW, hipY, -0.03);
    lms[11] = pt(cx + lSign * shHalfW, shY, shZ);
    lms[12] = pt(cx + rSign * shHalfW, shY, shZ);
    setHeadFromShoulders(cx, shY, 0, -0.9, shZ + 0.06);

    lms[13] = pt(cx + lSign * (shHalfW * 1.15), shY + upperArmLen * 0.70, shZ + 0.10);
    lms[14] = pt(cx + rSign * (shHalfW * 1.15), shY + upperArmLen * 0.70, shZ + 0.10);
    lms[15] = pt(cx + lSign * (hipHalfW * 0.95), hipY - 0.02, 0.07);
    lms[16] = pt(cx + rSign * (hipHalfW * 0.95), hipY - 0.02, 0.07);
    lms[19] = pt(lms[15].x, hipY + 0.02, 0.08);
    lms[17] = pt(lms[15].x, hipY + 0.02, 0.06);
    lms[20] = pt(lms[16].x, hipY + 0.02, 0.08);
    lms[18] = pt(lms[16].x, hipY + 0.02, 0.06);

    // Thighs vertical, knees flexed 90 deg backward
    lms[25] = pt(cx + lSign * hipHalfW, hipY + thighLen, -0.02);
    lms[26] = pt(cx + rSign * hipHalfW, hipY + thighLen, -0.02);
    lms[27] = pt(cx + lSign * hipHalfW, hipY + thighLen, shinLen * 0.85);
    lms[28] = pt(cx + rSign * hipHalfW, hipY + thighLen, shinLen * 0.85);
    setFeetFromAnkles();
    return lms;
  }

  if (id === "SIA-02") {
    // 7. VAKRASANA (Twisted Pose - PENDING consultant table):
    // Upright spine with axial torso rotation, one knee flexed, one arm across knee, one hand behind hip.
    const shY = hipY - torsoLen;
    lms[23] = pt(cx + lSign * hipHalfW, hipY, 0);
    lms[24] = pt(cx + rSign * hipHalfW, hipY, 0);
    lms[11] = pt(cx + lSign * (shHalfW * 0.82), shY, 0.06);
    lms[12] = pt(cx + rSign * (shHalfW * 0.82), shY, -0.06);
    setHeadFromShoulders(cx, shY, 0, -1, 0);

    // Left hand behind back, Right arm across to left knee
    lms[13] = pt(cx + lSign * (shHalfW * 1.05), shY + upperArmLen * 0.78, 0.08);
    lms[15] = pt(cx + lSign * (hipHalfW * 0.95), hipY + 0.02, 0.10);
    lms[14] = pt(cx + rSign * (shHalfW * 0.45), shY + upperArmLen * 0.65, -0.08);
    lms[16] = pt(cx + lSign * (hipHalfW * 0.45), hipY + 0.02, -0.12);
    lms[19] = pt(lms[15].x, lms[15].y + 0.02, 0.11);
    lms[17] = pt(lms[15].x, lms[15].y + 0.02, 0.09);
    lms[20] = pt(lms[16].x, lms[16].y + 0.02, -0.14);
    lms[18] = pt(lms[16].x, lms[16].y + 0.02, -0.11);

    lms[25] = pt(cx + lSign * hipHalfW, hipY - thighLen * 0.25, -0.14);
    lms[27] = pt(cx + lSign * hipHalfW, hipY + shinLen * 0.75, -0.08);
    lms[26] = pt(cx + rSign * hipHalfW, hipY + thighLen * 0.85, -0.08);
    lms[28] = pt(cx + rSign * hipHalfW, hipY + (thighLen + shinLen) * 0.85, -0.14);
    setFeetFromAnkles();
    return lms;
  }

  if (id === "SU-01") {
    // 8. PAVANAMUKTHASANA (Wind-Relieving Pose):
    // Both knees flexed and drawn up toward the chest, hands/fingers clasped around the shins just below the knees.
    const shY = hipY - torsoLen;
    lms[23] = pt(cx + lSign * hipHalfW, hipY, 0.02);
    lms[24] = pt(cx + rSign * hipHalfW, hipY, 0.02);
    lms[11] = pt(cx + lSign * shHalfW, shY, 0.02);
    lms[12] = pt(cx + rSign * shHalfW, shY, 0.02);
    setHeadFromShoulders(cx, shY, 0, -0.95, -0.03);

    // Knees flexed tightly up toward the chest (hip ~70 deg, knee ~65 deg)
    const kneeY = hipY - torsoLen * 0.38;
    const kneeZ = -0.14;
    const ankY = hipY + shinLen * 0.42;
    const ankZ = -0.10;
    lms[25] = pt(cx + lSign * (hipHalfW * 0.72), kneeY, kneeZ);
    lms[26] = pt(cx + rSign * (hipHalfW * 0.72), kneeY, kneeZ);
    lms[27] = pt(cx + lSign * (hipHalfW * 0.65), ankY, ankZ);
    lms[28] = pt(cx + rSign * (hipHalfW * 0.65), ankY, ankZ);
    setFeetFromAnkles();

    // Elbows slightly wide, hands clasping across the front of the shins just below the knees
    const claspY = kneeY + 0.045;
    lms[13] = pt(cx + lSign * (shHalfW * 1.08), (shY + claspY) * 0.5, -0.06);
    lms[14] = pt(cx + rSign * (shHalfW * 1.08), (shY + claspY) * 0.5, -0.06);
    lms[15] = pt(cx + lSign * 0.022, claspY, kneeZ - 0.03);
    lms[16] = pt(cx + rSign * 0.022, claspY, kneeZ - 0.03);
    lms[19] = pt(cx + rSign * 0.015, claspY, kneeZ - 0.04);
    lms[17] = pt(cx + rSign * 0.015, claspY + 0.012, kneeZ - 0.03);
    lms[21] = pt(cx + lSign * 0.008, claspY - 0.01, kneeZ - 0.04);
    lms[20] = pt(cx + lSign * 0.015, claspY, kneeZ - 0.04);
    lms[18] = pt(cx + lSign * 0.015, claspY + 0.012, kneeZ - 0.03);
    lms[22] = pt(cx + rSign * 0.008, claspY - 0.01, kneeZ - 0.04);
    return lms;
  }

  // 9. SAVASANA (Corpse Pose, SU-02):
  // Spine symmetrical and neutral, legs extended and comfortably apart (~20 deg),
  // arms relaxed ~32 deg away from the torso with palms facing upward (+Z toward viewer / ceiling).
  const shY = hipY - torsoLen;
  lms[23] = pt(cx + lSign * hipHalfW, hipY, 0);
  lms[24] = pt(cx + rSign * hipHalfW, hipY, 0);
  lms[11] = pt(cx + lSign * shHalfW, shY, 0);
  lms[12] = pt(cx + rSign * shHalfW, shY, 0);
  setHeadFromShoulders(cx, shY, 0, -1, 0);

  // Arms angled ~32 deg away from sides, palms open facing viewer/ceiling
  const armSpreadRad = 0.56; // ~32 deg
  const elXOff = shHalfW + Math.sin(armSpreadRad) * upperArmLen;
  const elYPos = shY + Math.cos(armSpreadRad) * upperArmLen;
  const wrXOff = elXOff + Math.sin(armSpreadRad) * foreArmLen;
  const wrYPos = elYPos + Math.cos(armSpreadRad) * foreArmLen;

  lms[13] = pt(cx + lSign * elXOff, elYPos, 0);
  lms[14] = pt(cx + rSign * elXOff, elYPos, 0);
  lms[15] = pt(cx + lSign * wrXOff, wrYPos, -0.02);
  lms[16] = pt(cx + rSign * wrXOff, wrYPos, -0.02);

  // Index on outer side, pinky on inner side so palm normal faces forward/upward (+Z)
  lms[19] = pt(cx + lSign * (wrXOff + 0.022), wrYPos + 0.028, -0.03);
  lms[17] = pt(cx + lSign * (wrXOff + 0.004), wrYPos + 0.032, -0.02);
  lms[21] = pt(cx + lSign * (wrXOff + 0.028), wrYPos + 0.014, -0.03);
  lms[20] = pt(cx + rSign * (wrXOff + 0.022), wrYPos + 0.028, -0.03);
  lms[18] = pt(cx + rSign * (wrXOff + 0.004), wrYPos + 0.032, -0.02);
  lms[22] = pt(cx + rSign * (wrXOff + 0.028), wrYPos + 0.014, -0.03);

  // Legs extended and slightly apart
  const legSpread = 0.035;
  lms[25] = pt(cx + lSign * (hipHalfW + legSpread * 0.5), hipY + thighLen, 0);
  lms[26] = pt(cx + rSign * (hipHalfW + legSpread * 0.5), hipY + thighLen, 0);
  lms[27] = pt(cx + lSign * (hipHalfW + legSpread), hipY + thighLen + shinLen, 0);
  lms[28] = pt(cx + rSign * (hipHalfW + legSpread), hipY + thighLen + shinLen, 0);
  setFeetFromAnkles();
  return lms;
}
