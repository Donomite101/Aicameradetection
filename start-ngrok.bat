@echo off
echo ===================================================
echo             NGROK TUNNEL RUNNER
echo ===================================================
echo.
echo Choose which service you want to expose to the public internet:
echo [1] Backend API (Port 3000)
echo [2] Frontend Web App (Port 5173)
echo [3] Unified Nginx (Port 8080)
echo.
set /p choice="Enter option (1, 2, or 3, default=1): "

if "%choice%"=="2" (
    set PORT=5173
    echo Starting tunnel for Frontend on port 5173...
) else if "%choice%"=="3" (
    set PORT=8080
    echo Starting tunnel for Unified Nginx on port 8080...
) else (
    set PORT=3000
    echo Starting tunnel for Backend on port 3000...
)

echo.
echo If you haven't added your free ngrok authtoken yet, run:
echo   .\ngrok.exe config add-authtoken YOUR_AUTHTOKEN
echo.
"%~dp0ngrok.exe" http %PORT%
pause
