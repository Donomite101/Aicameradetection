@echo off
echo Stopping Nginx...
cd /d "%~dp0nginx\nginx-1.26.2"
nginx.exe -s stop
taskkill /f /im nginx.exe >nul 2>&1
echo [OK] Nginx stopped.
timeout /t 3
