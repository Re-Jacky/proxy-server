@echo off

REM Proxy Server Startup Script for Windows
REM This script checks for Node.js, installs dependencies, and starts the proxy server

echo ===============================
echo Proxy Server Startup Script
echo ===============================

REM Check if Node.js is installed
node -v > nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed or not in PATH
    echo Please download and install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js detected successfully

REM Check if npm is available
npm -v > nul 2>&1
if %errorlevel% neq 0 (
    echo Error: npm is not available
    echo Please ensure Node.js is installed correctly
    pause
    exit /b 1
)

echo npm detected successfully

REM Install dependencies if package.json exists
if exist package.json (
    echo Installing dependencies...
    npm install
    if %errorlevel% neq 0 (
        echo Error: Failed to install dependencies
        pause
        exit /b 1
    )
    echo Dependencies installed successfully
)

REM Check if proxy.js exists
if not exist proxy.js (
    echo Error: proxy.js not found
    echo Please ensure you're in the correct directory
    pause
    exit /b 1
)

REM Start the proxy server
echo Starting proxy server...
echo ===============================
echo Press Ctrl+C to stop the server
echo ===============================

node proxy.js

pause