#!/usr/bin/env node
/**
 * LogiFlow — Local Scanner Bridge Agent
 * =======================================
 * Run this on your local PC/laptop (the machine connected to your printer/scanner network).
 * It bridges your LAN printers to the cloud-hosted LogiFlow web application.
 *
 * Protocol: HTTP/1.1 on 127.0.0.1:48281 (localhost only — never exposed to internet)
 * Zero external dependencies — pure Node.js built-ins only.
 *
 * Usage:  node index.js
 *         node index.js --port 48281 --token YOUR_SECRET_TOKEN
 */

'use strict';

const http        = require('http');
const https       = require('https');
const dns         = require('dns');
const os          = require('os');
const net         = require('net');
const { exec }    = require('child_process');
const { promisify } = require('util');
const fs          = require('fs');
const path        = require('path');
const zlib        = require('zlib');

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT         = parseInt(process.env.SCANNER_AGENT_PORT || '48281', 10);
const AUTH_TOKEN   = process.env.SCANNER_AGENT_TOKEN || '';   // optional — if set, requests must include Authorization: Bearer <token>
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://warehause-test.vercel.app',
  'https://warehause-test.onrender.com',
];

// ─── eSCL constants ───────────────────────────────────────────────────────────
const ESCL_PORTS      = [80, 8080, 443, 8443, 5757, 9100];
const PROBE_TIMEOUT   = 1400;   // ms per TCP probe
const SCAN_POLL_DELAY = 1200;   // ms between scan-result poll attempts
const MAX_POLL        = 25;     // max poll attempts per page

const execAsync = promisify(exec);

// ─── State ────────────────────────────────────────────────────────────────────
let cachedDevices     = [];   // last discovery result
let lastDiscoveryTime = 0;
let isDiscovering     = false;
const CACHE_TTL_MS    = 30_000;  // re-use cache for 30 s

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(level, ...args) {
  const ts = new Date().toISOString();
  console[level](`[${ts}] [Scanner-Agent]`, ...args);
}

function extractXmlTag(xml, tag) {
  const m = xml.match(new RegExp(`<[^>]*:?${tag}[^>]*>([\\s\\S]*?)<\\/[^>]*:?${tag}>`, 'i'));
  return m ? m[1].trim() : null;
}

function extractAllXmlTags(xml, tag) {
  const re = new RegExp(`<[^>]*:?${tag}[^>]*>([\\s\\S]*?)<\\/[^>]*:?${tag}>`, 'gi');
  const results = [];
  let m;
  while ((m = re.exec(xml)) !== null) results.push(m[1].trim());
  return results;
}

function getLocalIpv4Addresses() {
  const ifaces = os.networkInterfaces();
  const addrs  = [];
  for (const iface of Object.values(ifaces)) {
    for (const info of iface || []) {
      if (info.family === 'IPv4' && !info.internal) addrs.push(info.address);
    }
  }
  return addrs;
}

function subnetHosts(ip) {
  const parts  = ip.split('.');
  if (parts.length !== 4) return [];
  const prefix = parts.slice(0, 3).join('.');
  const hosts  = [];
  for (let i = 1; i <= 254; i++) hosts.push(`${prefix}.${i}`);
  return hosts;
}

/** Quick TCP reachability check */
function tcpReachable(ip, port, timeoutMs) {
  return new Promise((resolve) => {
    const sock  = new net.Socket();
    const timer = setTimeout(() => { sock.destroy(); resolve(false); }, timeoutMs);
    sock.once('connect', () => { clearTimeout(timer); sock.destroy(); resolve(true); });
    sock.once('error',   () => { clearTimeout(timer); resolve(false); });
    sock.connect(port, ip);
  });
}

/** HTTP(S) GET returning text */
function httpGet(url, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const lib    = url.startsWith('https') ? https : http;
    const timer  = setTimeout(() => reject(new Error('Timeout')), timeoutMs);
    lib.get(url, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => { clearTimeout(timer); resolve({ status: res.statusCode, body, headers: res.headers }); });
    }).on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

