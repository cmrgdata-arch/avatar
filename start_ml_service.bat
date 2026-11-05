@echo off
title YogaTwin-AI ML Pose Classification Service (Port 5006)
echo ===============================================================
echo Starting Isolated ML Pose Classification Service on Port 5006
echo ===============================================================
set ML_PORT=5006
if exist "%~dp0ml-service\venv\Scripts\python.exe" (
    "%~dp0ml-service\venv\Scripts\python.exe" "%~dp0ml-service\pose_classifier_service.py"
) else (
    "D:\CMRG\yoga-pose-classification-main ML\yoga-pose-classification-main\venv\Scripts\python.exe" "%~dp0ml-service\pose_classifier_service.py"
)
pause
