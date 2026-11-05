"""
YogaTwin-AI Isolated DL Pose Estimation Service Runner.

Launches the pre-trained Deep Learning pose inference service (task3_video_only.keras)
on dedicated port 5005, keeping it strictly isolated from the Data Collection server (port 5001),
the Node.js backend (port 3001), and the correction engine (port 3002).
"""

import os
import sys
import subprocess

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DL_PYTHON = os.environ.get("DL_PYTHON", r"D:\CMRG\DL\DL\venv\Scripts\python.exe")
DL_SCRIPT = os.path.join(BASE_DIR, "dl_pose_service.py")
DL_PORT = os.environ.get("DL_PORT", "5005")

def main():
    print("=" * 65)
    print("YogaTwin-AI -- DL Pose Estimation Service Runner")
    print("=" * 65)
    print(f"Base Directory   : {BASE_DIR}")
    print(f"Python Executable: {DL_PYTHON}")
    print(f"Inference Script : {DL_SCRIPT}")
    print(f"Target Port      : {DL_PORT}")
    print("=" * 65)

    if not os.path.exists(DL_PYTHON):
        print(f"ERROR: DL Python virtualenv not found at: {DL_PYTHON}", file=sys.stderr)
        sys.exit(1)

    if not os.path.exists(DL_SCRIPT):
        print(f"ERROR: DL Inference script not found at: {DL_SCRIPT}", file=sys.stderr)
        sys.exit(1)

    env = os.environ.copy()
    env["DL_PORT"] = str(DL_PORT)

    cmd = [DL_PYTHON, DL_SCRIPT]
    print(f"Starting DL Pose Estimation API on http://127.0.0.1:{DL_PORT}...")
    try:
        proc = subprocess.run(cmd, cwd=BASE_DIR, env=env)
        sys.exit(proc.returncode)
    except KeyboardInterrupt:
        print("\nDL Pose Estimation Service stopped by user.")

if __name__ == "__main__":
    main()