/** HTTP POST returning response */
function httpPost(url, contentType, body, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const urlObj   = new URL(url);
    const lib      = urlObj.protocol === 'https:' ? https : http;
    const bodyBuf  = Buffer.from(body, 'utf8');
    const options  = {
      method:   'POST',
      hostname: urlObj.hostname,
      port:     urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path:     urlObj.pathname + urlObj.search,
      headers:  { 'Content-Type': contentType, 'Content-Length': bodyBuf.length },
    };
    const timer = setTimeout(() => reject(new Error('Timeout')), timeoutMs);
    const req   = lib.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        clearTimeout(timer);
        resolve({ status: res.statusCode, body: Buffer.concat(chunks), headers: res.headers });
      });
    });
    req.on('error', (e) => { clearTimeout(timer); reject(e); });
    req.end(bodyBuf);
  });
}

/** HTTP GET returning binary buffer */
function httpGetBinary(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const lib   = url.startsWith('https') ? https : http;
    const timer = setTimeout(() => reject(new Error('Timeout')), timeoutMs);
    lib.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        clearTimeout(timer);
        resolve({ status: res.statusCode, buffer: Buffer.concat(chunks), headers: res.headers });
      });
    }).on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

// ─── Discovery ────────────────────────────────────────────────────────────────

async function probeIp(ip, seenIds, discovered, connectionType = 'WIFI', explicitPort) {
  const ports = explicitPort ? [explicitPort] : ESCL_PORTS;
  for (const port of ports) {
    try {
      const open = await tcpReachable(ip, port, PROBE_TIMEOUT);
      if (!open) continue;

      const protocol = (port === 443 || port === 8443) ? 'https' : 'http';
      const capUrl   = `${protocol}://${ip}:${port}/eSCL/ScannerCapabilities`;
      const { status, body } = await httpGet(capUrl, PROBE_TIMEOUT);
      if (status !== 200) continue;

      const makeModel    = extractXmlTag(body, 'MakeAndModel') || extractXmlTag(body, 'Model') || 'eSCL Scanner';
      const inputSources = extractAllXmlTags(body, 'InputSource');
      const xRes         = extractAllXmlTags(body, 'XResolution').map(Number).filter(Boolean);
      const dpis         = [...new Set(xRes)].sort((a, b) => a - b);
      const formats      = extractAllXmlTags(body, 'DocumentFormat');
      const colorModes   = extractAllXmlTags(body, 'ColorMode');
      const serial       = extractXmlTag(body, 'SerialNumber') || '';

      const deviceId = serial
        ? `ESCL_${makeModel.replace(/\s+/g, '_')}_${serial}`
        : `ESCL_${ip.replace(/\./g, '_')}_${port}`;

      if (!seenIds.has(deviceId)) {
        seenIds.add(deviceId);
        discovered.push({
          id:             deviceId,
          name:           makeModel,
          displayName:    makeModel,
          connectionType,
          ip,
          port,
          protocol:       'ESCL',
          serial:         serial || null,
          status:         'READY',
          statusDetails:  'eSCL AirScan — Bereit',
          capabilities: {
            hasAdf:          inputSources.some((s) => s.toLowerCase().includes('feeder')),
            hasFlatbed:      inputSources.some((s) => s.toLowerCase().includes('platen')) || inputSources.length === 0,
            supportedDpi:    dpis.length > 0 ? dpis : [150, 300, 600],
            colorModes:      colorModes.length > 0 ? colorModes : ['RGB24', 'Grayscale8'],
            documentFormats: formats.length > 0 ? formats : ['image/jpeg'],
          },
        });
        log('log', `Found eSCL device: ${makeModel} at ${ip}:${port}`);
      }
      return; // found on this port — skip remaining
    } catch { /* ignore */ }
  }
}

