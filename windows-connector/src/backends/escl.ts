import { IScannerBackend } from '../core/backend.interface';
import { Device, ScanJobOptions, ScannerCapabilities, ScanPage } from '../core/models';
import { extractAllXmlTags, extractXmlTag, httpGet, httpGetBinary, httpPost } from '../utils/http';

export class EsclBackend implements IScannerBackend {
  readonly name = 'ESCL';

  private getBaseUrl(device: Device): string {
    const isHttps = device.port === 443 || device.port === 8443;
    const proto = isHttps ? 'https' : 'http';
    return `${proto}://${device.ip}:${device.port || 80}`;
  }

  async isAvailable(device: Device): Promise<boolean> {
    if (!device.ip) return false;
    try {
      const capUrl = `${this.getBaseUrl(device)}/eSCL/ScannerCapabilities`;
      const { status, body } = await httpGet(capUrl, 1500);
      return status === 200 && !!body && body.includes('ScannerCapabilities');
    } catch {
      return false;
    }
  }

  async getCapabilities(device: Device): Promise<ScannerCapabilities> {
    const baseUrl = this.getBaseUrl(device);
    const defaultCaps: ScannerCapabilities = {
      sources: { flatbed: true, adf: false, duplex: false },
      resolutions: [150, 300, 600],
      colorModes: ['Color', 'Grayscale'],
      documentFormats: ['image/jpeg', 'image/png'],
    };

    try {
      const capRes = await httpGet(`${baseUrl}/eSCL/ScannerCapabilities`, 2000);
      if (capRes.status === 200 && capRes.body) {
        const body = capRes.body;
        const inputSources = extractAllXmlTags(body, 'InputSource');

        const hasAdf = inputSources.some(s => /feeder|adf/i.test(s)) || body.includes('<scan:Adf') || body.includes('<AdfInputCaps');
        const hasDuplex = inputSources.some(s => /duplex/i.test(s)) || body.includes('<scan:AdfDuplex') || body.includes('<Duplex');
        const hasFlatbed = inputSources.some(s => /platen|flatbed/i.test(s)) || body.includes('<scan:Platen') || inputSources.length === 0;

        const xRes = extractAllXmlTags(body, 'XResolution').map(Number).filter(Boolean);
        const dpis = [...new Set(xRes)].sort((a, b) => a - b);
        const colorModes = extractAllXmlTags(body, 'ColorMode');
        const formats = extractAllXmlTags(body, 'DocumentFormat');

        return {
          sources: {
            flatbed: hasFlatbed,
            adf: hasAdf,
            duplex: hasDuplex,
          },
          resolutions: dpis.length > 0 ? dpis : defaultCaps.resolutions,
          colorModes: colorModes.length > 0 ? colorModes as any[] : defaultCaps.colorModes,
          documentFormats: formats.length > 0 ? formats : defaultCaps.documentFormats,
        };
      }
    } catch (err) {
      console.warn(`Failed to fetch capabilities for ${device.ip}`, err);
    }
    return defaultCaps;
  }

