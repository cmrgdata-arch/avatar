# YogaTwin-AI Unified Services PowerShell Launcher
$root = $PSScriptRoot
if (-not $root) { $root = "D:\CMRG\YogaTwin-AI corrective feedback" }

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "            YogaTwin-AI: Unified Multi-Service Launcher" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/6] Launching DL Pose-Estimation Service (Port 5005)..." -ForegroundColor Yellow
Start-Process cmd -ArgumentList "/k cd /d `"$root`" && .\start_dl_service.bat" -WindowStyle Normal
Start-Sleep -Seconds 1

Write-Host "[2/6] Launching ML Pose-Estimation Service (Port 5006)..." -ForegroundColor Yellow
Start-Process cmd -ArgumentList "/k cd /d `"$root`" && .\start_ml_service.bat" -WindowStyle Normal
Start-Sleep -Seconds 1

Write-Host "[3/6] Launching Main Backend Server (Port 3001)..." -ForegroundColor Yellow
Start-Process cmd -ArgumentList "/k cd /d `"$root\server`" && node index.js" -WindowStyle Normal
Start-Sleep -Seconds 1

Write-Host "[4/6] Launching ML Corrective Feedback Engine in WSL..." -ForegroundColor Yellow
Start-Process cmd -ArgumentList "/k wsl --cd `"$root\correction-engine`" node server.js" -WindowStyle Normal
Start-Sleep -Seconds 1

Write-Host "[5/6] Launching Python Backend (Port 5000)..." -ForegroundColor Yellow
Start-Process cmd -ArgumentList "/k cd /d `"$root\backend`" && python server.py" -WindowStyle Normal
Start-Sleep -Seconds 1

Write-Host "[6/6] Launching Frontend Web App (Port 5173)..." -ForegroundColor Yellow
Start-Process cmd -ArgumentList "/k cd /d `"$root\app1`" && npm.cmd run dev" -WindowStyle Normal

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Green
Write-Host "All 6 YogaTwin-AI services have been launched in dedicated windows:" -ForegroundColor Green
Write-Host "  [1] DL Pose API            : http://127.0.0.1:5005" -ForegroundColor White
Write-Host "  [2] ML LightGBM API        : http://127.0.0.1:5006" -ForegroundColor White
Write-Host "  [3] Main Backend API       : http://localhost:3001" -ForegroundColor White
Write-Host "  [4] Correction Engine (WSL): http://localhost:3002 / 3000" -ForegroundColor White
Write-Host "  [5] Python Backend         : http://localhost:5000" -ForegroundColor White
Write-Host "  [6] Frontend Web App       : http://localhost:5173" -ForegroundColor White
Write-Host "======================================================================" -ForegroundColor Green
