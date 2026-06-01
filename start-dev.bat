@echo off
title Nami - VET Development Launcher
echo =================================================══
echo   NAMI - VET: AI Video Editor Launcher
echo   Vite React Web App + FastAPI Python Backend
echo =================================================══
echo.

:: Check for node_modules in app/
if not exist "app\node_modules\" (
    echo [!] app/node_modules not found. Installing frontend dependencies...
    cd /d app && npm install && cd /d ..
)

:: 1. Launch Backend
echo [1/2] Starting Python FastAPI Backend on port 8000...
start "NAMI - VET Backend" cmd /k "cd /d backend && python main.py"

:: 2. Launch Frontend
echo [2/2] Starting Vite Frontend...
cd /d app
npm run dev

pause
