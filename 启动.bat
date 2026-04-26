@echo off
chcp 65001 >nul
title Inventory System

echo.
echo ============================================
echo      Personal Inventory System Launcher
echo ============================================
echo.

echo [INFO] Starting server...
start "" "http://localhost:8888"
python start_server.py
pause
