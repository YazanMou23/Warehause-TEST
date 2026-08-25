@echo off
setlocal EnableDelayedExpansion

title LogiFlow Printer Connector — Installation

echo =======================================================
echo    LogiFlow Windows Printer ^& Scanner Connector
echo    Automatische 1-Klick Installation
echo =======================================================
echo.

set "TARGET_DIR=%LOCALAPPDATA%\LogiFlowPrinterConnector"
set "SOURCE_DIR=%~dp0"

echo 1. Vorbereitung des Installationsordners...
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"

echo 2. Runtime pruefen...
where node >nul 2>nul
if %errorlevel% neq 0 (
    if not exist "%TARGET_DIR%\node.exe" (
        echo    Lade Connector-Runtime herunter (einmalig, automatisch)...
        powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('https://nodejs.org/dist/v20.18.0/win-x64/node.exe', [System.IO.Path]::Combine($env:LOCALAPPDATA, 'LogiFlowPrinterConnector', 'node.exe'))"
    )
)

echo 3. Dateien kopieren nach: %TARGET_DIR%
copy /Y "%SOURCE_DIR%index.js" "%TARGET_DIR%\" >nul
copy /Y "%SOURCE_DIR%start-silent.vbs" "%TARGET_DIR%\" >nul
copy /Y "%SOURCE_DIR%package.json" "%TARGET_DIR%\" >nul
copy /Y "%SOURCE_DIR%uninstall.bat" "%TARGET_DIR%\" >nul
if exist "%SOURCE_DIR%node.exe" copy /Y "%SOURCE_DIR%node.exe" "%TARGET_DIR%\" >nul

echo 4. Autostart bei Windows-Anmeldung registrieren...
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

echo 4. Bestehende Instanzen beenden und Connector im Hintergrund starten...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*LogiFlowPrinterConnector*' -or $_.CommandLine -like '*windows-connector*' } | Stop-Process -Force -ErrorAction SilentlyContinue"

start "" wscript.exe "%TARGET_DIR%\start-silent.vbs"

echo.
echo =======================================================
echo    Installation erfolgreich abgeschlossen!
echo.
echo    Der LogiFlow Printer Connector laeuft ab sofort
echo    automatisch im Hintergrund (keine Konfiguration noetig).
echo.
echo    Sie koennen nun im Web-Browser auf [ Vom Drucker scannen ]
echo    klicken.
echo =======================================================
echo.

powershell -NoProfile -Command "[System.Windows.Forms.MessageBox]::Show('Der LogiFlow Printer Connector wurde erfolgreich installiert und im Hintergrund gestartet!`n`nSie koennen jetzt in der Web-App Dokumente direkt von Ihrem Drucker scannen.', 'LogiFlow Connector Bereit', [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information)" 2>nul

exit /b 0
