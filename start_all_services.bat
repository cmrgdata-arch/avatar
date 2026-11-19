@echo off
title YogaTwin-AI All Services Launcher
echo ======================================================================
echo             YogaTwin-AI: Unified Multi-Service Launcher
echo ======================================================================
echo.

set ROOT=%~dp0
if "%ROOT:~-1%"=="\" set ROOT=%ROOT:~0,-1%

echo [1/6] Launching DL Pose-Estimation Service (Port 5005)...
start "1. DL Pose Estimation Service (Port 5005)" cmd /k "cd /d "%ROOT%" && start_dl_service.bat"
timeout /t 1 /nobreak >nul

echo [2/6] Launching ML Pose-Estimation Service (Port 5006)...
start "2. ML LightGBM Pose Service (Port 5006)" cmd /k "cd /d "%ROOT%" && start_ml_service.bat"
timeout /t 1 /nobreak >nul

echo [3/6] Launching Main Backend Server (Port 3001)...
start "3. Main Backend (Port 3001)" cmd /k "cd /d "%ROOT%\server" && node index.js"
timeout /t 1 /nobreak >nul

echo [4/6] Launching ML Corrective Feedback Engine (Port 3000)...
start "4. Corrective Feedback Engine (Port 3000)" cmd /k "cd /d "%ROOT%\correction-engine" && set PORT=3000&& node server.js"
timeout /t 1 /nobreak >nul

echo [5/6] Launching Python Backend (Port 5000)...
start "5. Python Backend (Port 5000)" cmd /k "cd /d "%ROOT%\backend" && python server.py"
timeout /t 1 /nobreak >nul

echo [6/6] Launching Frontend Web App (Port 5173)...
start "6. Frontend Web App (Port 5173)" cmd /k "cd /d "%ROOT%\app1" && npm.cmd run dev"

echo.
echo ======================================================================
echo All 6 YogaTwin-AI services have been launched in dedicated windows:
echo.
echo   [1] DL Pose API               : http://127.0.0.1:5005
echo   [2] ML LightGBM API           : http://127.0.0.1:5006
echo   [3] Main Backend API          : http://localhost:3001
echo   [4] Corrective Engine         : http://localhost:3000
echo   [5] Python Backend            : http://localhost:5000
echo   [6] Frontend Web Interface    : http://localhost:5173
echo ======================================================================
echo You may minimize this launcher window.
pause
