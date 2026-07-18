@echo off
title Handcrafted Bakes Server
echo ===================================================
echo             HANDCRAFTED BAKES SERVER
echo ===================================================
echo.
echo Starting backend server using MySQL Shell Python...
echo.

:: Move to backend directory relative to this script
cd /d "%~dp0\backend"

:: Run Flask app.py using verified Python executable
"C:\Program Files\MySQL\MySQL Shell 8.0\lib\Python3.13\Lib\venv\scripts\nt\python.exe" app.py

if %ERRORLEVEL% neq 0 (
    echo.
    echo Server stopped with error code %ERRORLEVEL%
)
pause