  async startScan(
    device: Device,
    options: ScanJobOptions,
    onProgress?: (message: string, pageCount: number) => void,
    cancellationToken?: { isCancelled: boolean }
  ): Promise<ScanPage[]> {
    const baseUrl = this.getBaseUrl(device);
    const caps = await this.getCapabilities(device);
    
    const isAdfRequested = options.source === 'adf' || (options.source === 'auto' && caps.sources.adf);
    const inputSource = isAdfRequested ? 'Feeder' : 'Platen';
    const isDuplex = isAdfRequested && options.duplex && caps.sources.duplex;
    
    const esclColorMode = this.mapColorMode(options.colorMode || 'Grayscale');
    const mime = options.format === 'png' ? 'image/png' : 'image/jpeg';
    const dpi = options.dpi || 300;

    let xmlBody = this.buildScanXml(dpi, esclColorMode, inputSource, !!isDuplex, mime);
    const jobsUrl = `${baseUrl}/eSCL/ScanJobs`;

    let jobResp = await httpPost(jobsUrl, 'text/xml; charset=utf-8', xmlBody, 25000);

    // Fallback if feeder is empty and source was auto
    if ((jobResp.status === 409 || jobResp.status === 400 || jobResp.status === 503) && inputSource === 'Feeder' && options.source === 'auto' && caps.sources.flatbed) {
      if (onProgress) onProgress('ADF empty, falling back to flatbed...', 0);
      xmlBody = this.buildScanXml(dpi, esclColorMode, 'Platen', false, mime);
      jobResp = await httpPost(jobsUrl, 'text/xml; charset=utf-8', xmlBody, 25000);
    }

    if (jobResp.status !== 200 && jobResp.status !== 201) {
      throw new Error(`Failed to start scan job. HTTP ${jobResp.status}`);
    }

    const location = jobResp.headers['location'] || `${jobsUrl}/Job1`;
    const jobLocation = location.startsWith('http') ? location : `${baseUrl}${location}`;
    const nextDocUrl = jobLocation.endsWith('/NextDocument') ? jobLocation : `${jobLocation}/NextDocument`;

    const pages: ScanPage[] = [];
    let isDone = false;

    while (!isDone) {
      if (cancellationToken?.isCancelled) {
        try {
          await httpPost(`${jobLocation}/Cancel`, 'text/plain', '', 3000);
        } catch {}
        break;
      }

      let attempt = 0;
      let pageBuffer: Buffer | null = null;

      if (onProgress) onProgress(isAdfRequested ? `Pulling page ${pages.length + 1} from ADF...` : 'Scanning...', pages.length);

      while (attempt < 45 && !pageBuffer && !isDone) {
        if (cancellationToken?.isCancelled) break;
        attempt++;
        try {
          const docResp = await httpGetBinary(nextDocUrl, 25000);
          if (docResp.status === 200 && docResp.buffer && docResp.buffer.length > 200) {
            pageBuffer = docResp.buffer;
          } else if (docResp.status === 404 || docResp.status === 410) {
            isDone = true; // Job complete / ADF empty
            break;
          } else {
            await new Promise(r => setTimeout(r, 1000));
          }
        } catch (err) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      if (pageBuffer) {
        pages.push({ pageNumber: pages.length + 1, buffer: pageBuffer, mimeType: mime });
        if (onProgress) onProgress(`Page ${pages.length} scanned successfully.`, pages.length);

        if (!isAdfRequested) {
          isDone = true;
        } else {
          await new Promise(r => setTimeout(r, 300));
        }
      } else {
        isDone = true;
      }
    }

    if (pages.length === 0) {
      throw new Error('No image data returned from scanner.');
    }

    return pages;
  }

  private mapColorMode(mode: string): string {
    const map: any = {
      Color: 'RGB24',
      Grayscale: 'Grayscale8',
      BlackAndWhite: 'BlackAndWhite1',
    };
    return map[mode] || 'Grayscale8';
  }

  private buildScanXml(dpi: number, colorMode: string, inputSource: string, isDuplex: boolean, mime: string): string {
    const a4w = Math.round((210 / 25.4) * dpi);
    const a4h = Math.round((297 / 25.4) * dpi);

    return `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScanSettings
  xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03"
  xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <pwg:Version>2.6</pwg:Version>
  <scan:Intent>Document</scan:Intent>
  <pwg:ScanRegions>
    <pwg:ScanRegion>
      <pwg:Height>${a4h}</pwg:Height>
      <pwg:Width>${a4w}</pwg:Width>
      <pwg:XOffset>0</pwg:XOffset>
      <pwg:YOffset>0</pwg:YOffset>
    </pwg:ScanRegion>
  </pwg:ScanRegions>
  <pwg:InputSource>${inputSource}</pwg:InputSource>
  <scan:InputSource>${inputSource}</scan:InputSource>
  <scan:Duplex>${isDuplex ? 'true' : 'false'}</scan:Duplex>
  <scan:ColorMode>${colorMode}</scan:ColorMode>
  <scan:XResolution>${dpi}</scan:XResolution>
  <scan:YResolution>${dpi}</scan:YResolution>
  <pwg:DocumentFormat>${mime}</pwg:DocumentFormat>
</scan:ScanSettings>`;
  }
}