async function discoverViaMdns(seenIds, discovered) {
  const names = ['_uscan._tcp.local', '_ipp._tcp.local', '_printer._tcp.local'];
  for (const name of names) {
    try {
      const addresses = await Promise.race([
        new Promise((res, rej) => dns.resolve4(name, (e, a) => e ? rej(e) : res(a))),
        new Promise((_, rej) => setTimeout(() => rej(new Error('mDNS timeout')), 800)),
      ]);
      for (const ip of (addresses || [])) {
        if (!seenIds.has(ip)) await probeIp(ip, seenIds, discovered, 'WIFI');
      }
    } catch { /* mDNS unavailable */ }
  }
}

async function discoverViaArp(seenIds, discovered) {
  try {
    const { stdout } = await execAsync('arp -a', { timeout: 3000 });
    const ipRe       = /\b(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)\b/g;
    const ips        = [...new Set((stdout || '').match(ipRe) || [])];
    const tasks      = ips.filter((ip) => !seenIds.has(ip)).map((ip) => probeIp(ip, seenIds, discovered));
    await Promise.all(tasks);
  } catch { /* arp unavailable */ }
}

async function discoverViaWia(seenIds, discovered) {
  if (process.platform !== 'win32') return;
  try {
    const psScript = `
      try {
        $dm = New-Object -ComObject WIA.DeviceManager
        foreach ($d in $dm.DeviceInfos) {
          $n = try { $d.Properties.Item('Name').Value } catch { 'Unknown' }
          Write-Output "$($d.DeviceID)||$n"
        }
      } catch {}
    `;
    const { stdout } = await execAsync(`powershell -NoProfile -Command "${psScript.replace(/\n/g, ' ')}"`, { timeout: 5000 });
    for (const line of (stdout || '').trim().split('\n').filter(Boolean)) {
      const [devId, devName] = line.split('||');
      if (devId && devName && !seenIds.has(devId.trim())) {
        seenIds.add(devId.trim());
        discovered.push({
          id:            devId.trim(),
          name:          devName.trim(),
          displayName:   `USB: ${devName.trim()}`,
          connectionType: 'USB',
          protocol:      'WIA',
          status:        'READY',
          statusDetails: 'USB-Scanner (WIA)',
          capabilities: {
            hasAdf:          false,
            hasFlatbed:      true,
            supportedDpi:    [150, 300, 600],
            colorModes:      ['RGB24', 'Grayscale8', 'BlackAndWhite1'],
            documentFormats: ['image/jpeg', 'image/png'],
          },
        });
        log('log', `Found WIA/USB device: ${devName.trim()}`);
      }
    }
  } catch (e) {
    log('debug', 'WIA discovery skipped:', e.message);
  }
}

async function runDiscovery() {
  if (isDiscovering) return cachedDevices;
  isDiscovering = true;

  const discovered = [];
  const seenIds    = new Set();

  try {
    log('log', 'Starting device discovery...');

    // 1. mDNS / Bonjour
    await discoverViaMdns(seenIds, discovered);

    // 2. ARP table
    await discoverViaArp(seenIds, discovered);

    // 3. Windows WIA (USB)
    await discoverViaWia(seenIds, discovered);

    // 4. /24 subnet sweep
    const localIps  = getLocalIpv4Addresses();
    const subnetSet = new Set();
    for (const lip of localIps) {
      subnetHosts(lip).forEach((h) => subnetSet.add(h));
    }
    const ipList = [...subnetSet].filter((ip) => !seenIds.has(ip));
    const CHUNK  = 40;
    for (let i = 0; i < ipList.length; i += CHUNK) {
      const chunk = ipList.slice(i, i + CHUNK);
      await Promise.all(chunk.map((ip) => probeIp(ip, seenIds, discovered)));
    }

    // 5. Simulator (always present)
    if (!seenIds.has('SIMULATOR')) {
      discovered.push({
        id:            'SIMULATOR',
        name:          'LogiFlow Scanner Simulator',
        displayName:   'WLAN-Scanner Simulator (Test-Modus)',
        connectionType: 'WIFI',
        ip:            'SIMULATOR',
        port:          80,
        protocol:      'SIMULATOR',
        status:        'READY',
        statusDetails: 'Virtueller Testscanner (kein echtes Gerät)',
        capabilities: {
          hasAdf:          true,
          hasFlatbed:      true,
          supportedDpi:    [150, 300, 600],
          colorModes:      ['RGB24', 'Grayscale8', 'BlackAndWhite1'],
          documentFormats: ['image/jpeg', 'image/png', 'application/pdf'],
        },
      });
    }

    cachedDevices     = discovered;
    lastDiscoveryTime = Date.now();
    log('log', `Discovery complete — ${discovered.length} device(s) found.`);
  } finally {
    isDiscovering = false;
  }

  return discovered;
}

