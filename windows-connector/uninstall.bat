@echo off
setlocal EnableDelayedExpansion

title LogiFlow Printer Connector — Deinstallation

echo =======================================================
echo    LogiFlow Windows Printer & Scanner Connector
echo    Deinstallation
echo =======================================================
echo.

set "TARGET_DIR=%LOCALAPPDATA%\LogiFlowPrinterConnector"

echo 1. Laufende Connector-Prozesse beenden...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*LogiFlowPrinterConnector*' } | Stop-Process -Force -ErrorAction SilentlyContinue"

echo 2. Autostart-Eintraege entfernen...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$shortcutPath = [System.IO.Path]::Combine([Environment]::GetFolderPath('Startup'), 'LogiFlowPrinterConnector.lnk'); " ^
  "if (Test-Path $shortcutPath) { Remove-Item $shortcutPath -Force }; " ^
  "Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'LogiFlowPrinterConnector' -ErrorAction SilentlyContinue;"

echo 3. Programmdateien entfernen...
if exist "%TARGET_DIR%" (
  rd /s /q "%TARGET_DIR%"
)

echo.
echo =======================================================
echo    Deinstallation abgeschlossen.
echo =======================================================
echo.

powershell -NoProfile -Command "[System.Windows.Forms.MessageBox]::Show('Der LogiFlow Printer Connector wurde vollstaendig entfernt.', 'LogiFlow Deinstallation', [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information)" 2>nul

exit /b 0
