import Bonjour from 'bonjour-service';
import { Device } from '../core/models';
import { WiaBackend } from '../backends/wia';
import { EsclBackend } from '../backends/escl';
import { randomUUID } from 'crypto';

export class DiscoveryManager {
  private devices: Map<string, Device> = new Map();
  private wiaBackend = new WiaBackend();
  private esclBackend = new EsclBackend();
  private bonjour = new Bonjour();
  private isDiscovering = false;

  getDevices(): Device[] {
    return Array.from(this.devices.values());
  }

  getDevice(id: string): Device | undefined {
    return this.devices.get(id);
  }

  async startDiscovery() {
    if (this.isDiscovering) return;
    this.isDiscovering = true;
    
    console.log('[Discovery] Starting scanner discovery...');

    // 1. Discover local WIA devices
    this.discoverWia();

    // 2. Discover Network ESCL scanners via mDNS
    this.discoverEscl();

    // Re-run WIA periodically to catch hot-plugged USB scanners
    setInterval(() => this.discoverWia(), 15000);
  }

  private async discoverWia() {
    try {
      const wiaDevices = await this.wiaBackend.discoverDevices();
      for (const wd of wiaDevices) {
        const id = `wia_${wd.id.replace(/[^a-zA-Z0-9]/g, '')}`;
        if (!this.devices.has(id)) {
          this.devices.set(id, {
            id,
            name: wd.name,
            displayName: wd.name,
            manufacturer: 'Local',
            model: wd.name,
            connectionType: 'USB',
            protocol: 'WIA',
            status: 'available',
            capabilities: { printer: false, scanner: true },
            sources: {
              flatbed: wd.hasFlatbed,
              adf: wd.hasAdf,
              duplex: wd.hasDuplex
            }
          });
          console.log(`[Discovery] Found WIA device: ${wd.name}`);
        }
      }
    } catch (err) {
      console.error('[Discovery] WIA discovery failed:', err);
    }
  }

  private discoverEscl() {
    this.bonjour.find({ type: 'uscan' }, (service) => {
      const id = `escl_${service.txt?.['ty']?.replace(/[^a-zA-Z0-9]/g, '') || randomUUID()}`;
      
      if (!this.devices.has(id)) {
        const ip = service.addresses?.[0] || '127.0.0.1';
        const port = service.port || 80;
        
        const device: Device = {
          id,
          name: service.name,
          displayName: service.txt?.['ty'] || service.name,
          manufacturer: service.txt?.['mfg'] || 'Network',
          model: service.txt?.['mdl'] || service.name,
          connectionType: 'NETWORK',
          ip,
          port,
          protocol: 'ESCL',
          status: 'available',
          capabilities: { printer: false, scanner: true }
        };

        this.devices.set(id, device);
        console.log(`[Discovery] Found ESCL device: ${device.displayName} at ${ip}:${port}`);

        // Async fetch exact capabilities
        this.esclBackend.getCapabilities(device).then(caps => {
          device.scannerCaps = caps;
          device.sources = caps.sources;
        });
      }
    });
  }
}