// ─── Scanning ─────────────────────────────────────────────────────────────────

/** Build eSCL ScanSettings XML */
function buildScanXml(options) {
  const { dpi = 300, colorMode = 'Grayscale8', inputSource = 'Platen', mime = 'image/jpeg' } = options;
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
  <scan:ColorMode>${colorMode}</scan:ColorMode>
  <scan:XResolution>${dpi}</scan:XResolution>
  <scan:YResolution>${dpi}</scan:YResolution>
  <pwg:DocumentFormat>${mime}</pwg:DocumentFormat>
</scan:ScanSettings>`;
}

function colorModeToEscl(mode) {
  const map = { Color: 'RGB24', Grayscale: 'Grayscale8', BlackAndWhite: 'BlackAndWhite1' };
  return map[mode] || 'Grayscale8';
}

async function triggerWiaScan() {
  const tempOut = path.join(os.tmpdir(), `logiflow_scan_${Date.now()}.jpg`);
  const psScript = `
    try {
      $dm = New-Object -ComObject WIA.DeviceManager
      if ($dm.DeviceInfos.Count -gt 0) {
        $dev  = $dm.DeviceInfos.Item(1).Connect()
        $item = $dev.Items.Item(1)
        $img  = $item.Transfer()
        $img.SaveFile("${tempOut.replace(/\\/g, '\\\\')}")
      } else { exit 1 }
    } catch { exit 2 }
  `;
  await execAsync(`powershell -NoProfile -Command "${psScript.replace(/\n/g, ' ')}"`, { timeout: 25000 });
  if (fs.existsSync(tempOut)) {
    const buffer = fs.readFileSync(tempOut);
    try { fs.unlinkSync(tempOut); } catch {}
    return [{ buffer, mimeType: 'image/jpeg' }];
  }
  throw new Error('WIA scan produced no output file.');
}

async function triggerEsclScan(ip, port, options) {
  const { dpi = 300, colorMode = 'Grayscale', inputSource = 'Platen', format = 'jpeg', batchScan = false } = options;
  const mime     = format === 'png' ? 'image/png' : 'image/jpeg';
  const esclMode = colorModeToEscl(colorMode);
  const xmlBody  = buildScanXml({ dpi, colorMode: esclMode, inputSource, mime });
  const baseUrl  = `http://${ip}:${port}`;
  const jobsUrl  = `${baseUrl}/eSCL/ScanJobs`;

  log('log', `Posting scan job to ${jobsUrl} (${dpi}DPI ${colorMode} ${inputSource})`);
  const jobResp = await httpPost(jobsUrl, 'text/xml; charset=utf-8', xmlBody, 20000);
  if (jobResp.status !== 200 && jobResp.status !== 201) {
    throw new Error(`eSCL POST /ScanJobs returned HTTP ${jobResp.status}`);
  }

  const location    = jobResp.headers['location'] || `${jobsUrl}/Job1`;
  const jobLocation = location.startsWith('http') ? location : `${baseUrl}${location}`;
  const nextDocUrl  = jobLocation.endsWith('/NextDocument') ? jobLocation : `${jobLocation}/NextDocument`;
  log('log', `Polling scanned document at: ${nextDocUrl}`);

  const pages  = [];
  let   atAdf  = inputSource === 'Feeder' && batchScan;
  let   done   = false;

  while (!done) {
    let attempt = 0;
    let pageBuffer = null;

    while (attempt < MAX_POLL && !pageBuffer) {
      attempt++;
      try {
        const docResp = await httpGetBinary(nextDocUrl, 15000);
        if (docResp.status === 200 && docResp.buffer.length > 100) {
          pageBuffer = docResp.buffer;
        } else if (docResp.status === 404) {
          // ADF exhausted or job expired
          done = true; break;
        } else if (docResp.status === 503) {
          await new Promise((r) => setTimeout(r, SCAN_POLL_DELAY));
        } else {
          await new Promise((r) => setTimeout(r, SCAN_POLL_DELAY));
        }
      } catch {
        await new Promise((r) => setTimeout(r, SCAN_POLL_DELAY));
      }
    }

    if (pageBuffer) {
      pages.push({ buffer: pageBuffer, mimeType: mime });
      log('log', `Page ${pages.length} scanned (${pageBuffer.length} bytes).`);
      if (!atAdf) done = true; // flatbed: only one page
    } else {
      done = true;
    }
  }

  if (pages.length === 0) throw new Error('Scanner returned no pages.');
  return pages;
}

