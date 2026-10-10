@echo off
echo Starting Nginx reverse proxy on http://localhost:8080 ...
cd /d "%~dp0nginx\nginx-1.26.2"
start nginx.exe
echo [OK] Nginx is running!
echo Access the full application at: http://localhost:8080
timeout /t 3
