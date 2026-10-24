@echo off
chcp 65001 > nul
title Antigravity Remoto - Servidor Ponte

echo ========================================================
echo       🚀 INICIANDO ANTIGRAVITY REMOTO (PC BRIDGE)       
echo ========================================================
echo.

:: Verificar se python está instalado
where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERRO] Python não foi encontrado no PATH!
    echo Por favor, instale o Python 3.10+ para continuar.
    pause
    exit /b 1
)

:: Mudar para a pasta do projeto
cd /d "%~dp0"

:: Iniciar o servidor FastAPI com Uvicorn
echo [1/2] Iniciando API e Gerenciador de Túnel Cloudflare...
python -m uvicorn server.main:app --host 0.0.0.0 --port 8765

pause
