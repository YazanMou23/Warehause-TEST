# Build Native 1-Click Windows Installer for LogiFlow Connector
$ErrorActionPreference = "Stop"

$baseDir = "c:\Users\yazan\OneDrive\Desktop\dev app\warehause management"
$connectorDir = "$baseDir\windows-connector"
$outputDir = "$baseDir\public\installers"
$targetExe = "$outputDir\LogiFlow-Connector-Setup.exe"

if (!(Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

# 1. Create a temporary zip payload of the connector
$tempZip = "$env:TEMP\logiflow_connector_payload.zip"
if (Test-Path $tempZip) { Remove-Item $tempZip -Force }

Write-Host "Packaging connector files..."
Compress-Archive -Path "$connectorDir\*" -DestinationPath $tempZip -Force

# 2. Generate C# 5 Compatible Self-Installing Executable Code
$csharpCode = @"
using System;
using System.IO;
using System.IO.Compression;
using System.Diagnostics;
using System.Windows.Forms;
using System.Threading;
using System.Net;
using Microsoft.Win32;
using System.Reflection;

namespace LogiFlowConnectorInstaller
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            try
            {
                string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string targetDir = Path.Combine(localAppData, "LogiFlowPrinterConnector");
                
                if (!Directory.Exists(targetDir))
                {
                    Directory.CreateDirectory(targetDir);
                }

                // Extract embedded binary resource
                Assembly currentAssembly = Assembly.GetExecutingAssembly();
                using (Stream stream = currentAssembly.GetManifestResourceStream("LogiFlowPayload"))
                {
                    if (stream == null)
                    {
                        throw new Exception("Embedded resource LogiFlowPayload not found.");
                    }

                    using (ZipArchive archive = new ZipArchive(stream, ZipArchiveMode.Read))
                    {
                        foreach (ZipArchiveEntry entry in archive.Entries)
                        {
                            if (string.IsNullOrEmpty(entry.Name)) continue;
                            string destinationPath = Path.Combine(targetDir, entry.FullName);
                            string dir = Path.GetDirectoryName(destinationPath);
                            if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
                            entry.ExtractToFile(destinationPath, true);
                        }
                    }
                }

                // Register Startup Shortcut
                try
                {
                    string vbsPath = Path.Combine(targetDir, "start-silent.vbs");
                    using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true))
                    {
                        if (key != null)
                        {
                            key.SetValue("LogiFlowPrinterConnector", "wscript.exe \"" + vbsPath + "\"");
                        }
                    }
                }
                catch {}

                // Kill existing node instances running the connector
                try
                {
                    ProcessStartInfo psiKill = new ProcessStartInfo();
                    psiKill.FileName = "powershell.exe";
                    psiKill.Arguments = "-NoProfile -ExecutionPolicy Bypass -Command \"Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*LogiFlowPrinterConnector*' -or $_.CommandLine -like '*windows-connector*' } | Stop-Process -Force -ErrorAction SilentlyContinue\"";
                    psiKill.WindowStyle = ProcessWindowStyle.Hidden;
                    psiKill.CreateNoWindow = true;
                    Process pKill = Process.Start(psiKill);
                    if (pKill != null) pKill.WaitForExit(3000);
                }
                catch {}

                // Start the connector in the background
                string vbsStart = Path.Combine(targetDir, "start-silent.vbs");
                if (File.Exists(vbsStart))
                {
                    ProcessStartInfo psi = new ProcessStartInfo();
                    psi.FileName = "wscript.exe";
                    psi.Arguments = "\"" + vbsStart + "\"";
                    psi.WorkingDirectory = targetDir;
                    psi.WindowStyle = ProcessWindowStyle.Hidden;
                    Process.Start(psi);
                }

                // Verify health check on port 48281
                bool isRunning = false;
                for (int i = 0; i < 6; i++)
                {
                    Thread.Sleep(700);
                    try
                    {
                        HttpWebRequest req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:48281/health");
                        req.Timeout = 1500;
                        using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                        {
                            if (resp.StatusCode == HttpStatusCode.OK)
                            {
                                isRunning = true;
                                break;
                            }
                        }
                    }
                    catch {}
                }

                if (isRunning)
                {
                    MessageBox.Show(
                        "Der LogiFlow Printer & Scanner Connector wurde erfolgreich installiert und im Hintergrund gestartet!\n\nSie können jetzt in der Web-App Dokumente direkt von Ihrem Drucker scannen.",
                        "LogiFlow Connector Bereit",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information
                    );
                }
                else
                {
                    MessageBox.Show(
                        "Der LogiFlow Connector wurde installiert und als Autostart registriert.\n\nFalls der Scanner noch nicht erkannt wird, öffnen Sie bitte die Web-App erneut.",
                        "LogiFlow Connector Installiert",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information
                    );
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Installation fehlgeschlagen: " + ex.Message,
                    "LogiFlow Setup Fehler",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }
    }
}
"@

$tempCsPath = "$env:TEMP\LogiFlowInstaller.cs"
[System.IO.File]::WriteAllText($tempCsPath, $csharpCode, [System.Text.Encoding]::UTF8)

# 3. Compile with C# compiler (csc.exe)
$cscPath = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
Write-Host "Compiling native standalone executable with csc.exe..."

$compileArgs = "/target:winexe /out:`"$targetExe`" /optimize+ /reference:System.dll /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll /reference:System.Core.dll /resource:`"$tempZip`",LogiFlowPayload `"$tempCsPath`""

$process = Start-Process -FilePath $cscPath -ArgumentList $compileArgs -Wait -PassThru -NoNewWindow

Remove-Item $tempCsPath -Force -ErrorAction SilentlyContinue
Remove-Item $tempZip -Force -ErrorAction SilentlyContinue

if (Test-Path $targetExe) {
    $sizeMb = [Math]::Round(((Get-Item $targetExe).Length / 1MB), 2)
    Write-Host "SUCCESS: Generated standalone installer at $targetExe ($sizeMb MB)"
} else {
    Write-Error "Compilation failed with exit code $($process.ExitCode)!"
}
