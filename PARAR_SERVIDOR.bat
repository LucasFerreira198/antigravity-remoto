@echo off
chcp 65001 >nul
title Antigravity Remote Bridge - Parar Servidor
echo ========================================================
echo   Antigravity Remoto - Parar Servidor
echo ========================================================
echo.
python "%~dp0server\service_manager.py" stop
echo.
pause
