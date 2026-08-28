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
echo [3/5] Dateien installieren nach %TARGET_DIR%...
if not exist "%SOURCE_DIR%index.js" if not exist "%SOURCE_DIR%dist\index.js" (
    echo.
    echo [FEHLER] Quelldateien nicht gefunden.
    echo Bitte entpacken Sie das ZIP-Archiv zuerst vollstaendig!
    echo.
    pause
    exit /b 1
)

if exist "%SOURCE_DIR%index.js" copy /Y "%SOURCE_DIR%index.js" "%TARGET_DIR%\" >nul
if exist "%SOURCE_DIR%dist\index.js" if not exist "%TARGET_DIR%\index.js" copy /Y "%SOURCE_DIR%dist\index.js" "%TARGET_DIR%\" >nul
if exist "%SOURCE_DIR%dist\ScannerBridge.exe" copy /Y "%SOURCE_DIR%dist\ScannerBridge.exe" "%TARGET_DIR%\" >nul
if exist "%SOURCE_DIR%src\native\ScannerBridge.exe" copy /Y "%SOURCE_DIR%src\native\ScannerBridge.exe" "%TARGET_DIR%\" >nul
copy /Y "%SOURCE_DIR%start-silent.vbs" "%TARGET_DIR%\" >nul
copy /Y "%SOURCE_DIR%uninstall.bat" "%TARGET_DIR%\" >nul
if exist "%SOURCE_DIR%show_success_dialog.ps1" copy /Y "%SOURCE_DIR%show_success_dialog.ps1" "%TARGET_DIR%\" >nul
if exist "%SOURCE_DIR%run-debug.bat" copy /Y "%SOURCE_DIR%run-debug.bat" "%TARGET_DIR%\" >nul

echo [4/5] Windows-Integration und Autostart registrieren...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$regJson = @{ installed = $true; connectorId = 'logiflow-windows-connector'; version = '3.0.0'; port = 48281; installedAt = (Get-Date).ToString('o') } | ConvertTo-Json; " ^
  "Set-Content -Path (Join-Path $env:LOCALAPPDATA 'LogiFlowPrinterConnector\registration.json') -Value $regJson; " ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$s = $ws.CreateShortcut([System.IO.Path]::Combine([Environment]::GetFolderPath('Startup'), 'LogiFlowPrinterConnector.lnk')); " ^
  "$s.TargetPath = 'wscript.exe'; " ^
  "$s.Arguments = '\"' + [System.IO.Path]::Combine($env:LOCALAPPDATA, 'LogiFlowPrinterConnector', 'start-silent.vbs') + '\"'; " ^
  "$s.WorkingDirectory = [System.IO.Path]::Combine($env:LOCALAPPDATA, 'LogiFlowPrinterConnector'); " ^
  "$s.WindowStyle = 7; " ^
  "$s.Description = 'LogiFlow Windows Printer & Scanner Connector'; " ^
  "$s.Save(); " ^
  "Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'LogiFlowPrinterConnector' -Value ('wscript.exe \"' + [System.IO.Path]::Combine($env:LOCALAPPDATA, 'LogiFlowPrinterConnector', 'start-silent.vbs') + '\"'); " ^
  "New-Item -Path 'HKCU:\Software\Classes\logiflow-connector' -Force | Out-Null; " ^
  "Set-ItemProperty -Path 'HKCU:\Software\Classes\logiflow-connector' -Name '(default)' -Value 'URL:LogiFlow Connector Protocol'; " ^
  "Set-ItemProperty -Path 'HKCU:\Software\Classes\logiflow-connector' -Name 'URL Protocol' -Value ''; " ^
  "New-Item -Path 'HKCU:\Software\Classes\logiflow-connector\shell\open\command' -Force | Out-Null; " ^
  "Set-ItemProperty -Path 'HKCU:\Software\Classes\logiflow-connector\shell\open\command' -Name '(default)' -Value ('wscript.exe \"' + [System.IO.Path]::Combine($env:LOCALAPPDATA, 'LogiFlowPrinterConnector', 'start-silent.vbs') + '\" \"%1\"');"

echo [5/5] Connector starten und Verbindung pruefen...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*LogiFlowPrinterConnector*' -or $_.CommandLine -like '*windows-connector*' } | Stop-Process -Force -ErrorAction SilentlyContinue"

start "" wscript.exe "%TARGET_DIR%\start-silent.vbs"

echo.
echo    Connector wird gestartet. Warte auf Verbindung (max. 15 Sekunden)...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$maxRetries = 15; $delay = 1; $success = $false; " ^
  "for ($i = 0; $i -lt $maxRetries; $i++) { " ^
  "  try { " ^
  "    $res = Invoke-RestMethod -Uri 'http://127.0.0.1:48281/health' -Method Get -TimeoutSec 2 -ErrorAction Stop; " ^
  "    if ($res.status -eq 'ready' -or $res.status -eq 'ok') { $success = $true; break; } " ^
  "  } catch { } " ^
  "  Start-Sleep -Seconds $delay; " ^
  "} " ^
  "if (-not $success) { " ^
  "  Write-Host '[FEHLER] Der Connector antwortet nicht auf Port 48281. Moeglicherweise wird der Port blockiert.' -ForegroundColor Red; " ^
  "  exit 1; " ^
  "}"
if %errorlevel% neq 0 (
    echo.
    echo Installation unvollstaendig: Der Connector konnte nicht erreicht werden.
    pause
    exit /b 1
)

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
    powershell -NoProfile -Command "[System.Windows.Forms.MessageBox]::Show('Der LogiFlow Printer Connector v3.0 wurde erfolgreich installiert und im Hintergrund gestartet!`n`nSie koennen jetzt in der Web-App Dokumente direkt von Ihrem Drucker scannen.', 'LogiFlow Connector Bereit', [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information)" 2>nul
)

exit /b 0