function generateSampleDocumentPng(width = 600, height = 800) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcVal = zlib.crc32(Buffer.concat([typeBuf, data]));
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crcVal >>> 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = 1 + width * 3;
  const raw = Buffer.alloc(height * stride, 255);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * stride;
    raw[rowOffset] = 0;
    if (y >= 40 && y <= 90) {
      for (let x = 40; x < width - 40; x++) {
        const px = rowOffset + 1 + x * 3;
        raw[px] = 30; raw[px + 1] = 58; raw[px + 2] = 138;
      }
    }
    if ((y >= 160 && y <= 162) || (y >= 220 && y <= 221) || (y >= 280 && y <= 281) || (y >= 340 && y <= 341) || (y >= 400 && y <= 401)) {
      for (let x = 40; x < width - 40; x++) {
        const px = rowOffset + 1 + x * 3;
        raw[px] = 210; raw[px + 1] = 215; raw[px + 2] = 225;
      }
    }
  }
  const compressed = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

async function executeScan(options) {
  const { scannerIp, scannerPort = 80 } = options;

  // Simulator
  if (!scannerIp || scannerIp === 'SIMULATOR') {
    log('log', 'Simulator scan requested — returning valid sample document PNG.');
    return [{ buffer: generateSampleDocumentPng(600, 800), mimeType: 'image/png' }];
  }

  // USB / WIA
  if (scannerIp.startsWith('USB_') || scannerIp.startsWith('WIA_') || scannerIp === 'USB') {
    return triggerWiaScan();
  }

  // Network eSCL
  return triggerEsclScan(scannerIp, scannerPort, options);
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type':                'application/json; charset=utf-8',
    'Content-Length':              Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',  // local agent — safe to allow all
  });
  res.end(body);
}

