"""
Yoga-82 59-Feature Extractor
Converts 33 MediaPipe pose landmarks into the exact 59-float feature vector
expected by the trained LightGBM classifiers.

Vector composition (59 floats):
- 39 Torso-normalised joint coordinates (13 joints × [x_norm, y_norm, z])
- 7 Anatomical joint angles in radians (6 limb triplets + 1 spine angle)
- 13 Torso-normalised pairwise distances (12 joint pairs + 1 head-to-hip distance)
"""

import numpy as np

# 15 Key body joints used by the ML model
JOINT_INDICES = [0, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]

# 13 Coordinate joints (excluding ear points 7 and 8)
COORD_JOINT_INDICES = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]

# 6 Angle triplets (a, b, c) -> angle at vertex b
ANGLE_TRIPLETS = [
    (11, 13, 15),  # Left elbow
    (12, 14, 16),  # Right elbow
    (23, 25, 27),  # Left knee
    (24, 26, 28),  # Right knee
    (11, 23, 25),  # Left hip
    (12, 24, 26),  # Right hip
]

# 12 Pairwise distance pairs
DISTANCE_PAIRS = [
    (11, 12),  # Shoulder width
    (23, 24),  # Hip width
    (11, 13),  # Left upper arm
    (12, 14),  # Right upper arm
    (13, 15),  # Left forearm
    (14, 16),  # Right forearm
    (23, 25),  # Left thigh
    (24, 26),  # Right thigh
    (25, 27),  # Left shin
    (26, 28),  # Right shin
    (15, 16),  # Wrist distance
    (27, 28),  # Ankle distance
]


def cosine_angle(a, b, c):
    """Calculate the inner 3D angle at vertex b between vectors ba and bc."""
    ba = a - b
    bc = c - b
    norm_ba = np.linalg.norm(ba)
    norm_bc = np.linalg.norm(bc)
    if norm_ba < 1e-8 or norm_bc < 1e-8:
        return 0.0
    cos_a = np.dot(ba, bc) / (norm_ba * norm_bc)
    return float(np.arccos(np.clip(cos_a, -1.0, 1.0)))


def extract_features_from_mediapipe(pose_landmarks):
    """
    Extract 59-feature vector from a MediaPipe NormalizedLandmarkList.
    Returns np.ndarray of shape (1, 59) or None if degenerate / missing.
    """
    if pose_landmarks is None or not hasattr(pose_landmarks, "landmark"):
        return None

    landmarks = pose_landmarks.landmark
    if len(landmarks) < 29:
        return None

    # Check key visibility (shoulders and hips must have reasonable visibility)
    for idx in [11, 12, 23, 24]:
        if landmarks[idx].visibility < 0.35:
            return None

    joints = {}
    for idx in JOINT_INDICES:
        lm = landmarks[idx]
        joints[idx] = np.array([lm.x, lm.y, lm.z], dtype=np.float64)

    return _compute_59_features(joints)


def extract_features_from_dict_list(landmarks_list):
    """
    Extract 59-feature vector from a list of dicts [{'x': ..., 'y': ..., 'z': ..., 'visibility': ...}, ...]
    Returns np.ndarray of shape (1, 59) or None if invalid.
    """
    if not landmarks_list or len(landmarks_list) < 29:
        return None

    joints = {}
    for idx in JOINT_INDICES:
        lm = landmarks_list[idx]
        if isinstance(lm, dict):
            joints[idx] = np.array([lm.get("x", 0.0), lm.get("y", 0.0), lm.get("z", 0.0)], dtype=np.float64)
        elif hasattr(lm, "x"):
            joints[idx] = np.array([lm.x, lm.y, lm.z], dtype=np.float64)
        elif isinstance(lm, (list, tuple)) and len(lm) >= 3:
            joints[idx] = np.array([lm[0], lm[1], lm[2]], dtype=np.float64)
        else:
            return None

    return _compute_59_features(joints)


def _compute_59_features(joints):
    """Internal computation from dictionary of 15 joint vectors."""
    shoulder_mid = (joints[11] + joints[12]) / 2.0
    hip_mid = (joints[23] + joints[24]) / 2.0
    torso_scale = float(np.linalg.norm(shoulder_mid - hip_mid))

    # Reject degenerate postures (torso too small or compressed)
    if torso_scale < 1e-4:
        return None

    # 1. Torso-normalised coordinates (13 joints × 3 = 39 features)
    coords = []
    for jidx in COORD_JOINT_INDICES:
        xyz = joints[jidx]
        coords.extend([
            (xyz[0] - shoulder_mid[0]) / torso_scale,
            (xyz[1] - shoulder_mid[1]) / torso_scale,
            xyz[2],
        ])

    # 2. Joint angles (7 features)
    angles = []
    for a_idx, b_idx, c_idx in ANGLE_TRIPLETS:
        angles.append(cosine_angle(joints[a_idx], joints[b_idx], joints[c_idx]))
    # Spine inclination: shoulder_mid -> hip_mid -> nose(0)
    angles.append(cosine_angle(shoulder_mid, hip_mid, joints[0]))

    # 3. Pairwise distances (13 features)
    distances = []
    for a_idx, b_idx in DISTANCE_PAIRS:
        dist = float(np.linalg.norm(joints[a_idx] - joints[b_idx]) / torso_scale)
        distances.append(dist)
    # Distance: nose to hip_mid
    distances.append(float(np.linalg.norm(joints[0] - hip_mid) / torso_scale))

    feature_vec = coords + angles + distances
    if len(feature_vec) != 59:
        return None

    arr = np.array(feature_vec, dtype=np.float32).reshape(1, -1)
    return np.nan_to_num(arr, nan=0.0, posinf=0.0, neginf=0.0)
