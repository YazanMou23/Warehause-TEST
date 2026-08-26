@echo off
title LogiFlow Connector — Test / Debug Mode
echo Starting LogiFlow Connector in Debug Mode...
echo --------------------------------------------------

set "TARGET_DIR=%LOCALAPPDATA%\LogiFlowPrinterConnector"

if exist "%TARGET_DIR%\node.exe" (
    "%TARGET_DIR%\node.exe" "%TARGET_DIR%\index.js"
) else (
    where node >nul 2>nul
    if %errorlevel% equ 0 (
        node "%TARGET_DIR%\index.js"
    ) else (
        echo [ERROR] Node.js or node.exe not found!
        echo Please run install.bat or install Node.js from https://nodejs.org
    )
)

pause
