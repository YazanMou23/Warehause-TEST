import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { IScannerBackend } from '../core/backend.interface';
import { Device, ScanJobOptions, ScannerCapabilities, ScanPage } from '../core/models';

export class WiaBackend implements IScannerBackend {
  readonly name = 'WIA';
  private bridgeExe = path.join(__dirname, 'ScannerBridge.exe');

  async isAvailable(device: Device): Promise<boolean> {
    return device.protocol === 'WIA';
  }

  async getCapabilities(device: Device): Promise<ScannerCapabilities> {
    // WIA bridge handles basic capabilities during discovery, so we rely on the device info
    return {
      sources: {
        flatbed: device.sources?.flatbed ?? true,
        adf: device.sources?.adf ?? false,
        duplex: device.sources?.duplex ?? false,
      },
      resolutions: [150, 300, 600],
      colorModes: ['Color', 'Grayscale', 'BlackAndWhite'],
      documentFormats: ['image/jpeg'], // WIA bridge outputs JPG
    };
  }

  async startScan(
    device: Device,
    options: ScanJobOptions,
    onProgress?: (message: string, pageCount: number) => void,
    cancellationToken?: { isCancelled: boolean }
  ): Promise<ScanPage[]> {
    return new Promise((resolve, reject) => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logiflow-scan-'));
      
      const args = [
        'scan',
        device.id,
        options.source || 'auto',
        (options.dpi || 300).toString(),
        options.colorMode || 'Grayscale',
        tempDir
      ];

      const proc = spawn(this.bridgeExe, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      
      const pages: ScanPage[] = [];
      let currentError = '';

      proc.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (!line.trim() || !line.startsWith('{')) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.progress === 'PAGE_SCANNED') {
              if (onProgress) onProgress(`Page ${msg.page} scanned successfully`, msg.page);
              const buffer = fs.readFileSync(msg.file);
              pages.push({ pageNumber: msg.page, buffer, mimeType: 'image/jpeg' });
            } else if (msg.progress === 'FALLBACK_FLATBED') {
              if (onProgress) onProgress('ADF empty, falling back to flatbed...', 0);
            } else if (msg.error) {
              currentError = msg.error;
            }
          } catch (e) {
            // Ignore parse errors on stdout junk
          }
        }
      });

      proc.stderr.on('data', (data) => {
        console.error('[ScannerBridge ERR]', data.toString());
      });

      const checkInterval = setInterval(() => {
        if (cancellationToken?.isCancelled) {
          try { proc.kill('SIGKILL'); } catch {}
          clearInterval(checkInterval);
          reject(new Error('Scan cancelled'));
        }
      }, 500);

      proc.on('close', (code) => {
        clearInterval(checkInterval);
        
        // Cleanup temp files
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}

        if (currentError) {
          reject(new Error(currentError));
        } else if (pages.length === 0) {
          reject(new Error('No pages were scanned. The feeder might be empty.'));
        } else {
          resolve(pages);
        }
      });
      
      proc.on('error', (err) => {
        clearInterval(checkInterval);
        reject(err);
      });
    });
  }

  /**
   * Helper to invoke the bridge and get the list of WIA devices
   */
  async discoverDevices(): Promise<any[]> {
    return new Promise((resolve) => {
      const proc = spawn(this.bridgeExe, ['discover']);
      let output = '';
      proc.stdout.on('data', d => output += d.toString());
      proc.on('close', () => {
        try {
          resolve(JSON.parse(output.trim()));
        } catch {
          resolve([]);
        }
      });
    });
  }
}
