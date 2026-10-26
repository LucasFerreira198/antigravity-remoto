@echo off
chcp 65001 >nul
title Antigravity Remote Bridge - Status
python "%~dp0server\service_manager.py" status
echo.
pause
