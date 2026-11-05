"""
YogaTwin-AI Isolated ML Pose Classification Service Runner.

Launches the multi-level LightGBM pose classification service (Levels 6, 20, 82)
on dedicated port 5006, keeping it strictly isolated from the DL service (port 5005),
the Data Collection server (port 5001), the Node.js backend (port 3001),
and the correction engine (port 3000/3002).
"""

import os
import sys
import subprocess

ML_PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
ML_SERVICE_DIR = os.path.join(ML_PROJECT_ROOT, "ml-service")

# Prefer ml-service venv, fall back to repo venv or DL venv or system python
CANDIDATE_PYTHONS = [
    os.path.join(ML_SERVICE_DIR, "venv", "Scripts", "python.exe"),
    os.path.join(r"D:\CMRG\yoga-pose-classification-main ML\yoga-pose-classification-main", "venv", "Scripts", "python.exe"),
    sys.executable,
]

ML_SCRIPT = os.path.join(ML_SERVICE_DIR, "pose_classifier_service.py")
ML_PORT = os.environ.get("ML_PORT", "5006")


def find_python():
    for p in CANDIDATE_PYTHONS:
        if p and os.path.exists(p):
            return p
    return "python"


def main():
    py_exec = find_python()
    print("=" * 65)
    print("YogaTwin-AI -- ML Pose Classification Service Runner")
    print("=" * 65)
    print(f"ML Service Dir   : {ML_SERVICE_DIR}")
    print(f"Python Executable: {py_exec}")
    print(f"Inference Script : {ML_SCRIPT}")
    print(f"Target Port      : {ML_PORT}")
    print("=" * 65)

    if not os.path.exists(ML_SCRIPT):
        print(f"ERROR: ML Inference script not found at: {ML_SCRIPT}", file=sys.stderr)
        sys.exit(1)

    env = os.environ.copy()
    env["ML_PORT"] = str(ML_PORT)

    cmd = [py_exec, ML_SCRIPT]
    print(f"Starting ML Pose Classification API on http://127.0.0.1:{ML_PORT}...")
    try:
        proc = subprocess.run(cmd, cwd=ML_SERVICE_DIR, env=env)
        sys.exit(proc.returncode)
    except KeyboardInterrupt:
        print("\nML Pose Classification Service stopped by user.")


if __name__ == "__main__":
    main()