function checkAuth(req) {
  if (!AUTH_TOKEN) return true;  // no token configured → open
  const header = req.headers['authorization'] || '';
  return header === `Bearer ${AUTH_TOKEN}`;
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => body += c);
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  // Auth check
  if (!checkAuth(req)) {
    return sendJson(res, 401, { error: 'Unauthorized' });
  }

  const url = req.url.split('?')[0];

  try {
    // GET /health
    if (req.method === 'GET' && url === '/health') {
      return sendJson(res, 200, {
        status:    'ok',
        version:   '1.0.0',
        platform:  process.platform,
        hostname:  os.hostname(),
        uptime:    process.uptime(),
        timestamp: new Date().toISOString(),
      });
    }

    // GET /ping
    if (req.method === 'GET' && url === '/ping') {
      res.writeHead(200); res.end('pong'); return;
    }

    // GET /scanners  (discovery)
    if (req.method === 'GET' && url === '/scanners') {
      // Return cache if fresh
      if (Date.now() - lastDiscoveryTime < CACHE_TTL_MS && cachedDevices.length > 0 && !isDiscovering) {
        return sendJson(res, 200, cachedDevices);
      }
      const devices = await runDiscovery();
      return sendJson(res, 200, devices);
    }

    // GET /scanners/discover  (force fresh discovery)
    if (req.method === 'GET' && url === '/scanners/discover') {
      lastDiscoveryTime = 0; // invalidate cache
      const devices = await runDiscovery();
      return sendJson(res, 200, devices);
    }

    // GET /scanners/:id/status
    const statusMatch = url.match(/^\/scanners\/(.+)\/status$/);
    if (req.method === 'GET' && statusMatch) {
      const id     = decodeURIComponent(statusMatch[1]);
      const device = cachedDevices.find((d) => d.id === id);
      if (!device || !device.ip || device.ip === 'SIMULATOR') {
        return sendJson(res, 200, { status: 'READY', state: 'Idle', details: 'Simulator bereit' });
      }
      try {
        const { status: s, body } = await httpGet(`http://${device.ip}:${device.port}/eSCL/ScannerStatus`, 4000);
        if (s !== 200) return sendJson(res, 200, { status: 'OFFLINE', details: `HTTP ${s}` });
        const state  = extractXmlTag(body, 'State') || 'Idle';
        const reason = extractXmlTag(body, 'AdfState') || extractXmlTag(body, 'Reason') || '';
        let status   = 'READY';
        if (/busy|processing/i.test(state))  status = 'BUSY';
        if (/jam/i.test(reason))             status = 'PAPER_JAM';
        if (/empty|nopaper/i.test(reason))   status = 'NO_PAPER';
        if (/open|cover/i.test(reason))      status = 'COVER_OPEN';
        return sendJson(res, 200, { status, state, details: device.statusDetails });
      } catch (e) {
        return sendJson(res, 200, { status: 'OFFLINE', details: e.message });
      }
    }

    // POST /scan
    if (req.method === 'POST' && url === '/scan') {
      const options = await readBody(req);
      log('log', 'Scan requested:', JSON.stringify({ ip: options.scannerIp, dpi: options.dpi, src: options.inputSource }));
      const pages = await executeScan(options);
      return sendJson(res, 200, {
        success:   true,
        pageCount: pages.length,
        pages:     pages.map((p, i) => ({
          pageNumber: i + 1,
          mimeType:   p.mimeType,
          base64Data: p.buffer.toString('base64'),
        })),
      });
    }

    sendJson(res, 404, { error: 'Not found', path: url });
  } catch (err) {
    log('error', 'Request error:', err.message);
    sendJson(res, 500, { error: 'Internal agent error', message: err.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║     LogiFlow — Local Scanner Bridge Agent  v1.0       ║');
  console.log('╠═══════════════════════════════════════════════════════╣');
  console.log(`║  Listening on:  http://127.0.0.1:${PORT}              ║`);
  console.log(`║  Platform:      ${process.platform.padEnd(38)}║`);
  if (AUTH_TOKEN) {
  console.log('║  Auth:          Token required                         ║');
  } else {
  console.log('║  Auth:          Open (localhost only)                  ║');
  }
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log('');
  console.log('The agent is now bridging your local network to LogiFlow.');
  console.log('Keep this window open while scanning.');
  console.log('Press Ctrl+C to stop.');
  console.log('');

  // Warm up discovery in background
  runDiscovery().catch(() => {});
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use. Is the agent already running?`);
    console.error(`   Try: node index.js --port 48282\n`);
  } else {
    console.error('Agent error:', err);
  }
  process.exit(1);
});

process.on('SIGINT',  () => { console.log('\nScanner Agent stopped.'); process.exit(0); });
process.on('SIGTERM', () => { process.exit(0); });
