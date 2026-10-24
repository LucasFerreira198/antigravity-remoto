@echo off
setlocal enabledelayedexpansion
title Antigravity Remoto - Servidor Ponte

REM Mudar para a pasta do script
cd /d "%~dp0"

REM Localizar executavel do Python
set "PYTHON_EXE="

where python >nul 2>&1
if !errorlevel! equ 0 (
    set "PYTHON_EXE=python"
) else (
    where py >nul 2>&1
    if !errorlevel! equ 0 (
        set "PYTHON_EXE=py"
    ) else if exist "%LOCALAPPDATA%\Programs\Python\Python314\python.exe" (
        set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python314\python.exe"
    ) else if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" (
        set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
    ) else if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
        set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    ) else if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
        set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
    ) else if exist "%LOCALAPPDATA%\Programs\Python\Python310\python.exe" (
        set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python310\python.exe"
    )
)

if "%PYTHON_EXE%"=="" (
    echo ========================================================
    echo [ERRO] Python nao foi encontrado no sistema!
    echo Por favor, instale o Python 3.10 ou superior.
    echo ========================================================
    pause
    exit /b 1
)

echo ========================================================
echo        INICIANDO ANTIGRAVITY REMOTO (PC BRIDGE)
echo ========================================================
echo [OK] Python localizado: %PYTHON_EXE%
echo [1/2] Iniciando API e Gerenciador de Tunel Cloudflare...
echo.

"%PYTHON_EXE%" -m uvicorn server.main:app --host 0.0.0.0 --port 8765

if !errorlevel! neq 0 (
    echo.
    echo [AVISO] O servidor foi encerrado com codigo !errorlevel!.
    pause
)
