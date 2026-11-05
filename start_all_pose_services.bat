@echo off
title YogaTwin-AI Pose Estimation Services Launcher (DL Port 5005 + ML Port 5006)
echo ======================================================================
echo           YogaTwin AI: Pose Estimation Engines Launcher
echo ======================================================================
echo.
echo Launching services:
echo   1. Deep Learning Pose Estimation API (Port 5005)
echo   2. Machine Learning Multi-Level LightGBM API (Port 5006)
echo.

REM Start DL Service in a separate terminal window
start "YogaTwin-AI DL Engine (Port 5005)" cmd /k "cd /d "%~dp0" && start_dl_service.bat"

REM Brief pause to stagger startup
timeout /t 2 /nobreak >nul

REM Start ML Service in a separate terminal window
start "YogaTwin-AI ML Engine (Port 5006)" cmd /k "cd /d "%~dp0" && start_ml_service.bat"

echo ======================================================================
echo Both Pose Estimation engines launched in dedicated windows!
echo   - DL API : http://127.0.0.1:5005
echo   - ML API : http://127.0.0.1:5006
echo ======================================================================
pause
