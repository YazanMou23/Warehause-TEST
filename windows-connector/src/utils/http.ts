import http from 'http';
import https from 'https';
import { URL } from 'url';

export async function httpGet(url: string, timeoutMs = 2000): Promise<{ status: number, body: string, headers: any }> {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const lib = isHttps ? https : http;
    const timer = setTimeout(() => reject(new Error('Timeout')), timeoutMs);
    const req = lib.get(url, { rejectUnauthorized: false }, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => {
        clearTimeout(timer);
        resolve({ status: res.statusCode || 0, body, headers: res.headers });
      });
    });
    req.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

export async function httpPost(url: string, contentType: string, body: string | Buffer, timeoutMs = 25000): Promise<{ status: number, body: Buffer, headers: any }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const lib = isHttps ? https : http;
    const bodyBuf = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
    const options = {
      method: 'POST',
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      headers: { 'Content-Type': contentType, 'Content-Length': bodyBuf.length },
      rejectUnauthorized: false,
    };
    const timer = setTimeout(() => reject(new Error('Timeout')), timeoutMs);
    const req = lib.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        clearTimeout(timer);
        resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks), headers: res.headers });
      });
    });
    req.on('error', (e) => { clearTimeout(timer); reject(e); });
    req.end(bodyBuf);
  });
}

export async function httpGetBinary(url: string, timeoutMs = 20000): Promise<{ status: number, buffer: Buffer, headers: any }> {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const lib = isHttps ? https : http;
    const timer = setTimeout(() => reject(new Error('Timeout')), timeoutMs);
    const req = lib.get(url, { rejectUnauthorized: false }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        clearTimeout(timer);
        resolve({ status: res.statusCode || 0, buffer: Buffer.concat(chunks), headers: res.headers });
      });
    });
    req.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

export function extractXmlTag(xml: string, tag: string): string | null {
  if (!xml) return null;
  const m = xml.match(new RegExp(`<[^>]*:?${tag}[^>]*>([\\s\\S]*?)<\\/[^>]*:?${tag}>`, 'i'));
  return m ? m[1].trim() : null;
}

export function extractAllXmlTags(xml: string, tag: string): string[] {
  if (!xml) return [];
  const re = new RegExp(`<[^>]*:?${tag}[^>]*>([\\s\\S]*?)<\\/[^>]*:?${tag}>`, 'gi');
  const results: string[] = [];
  let m;
  while ((m = re.exec(xml)) !== null) results.push(m[1].trim());
  return results;
}
