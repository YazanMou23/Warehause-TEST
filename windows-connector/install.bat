@echo off
title LogiFlow Printer Connector — Installation

echo =======================================================
echo    LogiFlow Windows Printer ^& Scanner Connector
echo    Automatische 1-Klick Installation
echo =======================================================
echo.

set "TARGET_DIR=%LOCALAPPDATA%\LogiFlowPrinterConnector"
set "SOURCE_DIR=%~dp0"

echo [1/4] Installationsordner vorbereiten...
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"

echo [2/4] Runtime pruefen und einrichten...
if exist "%SOURCE_DIR%node.exe" (
    echo    Kopiere mitgelieferte Runtime...
    copy /Y "%SOURCE_DIR%node.exe" "%TARGET_DIR%\node.exe" >nul
    goto :copy_files
)

if exist "%TARGET_DIR%\node.exe" goto :copy_files

where node >nul 2>nul
if %errorlevel% equ 0 goto :copy_files

echo    Lade portable Runtime herunter...
curl.exe -L --fail --silent --show-error -o "%TARGET_DIR%\node.exe" "https://nodejs.org/dist/v20.18.0/win-x64/node.exe"
if exist "%TARGET_DIR%\node.exe" goto :copy_files

powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('https://nodejs.org/dist/v20.18.0/win-x64/node.exe', [System.IO.Path]::Combine($env:LOCALAPPDATA, 'LogiFlowPrinterConnector', 'node.exe'))"

:copy_files
echo [3/4] Dateien installieren nach %TARGET_DIR%...
if not exist "%SOURCE_DIR%index.js" (
    echo.
    echo [FEHLER] Quelldateien nicht gefunden.
    echo Bitte entpacken Sie das ZIP-Archiv zuerst vollstaendig!
    echo.
    pause
    exit /b 1
)

copy /Y "%SOURCE_DIR%dist\index.js" "%TARGET_DIR%\" >nul
copy /Y "%SOURCE_DIR%dist\ScannerBridge.exe" "%TARGET_DIR%\" >nul
copy /Y "%SOURCE_DIR%start-silent.vbs" "%TARGET_DIR%\" >nul
copy /Y "%SOURCE_DIR%uninstall.bat" "%TARGET_DIR%\" >nul
if exist "%SOURCE_DIR%show_success_dialog.ps1" copy /Y "%SOURCE_DIR%show_success_dialog.ps1" "%TARGET_DIR%\" >nul
if exist "%SOURCE_DIR%run-debug.bat" copy /Y "%SOURCE_DIR%run-debug.bat" "%TARGET_DIR%\" >nul

echo [4/4] Autostart bei Windows-Anmeldung registrieren...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$s = $ws.CreateShortcut([System.IO.Path]::Combine([Environment]::GetFolderPath('Startup'), 'LogiFlowPrinterConnector.lnk')); " ^
  "$s.TargetPath = 'wscript.exe'; " ^
  "$s.Arguments = '\"' + [System.IO.Path]::Combine($env:LOCALAPPDATA, 'LogiFlowPrinterConnector', 'start-silent.vbs') + '\"'; " ^
  "$s.WorkingDirectory = [System.IO.Path]::Combine($env:LOCALAPPDATA, 'LogiFlowPrinterConnector'); " ^
  "$s.WindowStyle = 7; " ^
  "$s.Description = 'LogiFlow Windows Printer & Scanner Connector'; " ^
  "$s.Save(); " ^
  "Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'LogiFlowPrinterConnector' -Value ('wscript.exe \"' + [System.IO.Path]::Combine($env:LOCALAPPDATA, 'LogiFlowPrinterConnector', 'start-silent.vbs') + '\"');"

echo [5/5] Connector starten...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*LogiFlowPrinterConnector*' -or $_.CommandLine -like '*windows-connector*' } | Stop-Process -Force -ErrorAction SilentlyContinue"

start "" wscript.exe "%TARGET_DIR%\start-silent.vbs"

echo.
echo =======================================================
echo    Installation erfolgreich abgeschlossen!
echo.
echo    Der LogiFlow Printer Connector laeuft ab sofort
echo    automatisch im Hintergrund (Port 48281).
echo =======================================================
echo.

if exist "%TARGET_DIR%\show_success_dialog.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%TARGET_DIR%\show_success_dialog.ps1"
) else (
    powershell -NoProfile -Command "[System.Windows.Forms.MessageBox]::Show('Der LogiFlow Printer Connector wurde erfolgreich installiert und im Hintergrund gestartet!`n`nSie koennen jetzt in der Web-App Dokumente direkt von Ihrem Drucker scannen.', 'LogiFlow Connector Bereit', [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information)" 2>nul
)

exit /b 0
