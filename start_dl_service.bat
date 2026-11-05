@echo off
title YogaTwin-AI DL Pose Estimation Service (Port 5005)
echo ===============================================================
echo Starting Isolated DL Pose Estimation Service on Port 5005
echo ===============================================================
set DL_PORT=5005
"D:\CMRG\DL\DL\venv\Scripts\python.exe" "%~dp0dl_pose_service.py"
pause
