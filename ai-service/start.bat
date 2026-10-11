@echo off
echo ========================================================
echo   SIH AI Detection Service Startup
echo ========================================================
echo.

REM Check if VIDEO_SOURCE is set in environment
if "%VIDEO_SOURCE%"=="" (
  echo [INFO] VIDEO_SOURCE not set.
  echo.
  echo Options:
  echo   1. Use your laptop webcam: set VIDEO_SOURCE=0
  echo   2. Use a video file:       set VIDEO_SOURCE=path\to\video.mp4
  echo   3. Use RTSP camera:        set VIDEO_SOURCE=rtsp://user:pass@ip/stream
  echo.
  set /p VIDEO_SOURCE="Enter video source (press Enter for webcam=0): "
  if "%VIDEO_SOURCE%"=="" set VIDEO_SOURCE=0
)

REM Check if CENTRE_ID is set
if "%CENTRE_ID%"=="" (
  echo [INFO] CENTRE_ID not set - will auto-detect from backend
)

REM Check if AUTH_TOKEN is set
if "%AUTH_TOKEN%"=="" (
  echo [INFO] AUTH_TOKEN not set - service will run unauthenticated
  echo [TIP]  Login to https://sterility-upheld-attic.ngrok-free.dev and copy your JWT token
)

echo.
echo [INFO] Starting AI Detection Service...
echo [INFO] Video Source: %VIDEO_SOURCE%
echo [INFO] Backend: http://localhost:3000/api/v1
echo [INFO] Stream will be available at: http://localhost:8000/video_feed
echo.

cd /d %~dp0
python detector.py

pause
