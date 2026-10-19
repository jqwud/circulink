@echo off
rem Double-click to run Hiraman on an Android phone plugged in by USB.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\run-phone.ps1"
echo.
pause
