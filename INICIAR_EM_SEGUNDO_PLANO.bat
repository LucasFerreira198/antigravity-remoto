@echo off
chcp 65001 >nul
title Antigravity Remote Bridge - Inicialização
echo ========================================================
echo   Antigravity Remoto - Inicializador em Segundo Plano
echo ========================================================
echo.
python "%~dp0server\service_manager.py" install
echo.
pause
