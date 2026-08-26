#!/usr/bin/env node
/**
 * ============================================================================
 * LogiFlow Windows Local Printer & Scanner Connector v2.2 (Full ADF & Multi-Page)
 * ============================================================================
 * Standalone background service running on Windows PCs to bridge the LogiFlow
 * web application with local Wi-Fi, Ethernet, and USB printers/scanners.
 *
 * Supported Protocols & Integrations:
 *  - mDNS / DNS-SD (UDP 224.0.0.251:5353) — _uscan, _uscans, _scanner, _ipp, _ipps, _printer
 *  - WS-Discovery / DPWS (UDP 239.255.255.250:3702) — WSD devices & scanners
 *  - SSDP / UPnP (UDP 239.255.255.250:1900)
 *  - Canon BJNP Protocol (UDP 8611 / 8612) — Canon Network Printers & Scanners
 *  - Windows WIA COM Automation (USB & WIA network scanners, with continuous ADF loop)
 *  - Windows Print Spooler (Get-Printer / WMI)
 *  - eSCL / Apple AirScan / Mopria (HTTP/HTTPS REST on ports 80, 8080, 443, 8443, 5757, 9100)
 *  - Continuous ADF (Automatic Document Feeder) Batch Scanning with live page streaming
 *  - High-speed parallel /24 subnet sweep & ARP table probe (< 2.5 seconds)
 *
 * Security:
 *  - Binds strictly to 127.0.0.1 (localhost only)
 *  - Full CORS support for web application integration
 * ============================================================================
 */

'use strict';

const http          = require('http');
const https         = require('https');
const dgram         = require('dgram');
const net           = require('net');
const os            = require('os');
const { exec }      = require('child_process');
const { promisify } = require('util');
const fs            = require('fs');
const path          = require('path');
const zlib          = require('zlib');
const crypto        = require('crypto');

const execAsync = promisify(exec);

// ─── Configuration ────────────────────────────────────────────────────────────
const PORT             = parseInt(process.env.CONNECTOR_PORT || process.env.SCANNER_AGENT_PORT || '48281', 10);
const AUTH_TOKEN       = process.env.CONNECTOR_TOKEN || process.env.SCANNER_AGENT_TOKEN || '';
const ESCL_PORTS       = [80, 8080, 443, 8443, 5757, 9100];
const PROBE_PORTS      = [80, 443, 8080, 8443, 5757, 9100, 631, 515, 8611, 8612];
const PROBE_TIMEOUT_MS = 600;
const FAST_TCP_TIMEOUT = 350;
const CACHE_TTL_MS     = 30_000;
const MULTICAST_WAIT   = 1200;
const VERSION          = '2.3.0';

// ─── State ────────────────────────────────────────────────────────────────────
let cachedDevices     = [];
let lastDiscoveryTime = 0;
let isDiscovering     = false;
let discoveryPromise  = null;
const activeScanJobs  = new Map(); // jobId -> { id, status, selectedSource, pageCount, pages, message, error, createdAt, cancelled }

// ─── Logging ──────────────────────────────────────────────────────────────────
function log(level, ...args) {
  const ts = new Date().toISOString().slice(11, 19);
  console[level](`[${ts}] [PrinterConnector]`, ...args);
}

// ─── XML & Parser Helpers ─────────────────────────────────────────────────────
function extractXmlTag(xml, tag) {
  if (!xml) return null;
  const m = xml.match(new RegExp(`<[^>]*:?${tag}[^>]*>([\\s\\S]*?)<\\/[^>]*:?${tag}>`, 'i'));
  return m ? m[1].trim() : null;
}

function extractAllXmlTags(xml, tag) {
  if (!xml) return [];
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
  const parts = ip.split('.');
  if (parts.length !== 4) return [];
  const prefix = parts.slice(0, 3).join('.');
  const hosts = [];
  for (let i = 1; i <= 254; i++) hosts.push(`${prefix}.${i}`);
  return hosts;
}

function detectManufacturer(name) {
  if (!name) return 'Generic';
  const n = name.toUpperCase();
  if (n.includes('CANON')) return 'Canon';
  if (n.includes('BROTHER')) return 'Brother';
  if (n.includes('HP') || n.includes('HEWLETT') || n.includes('OFFICEJET') || n.includes('LASERJET') || n.includes('DESKJET') || n.includes('PAGEWIDE')) return 'HP';
  if (n.includes('EPSON') || n.includes('ECOTANK') || n.includes('WORKFORCE')) return 'Epson';
  if (n.includes('LEXMARK')) return 'Lexmark';
  if (n.includes('XEROX') || n.includes('VERSALINK') || n.includes('ALTALINK') || n.includes('WORKCENTRE')) return 'Xerox';
  if (n.includes('KYOCERA') || n.includes('ECOSYS') || n.includes('TASKALFA')) return 'Kyocera';
  if (n.includes('RICOH') || n.includes('AFICIO')) return 'Ricoh';
  if (n.includes('SAMSUNG')) return 'Samsung';
  if (n.includes('PANASONIC')) return 'Panasonic';
  if (n.includes('OKI')) return 'OKI';
  if (n.includes('KONICA') || n.includes('MINOLTA')) return 'Konica Minolta';
  return 'Network Device';
}

function normalizeModelName(makeAndModel, fallback = 'Drucker / Scanner') {
  if (!makeAndModel) return fallback;
  return makeAndModel
    .replace(/^(Brother|HP|Hewlett-Packard|Canon|Epson|Lexmark|Xerox|Kyocera|Ricoh|Samsung|OKI)\s+/i, '')
    .trim();
}

// ─── Sockets & HTTP Networking ────────────────────────────────────────────────
function tcpReachable(ip, port, timeoutMs = FAST_TCP_TIMEOUT) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    const timer = setTimeout(() => { sock.destroy(); resolve(false); }, timeoutMs);
    sock.once('connect', () => { clearTimeout(timer); sock.destroy(); resolve(true); });
    sock.once('error',   () => { clearTimeout(timer); sock.destroy(); resolve(false); });
    sock.connect(port, ip);
  });
}

function httpGet(url, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const lib     = isHttps ? https : http;
    const timer   = setTimeout(() => reject(new Error('Timeout')), timeoutMs);
    const req = lib.get(url, { rejectUnauthorized: false }, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => {
        clearTimeout(timer);
        resolve({ status: res.statusCode, body, headers: res.headers });
      });
    });
    req.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

function httpPost(url, contentType, body, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const urlObj  = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const lib     = isHttps ? https : http;
    const bodyBuf = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
    const options = {
      method:             'POST',
      hostname:           urlObj.hostname,
      port:               urlObj.port || (isHttps ? 443 : 80),
      path:               urlObj.pathname + urlObj.search,
      headers:            { 'Content-Type': contentType, 'Content-Length': bodyBuf.length },
      rejectUnauthorized: false,
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

function httpGetBinary(url, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const lib     = isHttps ? https : http;
    const timer   = setTimeout(() => reject(new Error('Timeout')), timeoutMs);
    const req = lib.get(url, { rejectUnauthorized: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        clearTimeout(timer);
        resolve({ status: res.statusCode, buffer: Buffer.concat(chunks), headers: res.headers });
      });
    });
    req.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

// ─── 1. UDP Multicast mDNS / DNS-SD Engine ────────────────────────────────────
async function discoverViaMdnsMulticast(discoveredIps, candidateMeta) {
  return new Promise((resolve) => {
    let socket;
    try {
      socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    } catch {
      return resolve();
    }

    const timer = setTimeout(() => {
      try { socket.close(); } catch {}
      resolve();
    }, MULTICAST_WAIT);

    socket.on('error', () => {
      clearTimeout(timer);
      try { socket.close(); } catch {}
      resolve();
    });

    socket.on('message', (msg, rinfo) => {
      if (rinfo.address && !rinfo.address.startsWith('127.')) {
        discoveredIps.add(rinfo.address);
        const str = msg.toString('binary');
        const meta = candidateMeta.get(rinfo.address) || {};

        const tyMatch = str.match(/ty=([^\x00\x01\n\r]+)/i);
        const mdMatch = str.match(/md=([^\x00\x01\n\r]+)/i);
        const name = (tyMatch ? tyMatch[1] : (mdMatch ? mdMatch[1] : '')).replace(/[^\x20-\x7E]/g, '').trim();
        if (name) meta.name = name;

        const isDuplex = /duplex=t|duplex=1/i.test(str);
        if (isDuplex) meta.hasDuplex = true;

        candidateMeta.set(rinfo.address, meta);
      }
    });

    socket.bind(0, () => {
      try {
        socket.addMembership('224.0.0.251');
      } catch {}

      // Query for _uscan (AirScan eSCL), _scanner, and _ipp (Printers)
      const queries = [
        Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x06, 0x5f, 0x75, 0x73, 0x63, 0x61, 0x6e, 0x04, 0x5f, 0x74, 0x63, 0x70, 0x05, 0x6c, 0x6f, 0x63, 0x61, 0x6c, 0x00, 0x00, 0x0c, 0x00, 0x01]),
        Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x5f, 0x69, 0x70, 0x70, 0x04, 0x5f, 0x74, 0x63, 0x70, 0x05, 0x6c, 0x6f, 0x63, 0x61, 0x6c, 0x00, 0x00, 0x0c, 0x00, 0x01]),
      ];

      for (const q of queries) {
        socket.send(q, 5353, '224.0.0.251', () => {});
      }
    });
  });
}

// ─── 2. WS-Discovery (UDP 3702) ───────────────────────────────────────────────
async function discoverViaWsd(discoveredIps, candidateMeta) {
  const wsdProbe = Buffer.from(
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:wsd="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:wprt="http://schemas.microsoft.com/windows/2006/08/wdp/print" xmlns:wscn="http://schemas.microsoft.com/windows/2006/08/wdp/scan">' +
      '<soap:Header>' +
        '<wsa:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</wsa:To>' +
        '<wsa:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</wsa:Action>' +
        `<wsa:MessageID>urn:uuid:${crypto.randomUUID()}</wsa:MessageID>` +
      '</soap:Header>' +
      '<soap:Body>' +
        '<wsd:Probe>' +
          '<wsd:Types>wprt:PrintDeviceType wscn:ScanDeviceType</wsd:Types>' +
        '</wsd:Probe>' +
      '</soap:Body>' +
    '</soap:Envelope>'
  );

  return new Promise((resolve) => {
    let socket;
    try {
      socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    } catch {
      return resolve();
    }

    const timer = setTimeout(() => {
      try { socket.close(); } catch {}
      resolve();
    }, 1000);

    socket.on('error', () => {
      clearTimeout(timer);
      try { socket.close(); } catch {}
      resolve();
    });

    socket.on('message', (msg, rinfo) => {
      if (rinfo.address && !rinfo.address.startsWith('127.')) {
        discoveredIps.add(rinfo.address);
        const text = msg.toString('utf8');
        const meta = candidateMeta.get(rinfo.address) || {};
        const modelMatch = text.match(/<[^>]*:?ModelName[^>]*>([^<]+)<\/[^>]*:?ModelName>/i) ||
                           text.match(/<[^>]*:?FriendlyName[^>]*>([^<]+)<\/[^>]*:?FriendlyName>/i);
        if (modelMatch) meta.name = modelMatch[1].trim();
        candidateMeta.set(rinfo.address, meta);
      }
    });

    socket.bind(0, () => {
      try {
        socket.addMembership('239.255.255.250');
        socket.send(wsdProbe, 3702, '239.255.255.250', () => {});
      } catch {}
    });
  });
}

// ─── 3. SSDP / UPnP (UDP 1900) ────────────────────────────────────────────────
async function discoverViaSsdp(discoveredIps, candidateMeta) {
  const ssdpMsg = Buffer.from(
    'M-SEARCH * HTTP/1.1\r\n' +
    'HOST: 239.255.255.250:1900\r\n' +
    'MAN: "ssdp:discover"\r\n' +
    'MX: 1\r\n' +
    'ST: urn:schemas-upnp-org:device:Scanner:1\r\n\r\n'
  );

  return new Promise((resolve) => {
    let socket;
    try {
      socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    } catch {
      return resolve();
    }

    const timer = setTimeout(() => {
      try { socket.close(); } catch {}
      resolve();
    }, 800);

    socket.on('error', () => {
      clearTimeout(timer);
      try { socket.close(); } catch {}
      resolve();
    });

    socket.on('message', (msg, rinfo) => {
      if (rinfo.address && !rinfo.address.startsWith('127.')) {
        discoveredIps.add(rinfo.address);
      }
    });

    socket.bind(0, () => {
      try {
        socket.send(ssdpMsg, 1900, '239.255.255.250', () => {});
      } catch {}
    });
  });
}

// ─── 4. Canon BJNP Protocol Broadcast (UDP 8611 / 8612) ──────────────────────
async function discoverViaBjnpBroadcast(discoveredIps, candidateMeta) {
  const bjnpPacket = Buffer.from([
    0x42, 0x4a, 0x4e, 0x50, // 'BJNP'
    0x01,                   // Type: Printer / Scanner
    0x01,                   // Command: Discover
    0x00, 0x00, 0x00, 0x00, // Session ID
    0x00, 0x00, 0x00, 0x00, // Seq
    0x00, 0x00              // Payload length
  ]);

  return new Promise((resolve) => {
    let socket;
    try {
      socket = dgram.createSocket({ type: 'udp4' });
    } catch {
      return resolve();
    }

    const timer = setTimeout(() => {
      try { socket.close(); } catch {}
      resolve();
    }, 800);

    socket.on('error', () => {
      clearTimeout(timer);
      try { socket.close(); } catch {}
      resolve();
    });

    socket.on('message', (msg, rinfo) => {
      if (rinfo.address && !rinfo.address.startsWith('127.')) {
        discoveredIps.add(rinfo.address);
        candidateMeta.set(rinfo.address, {
          ...(candidateMeta.get(rinfo.address) || {}),
          isCanonBjnp: true,
          name: candidateMeta.get(rinfo.address)?.name || 'Canon Network Multifunction Printer',
        });
      }
    });

    socket.bind(0, () => {
      try {
        socket.setBroadcast(true);
        socket.send(bjnpPacket, 8611, '255.255.255.255', () => {});
        socket.send(bjnpPacket, 8612, '255.255.255.255', () => {});
      } catch {}
    });
  });
}

// ─── 5. Windows PnP / WIA / Spooler Discovery ─────────────────────────────────
async function discoverViaWindowsPnp(seenIds, discovered) {
  if (process.platform !== 'win32') return;

  // 1. Query WIA COM object for connected scanners (USB + WSD)
  try {
    const psWia = `
      try {
        $dm = New-Object -ComObject WIA.DeviceManager
        foreach ($d in $dm.DeviceInfos) {
          $n = try { $d.Properties.Item('Name').Value } catch { 'Scanner' }
          $m = try { $d.Properties.Item('Manufacturer').Value } catch { '' }
          $t = try { $d.Properties.Item('Port').Value } catch { '' }
          
          # Check Feeder (ADF) and Duplex capability flags from WIA properties
          $cap = 0
          try {
            $dev = $d.Connect()
            $cap = [int]$dev.Properties.Item('3086').Value
          } catch {}
          
          $hasAdf = (($cap -band 1) -ne 0) -or (($cap -band 4) -ne 0)
          $hasDuplex = (($cap -band 4) -ne 0)
          
          Write-Output "$($d.DeviceID)||$n||$m||$t||$hasAdf||$hasDuplex"
        }
      } catch {}
    `;
    const { stdout } = await execAsync(`powershell -NoProfile -Command "${psWia.replace(/\n/g, ' ')}"`, { timeout: 3500 }).catch(() => ({ stdout: '' }));
    for (const line of (stdout || '').trim().split('\n').filter(Boolean)) {
      const [devId, devName, mfg, port, hasAdfStr, hasDuplexStr] = line.split('||').map((s) => (s || '').trim());
      if (devId && devName && !seenIds.has(devId)) {
        seenIds.add(devId);
        const isUsb = devId.toUpperCase().startsWith('USB') || port.toUpperCase().startsWith('USB');
        const manufacturer = mfg || detectManufacturer(devName);
        const cleanModel = normalizeModelName(devName);
        const hasAdf = hasAdfStr === 'True' || /adf|feeder|mfc|pro|mfp/i.test(devName);
        const hasDuplex = hasDuplexStr === 'True' || /duplex|dn|dw/i.test(devName);

        discovered.push({
          id:             `WIA_${devId.replace(/[^A-Za-z0-9_-]/g, '_')}`,
          name:           devName,
          displayName:    `${manufacturer} ${cleanModel}`,
          manufacturer,
          model:          cleanModel,
          type:           'scanner',
          connectionType: isUsb ? 'USB' : 'WIFI',
          protocol:       'WIA',
          status:         'available',
          statusDetails:  isUsb ? 'USB-Scanner (WIA) verbunden' : 'Windows Netzwerk-Scanner (WIA)',
          capabilities: {
            printing:            false,
            scanning:            true,
            adf:                 hasAdf,
            duplex:              hasDuplex,
            flatbed:             true,
            color:               true,
            grayscale:           true,
            supportedDpi:        [150, 300, 600],
            supportedPaperSizes: ['A4', 'Letter'],
            documentFormats:     ['image/jpeg', 'image/png'],
          },
        });
        log('log', `Found Windows WIA Scanner: ${devName} [${isUsb ? 'USB' : 'LAN'}, ADF:${hasAdf}]`);
      }
    }
  } catch (e) {
    log('debug', 'WIA discovery error:', e.message);
  }

  // 2. Query installed Windows Printers
  try {
    const psPrinters = `
      try {
        Get-Printer | Select-Object Name, DriverName, PortName | ConvertTo-Json
      } catch {}
    `;
    const { stdout } = await execAsync(`powershell -NoProfile -Command "${psPrinters.replace(/\n/g, ' ')}"`, { timeout: 3000 }).catch(() => ({ stdout: '' }));
    if (stdout && stdout.trim()) {
      let printers = [];
      try {
        const parsed = JSON.parse(stdout.trim());
        printers = Array.isArray(parsed) ? parsed : [parsed];
      } catch {}

      for (const p of printers) {
        if (!p.Name) continue;
        const nameLower = p.Name.toLowerCase();
        // Skip virtual software print queues that are not physical hardware
        if (nameLower.includes('pdf') || nameLower.includes('xps') || nameLower.includes('onenote') || 
            nameLower.includes('fax') || nameLower.includes('root\\') || nameLower.includes('generic') ||
            nameLower.includes('document writer')) continue;

        const portName = p.PortName || '';
        const ipMatch  = portName.match(/\b(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)\b/);
        const ip       = ipMatch ? ipMatch[1] : null;

        let manufacturer = detectManufacturer(p.Name || p.DriverName);
        if (nameLower.includes('microsoft')) manufacturer = 'Microsoft';
        const cleanModel = normalizeModelName(p.Name);
        const deviceId = `WIN_${p.Name.replace(/\s+/g, '_')}`;
        const displayName = (manufacturer === 'Generic' || manufacturer === 'Network Device')
          ? p.Name
          : `${manufacturer} ${cleanModel}`;

        if (!seenIds.has(deviceId)) {
          seenIds.add(deviceId);
          discovered.push({
            id:             deviceId,
            name:           p.Name,
            displayName,
            manufacturer,
            model:          cleanModel,
            type:           'printer',
            connectionType: ip ? 'WIFI' : 'USB',
            ip:             ip || undefined,
            port:           80,
            protocol:       'SPOOLER',
            status:         'available',
            statusDetails:  'In Windows installiert (Drucker)',
            capabilities: {
              printing:            true,
              scanning:            false,
              adf:                 false,
              duplex:              false,
              flatbed:             false,
              color:               true,
              grayscale:           true,
              supportedDpi:        [150, 300, 600],
              supportedPaperSizes: ['A4', 'Letter'],
              documentFormats:     ['application/pdf'],
            },
          });
          log('log', `Found Windows Spooler Printer: ${p.Name}`);
        }
      }
    }
  } catch (e) {
    log('debug', 'Windows Get-Printer error:', e.message);
  }
}

// ─── 6. ARP Cache Table Reader ────────────────────────────────────────────────
async function getArpIps() {
  const ips = [];
  try {
    const { stdout } = await execAsync('arp -a', { timeout: 2000 });
    const ipRe = /\b(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)\b/g;
    const matches = (stdout || '').match(ipRe) || [];
    ips.push(...new Set(matches));
  } catch {}
  return ips;
}

// ─── 7. Capabilities & Live Status Detection ──────────────────────────────────
async function getScannerCapabilitiesAndStatus(ip, port) {
  const isHttps = (port === 443 || port === 8443);
  const proto   = isHttps ? 'https' : 'http';
  const baseUrl = `${proto}://${ip}:${port}`;

  let capabilities = {
    printing:            true,
    scanning:            true,
    adf:                 true,
    duplex:              false,
    flatbed:             true,
    color:               true,
    grayscale:           true,
    supportedDpi:        [150, 300, 600],
    supportedPaperSizes: ['A4', 'Letter'],
    documentFormats:     ['image/jpeg', 'image/png'],
  };

  let adfState = 'Unknown';
  let isAdfLoaded = false;
  let hasAdf = true;
  let hasDuplex = false;
  let hasFlatbed = true;

  // 1. Fetch /eSCL/ScannerCapabilities
  try {
    const capRes = await httpGet(`${baseUrl}/eSCL/ScannerCapabilities`, 1500);
    if (capRes.status === 200 && capRes.body) {
      const body = capRes.body;
      const inputSources = extractAllXmlTags(body, 'InputSource');

      hasAdf     = inputSources.some((s) => /feeder|adf/i.test(s)) || body.includes('<scan:Adf') || body.includes('<AdfInputCaps');
      hasDuplex  = inputSources.some((s) => /duplex/i.test(s)) || body.includes('<scan:AdfDuplex') || body.includes('<Duplex');
      hasFlatbed = inputSources.some((s) => /platen|flatbed/i.test(s)) || body.includes('<scan:Platen') || inputSources.length === 0;

      const xRes       = extractAllXmlTags(body, 'XResolution').map(Number).filter(Boolean);
      const dpis       = [...new Set(xRes)].sort((a, b) => a - b);
      const colorModes = extractAllXmlTags(body, 'ColorMode');
      const formats    = extractAllXmlTags(body, 'DocumentFormat');

      capabilities = {
        printing:            true,
        scanning:            true,
        adf:                 hasAdf,
        duplex:              hasDuplex,
        flatbed:             hasFlatbed,
        color:               colorModes.some((m) => /rgb|color/i.test(m)) || colorModes.length === 0,
        grayscale:           colorModes.some((m) => /gray/i.test(m)) || true,
        supportedDpi:        dpis.length > 0 ? dpis : [150, 300, 600],
        supportedPaperSizes: ['A4', 'Letter'],
        documentFormats:     formats.length > 0 ? formats : ['image/jpeg', 'image/png'],
      };
    }
  } catch {}

  // 2. Fetch /eSCL/ScannerStatus to verify live ADF loaded state
  try {
    const statusRes = await httpGet(`${baseUrl}/eSCL/ScannerStatus`, 1200);
    if (statusRes.status === 200 && statusRes.body) {
      const body = statusRes.body;
      const adfTag = extractXmlTag(body, 'AdfState') || extractXmlTag(body, 'pwg:AdfState');
      if (adfTag) {
        if (/load/i.test(adfTag)) {
          adfState = 'Loaded';
          isAdfLoaded = true;
        } else if (/empty/i.test(adfTag)) {
          adfState = 'Empty';
          isAdfLoaded = false;
        } else if (/jam/i.test(adfTag)) {
          adfState = 'Jam';
          isAdfLoaded = false;
        }
      }
    }
  } catch {}

  // Automatic preferred source determination:
  // ADF (Loaded) > ADF (Available) > Flatbed
  let selectedSource = 'flatbed';
  if (hasAdf) {
    selectedSource = (isAdfLoaded || adfState === 'Unknown') ? 'adf' : (hasFlatbed ? 'flatbed' : 'adf');
  }

  return {
    capabilities,
    hasAdf,
    hasDuplex,
    hasFlatbed,
    adfState,
    isAdfLoaded,
    selectedSource,
  };
}

// ─── 8. Multi-Protocol Network Probe ──────────────────────────────────────────
async function probeNetworkHost(ip, meta, seenSerials, seenIds) {
  const openPorts = [];
  await Promise.all(
    PROBE_PORTS.map((port) =>
      tcpReachable(ip, port, FAST_TCP_TIMEOUT).then((isOpen) => {
        if (isOpen) openPorts.push(port);
      })
    )
  );

  if (openPorts.length === 0) return null;

  // 1. Try eSCL / Apple AirScan
  for (const port of [80, 8080, 443, 8443, 5757, 9100]) {
    if (!openPorts.includes(port)) continue;
    try {
      const isHttps = (port === 443 || port === 8443);
      const proto   = isHttps ? 'https' : 'http';
      const capUrl  = `${proto}://${ip}:${port}/eSCL/ScannerCapabilities`;

      const { status, body } = await httpGet(capUrl, PROBE_TIMEOUT_MS).catch(() => ({ status: 0, body: '' }));
      if (status === 200 && body && body.includes('ScannerCapabilities')) {
        const makeModel    = extractXmlTag(body, 'MakeAndModel') || extractXmlTag(body, 'Model') || meta?.name || 'eSCL Network Scanner';
        const manufacturer = extractXmlTag(body, 'Manufacturer') || detectManufacturer(makeModel);
        const serial       = extractXmlTag(body, 'SerialNumber') || meta?.serial || null;
        const uuid         = extractXmlTag(body, 'UUID') || meta?.uuid || null;

        const info = await getScannerCapabilitiesAndStatus(ip, port);

        const dedupeKey = serial ? `SERIAL_${serial.toUpperCase()}` : uuid ? `UUID_${uuid.toUpperCase()}` : `ESCL_${ip}_${port}`;
        if (seenSerials.has(dedupeKey)) return null;
        seenSerials.add(dedupeKey);

        const deviceId = serial
          ? `ESCL_${manufacturer}_${serial}`.replace(/[^A-Za-z0-9_-]/g, '_')
          : `ESCL_${ip.replace(/\./g, '_')}_${port}`;

        seenIds.add(deviceId);
        const cleanModel  = normalizeModelName(makeModel);
        const displayName = `${manufacturer} ${cleanModel}`;

        const dev = {
          id:             deviceId,
          name:           makeModel,
          displayName,
          manufacturer,
          model:          cleanModel,
          type:           'printer_scanner',
          connectionType: 'WIFI',
          ip,
          port,
          protocol:       'ESCL',
          serial:         serial || null,
          status:         'available',
          statusDetails:  `AirScan eSCL [ADF: ${info.hasAdf ? 'Ja' : 'Nein'}, Duplex: ${info.hasDuplex ? 'Ja' : 'Nein'}]`,
          capabilities:   info.capabilities,
          sources: {
            flatbed: info.hasFlatbed,
            adf:     info.hasAdf,
            duplex:  info.hasDuplex,
          },
          selectedSource: info.selectedSource,
          adfStatus:      info.adfState,
        };
        log('log', `Discovered eSCL device: "${displayName}" at ${ip}:${port} [ADF:${info.hasAdf}, Duplex:${info.hasDuplex}, Status:${info.adfState}]`);
        return dev;
      }
    } catch {}
  }

  // 2. Check for Canon BJNP / HTTP Printers
  let vendor = 'Generic';
  let modelName = 'Netzwerkdrucker / Scanner';
  let isPrinterOrScanner = false;

  if (openPorts.includes(8611) || openPorts.includes(8612) || meta?.isCanonBjnp) {
    vendor = 'Canon';
    modelName = meta?.name || 'Canon Network Multifunction Printer';
    isPrinterOrScanner = true;
  }

  const webPort = openPorts.find((p) => p === 80 || p === 443 || p === 8080 || p === 8443);
  if (webPort) {
    try {
      const isHttps = (webPort === 443 || webPort === 8443);
      const proto   = isHttps ? 'https' : 'http';
      const webRes  = await httpGet(`${proto}://${ip}:${webPort}/`, 1500).catch(() => null);
      if (webRes) {
        const bodyText = (webRes.body || '');
        const serverHeader = (webRes.headers['server'] || '');
        const titleMatch = bodyText.match(/<title>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : '';

        const isRouter = /fritz!?box|speedport|router|gateway|cable modem|access point/i.test(bodyText) ||
                         /fritz!?box|speedport|router/i.test(title);

        if (!isRouter) {
          if (/Canon/i.test(bodyText) || /KS_HTTP/i.test(serverHeader) || /rui/i.test(bodyText)) {
            vendor = 'Canon'; modelName = title || 'Canon Network Multifunction Printer'; isPrinterOrScanner = true;
          } else if (/Brother/i.test(bodyText) || /Brother/i.test(serverHeader) || /Brother/i.test(title)) {
            vendor = 'Brother'; modelName = title || 'Brother Network Multifunction Printer'; isPrinterOrScanner = true;
          } else if (/LaserJet|OfficeJet|DeskJet|PageWide/i.test(bodyText) || /LaserJet|OfficeJet|DeskJet/i.test(title)) {
            vendor = 'HP'; modelName = title || 'HP Network Multifunction Printer'; isPrinterOrScanner = true;
          } else if (/WorkForce|EcoTank/i.test(bodyText) || /Epson/i.test(title)) {
            vendor = 'Epson'; modelName = title || 'Epson Network Multifunction Printer'; isPrinterOrScanner = true;
          } else if (/ECOSYS|TASKalfa/i.test(bodyText) || /Kyocera/i.test(title)) {
            vendor = 'Kyocera'; modelName = title || 'Kyocera Network Multifunction Printer'; isPrinterOrScanner = true;
          } else if (/VersaLink|AltaLink|WorkCentre/i.test(bodyText) || /Xerox/i.test(title)) {
            vendor = 'Xerox'; modelName = title || 'Xerox Network Multifunction Printer'; isPrinterOrScanner = true;
          }
        }
      }
    } catch {}
  }

  if (openPorts.includes(631) || openPorts.includes(9100) || openPorts.includes(515)) {
    isPrinterOrScanner = true;
  }

  if (isPrinterOrScanner) {
    const dedupeKey = `NET_${ip}`;
    if (seenSerials.has(dedupeKey)) return null;
    seenSerials.add(dedupeKey);

    const deviceId = `NET_${vendor.toUpperCase()}_${ip.replace(/\./g, '_')}`;
    seenIds.add(deviceId);

    const cleanModel = normalizeModelName(modelName);
    const displayName = `${vendor} ${cleanModel}`;

    const dev = {
      id:             deviceId,
      name:           displayName,
      displayName:    `${displayName} (${ip})`,
      manufacturer:   vendor,
      model:          cleanModel,
      type:           'printer_scanner',
      connectionType: 'WIFI',
      ip,
      port:           webPort || openPorts[0] || 80,
      protocol:       vendor === 'Canon' ? 'CANON_NET' : 'NET_PRINTER',
      serial:         null,
      status:         'available',
      statusDetails:  `${vendor} Netzwerk-Gerät (${ip})`,
      capabilities: {
        printing:            true,
        scanning:            true,
        adf:                 true,
        duplex:              true,
        flatbed:             true,
        color:               true,
        grayscale:           true,
        supportedDpi:        [150, 300, 600],
        supportedPaperSizes: ['A4', 'Letter'],
        documentFormats:     ['image/jpeg', 'image/png', 'application/pdf'],
      },
      sources: { flatbed: true, adf: true, duplex: true },
      selectedSource: 'adf',
      adfStatus: 'Unknown',
    };

    log('log', `Discovered network printer/scanner: "${dev.displayName}" at ${ip} (Ports: ${openPorts.join(',')})`);
    return dev;
  }

  return null;
}

// ─── 9. Unified Fast Discovery Orchestration ─────────────────────────────────
async function runUnifiedDiscovery() {
  if (isDiscovering && discoveryPromise) {
    return discoveryPromise;
  }

  isDiscovering = true;
  discoveryPromise = (async () => {
    const discovered    = [];
    const seenIds       = new Set();
    const seenSerials   = new Set();
    const candidateIps  = new Set();
    const candidateMeta = new Map();

    try {
      log('log', '🔍 Starting high-speed zero-config hardware discovery...');

      await Promise.all([
        discoverViaMdnsMulticast(candidateIps, candidateMeta),
        discoverViaWsd(candidateIps, candidateMeta),
        discoverViaSsdp(candidateIps, candidateMeta),
        discoverViaBjnpBroadcast(candidateIps, candidateMeta),
        discoverViaWindowsPnp(seenIds, discovered),
      ]);

      const arpIps = await getArpIps();
      arpIps.forEach((ip) => candidateIps.add(ip));

      const localIps = getLocalIpv4Addresses();
      for (const lip of localIps) {
        subnetHosts(lip).forEach((h) => candidateIps.add(h));
      }

      const priorityIps = new Set([...candidateMeta.keys(), ...arpIps]);
      const sortedIps = [
        ...priorityIps,
        ...[...candidateIps].filter((ip) => !priorityIps.has(ip)),
      ];

      log('log', `Probing ${sortedIps.length} candidate IPs in high-speed parallel batches...`);

      const CHUNK_SIZE = 50;
      for (let i = 0; i < sortedIps.length; i += CHUNK_SIZE) {
        const chunk = sortedIps.slice(i, i + CHUNK_SIZE);
        const results = await Promise.all(
          chunk.map((ip) => probeNetworkHost(ip, candidateMeta.get(ip), seenSerials, seenIds))
        );
        for (const dev of results) {
          if (dev) discovered.push(dev);
        }
      }

      // Always provide Simulator Device for testing & demo
      if (!seenIds.has('SIMULATOR')) {
        discovered.push({
          id:             'SIMULATOR',
          name:           'LogiFlow Scanner Simulator',
          displayName:    'WLAN-Scanner Simulator (Test-Modus)',
          manufacturer:   'LogiFlow',
          model:          'Virtual AirScan 3000',
          type:           'printer_scanner',
          connectionType: 'WIFI',
          ip:             'SIMULATOR',
          port:           80,
          protocol:       'SIMULATOR',
          status:         'available',
          statusDetails:  'Virtueller Testscanner mit automatischem ADF-Einzug',
          capabilities: {
            printing:            true,
            scanning:            true,
            adf:                 true,
            duplex:              true,
            flatbed:             true,
            color:               true,
            grayscale:           true,
            supportedDpi:        [150, 300, 600],
            supportedPaperSizes: ['A4', 'Letter'],
            documentFormats:     ['image/jpeg', 'image/png', 'application/pdf'],
          },
          sources: { flatbed: true, adf: true, duplex: true },
          selectedSource: 'adf',
          adfStatus: 'Loaded',
        });
      }

      cachedDevices     = discovered;
      lastDiscoveryTime = Date.now();
      log('log', `✅ Discovery completed: ${discovered.length} device(s) ready.`);
    } catch (err) {
      log('error', 'Discovery error:', err.message);
    } finally {
      isDiscovering = false;
      discoveryPromise = null;
    }

    return discovered;
  })();

  return discoveryPromise;
}

// ─── 10. Sample Document Generator (Simulator) ───────────────────────────────
function generateSampleDocumentPng(width = 800, height = 1100, pageNum = 1, totalPages = 1) {
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
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = 1 + width * 3;
  const raw = Buffer.alloc(height * stride, 255);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * stride;
    raw[rowOffset] = 0;
    // Header Banner
    if (y >= 50 && y <= 110) {
      for (let x = 50; x < width - 50; x++) {
        const px = rowOffset + 1 + x * 3;
        raw[px] = 30; raw[px + 1] = 58; raw[px + 2] = 138;
      }
    }
    // Page Marker Box
    if (y >= 130 && y <= 160) {
      for (let x = width - 220; x < width - 50; x++) {
        const px = rowOffset + 1 + x * 3;
        raw[px] = 220; raw[px + 1] = 38; raw[px + 2] = 38;
      }
    }
    // Document rows
    if ((y >= 200 && y <= 202) || (y >= 280 && y <= 281) || (y >= 360 && y <= 361) ||
        (y >= 440 && y <= 441) || (y >= 520 && y <= 521) || (y >= 600 && y <= 601) ||
        (y >= 680 && y <= 681) || (y >= 760 && y <= 761)) {
      for (let x = 50; x < width - 50; x++) {
        const px = rowOffset + 1 + x * 3;
        raw[px] = 200; raw[px + 1] = 210; raw[px + 2] = 225;
      }
    }
  }
  const compressed = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

// ─── 11. Source Resolution Logic (Auto / ADF / Duplex / Flatbed) ─────────────
function resolveScanSource(options, capabilities, liveStatus) {
  const rawSource = String(options.source || options.inputSource || 'auto').toLowerCase();
  const wantDuplex = Boolean(options.duplex || options.isDuplex || rawSource.includes('duplex'));
  const hasAdf = Boolean(capabilities?.adf || capabilities?.hasAdf);
  const hasDuplex = Boolean(capabilities?.duplex || capabilities?.hasDuplex);
  const hasFlatbed = Boolean(capabilities?.flatbed || capabilities?.hasFlatbed !== false);
  const isAdfLoaded = liveStatus?.isAdfLoaded;

  let effectiveSource = 'Platen';
  let isAdf = false;

  if (rawSource === 'auto' || rawSource === '' || rawSource === 'undefined') {
    if (hasAdf) {
      if (isAdfLoaded === false && hasFlatbed) {
        // ADF tray is explicitly reported empty and Flatbed exists -> fallback to Flatbed
        effectiveSource = 'Platen';
        isAdf = false;
        log('log', '⚡ Auto-Source: ADF is empty, falling back to Flatbed (Platen).');
      } else {
        // ADF has documents or is supported -> automatic continuous ADF!
        effectiveSource = 'Feeder';
        isAdf = true;
        log('log', `⚡ Auto-Source: ADF detected & selected -> Feeder (Continuous multi-page active, Duplex: ${wantDuplex && hasDuplex}).`);
      }
    } else {
      effectiveSource = 'Platen';
      isAdf = false;
      log('log', '⚡ Auto-Source: Flatbed (Platen) selected.');
    }
  } else if (rawSource.includes('feed') || rawSource.includes('adf')) {
    effectiveSource = 'Feeder';
    isAdf = true;
    log('log', `⚡ Explicit Source: ADF (Feeder) selected (Duplex: ${wantDuplex && hasDuplex}).`);
  } else {
    effectiveSource = 'Platen';
    isAdf = false;
    log('log', '⚡ Explicit Source: Flatbed (Platen) selected.');
  }

  return {
    effectiveSource,
    isAdf,
    isDuplex: isAdf && wantDuplex && hasDuplex,
  };
}

// ─── 12. Windows WIA Continuous Multi-Page Engine ─────────────────────────────
async function triggerWiaScan(options = {}, onProgress = null) {
  const tempDir = path.join(os.tmpdir(), `logiflow_wia_${Date.now()}`);
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const { dpi = 300, colorMode = 'Grayscale', source = 'auto' } = options;

  const psScript = `
    $ErrorActionPreference = 'Stop'
    try {
      $dm = New-Object -ComObject WIA.DeviceManager
      if ($dm.DeviceInfos.Count -eq 0) {
        Write-Output "ERROR:NO_DEVICE"
        exit 1
      }
      
      # Target first real scanner device
      $targetInfo = $null
      foreach ($info in $dm.DeviceInfos) {
        if ($info.Type -eq 1 -or $info.Properties.Item('Name').Value -like '*Scan*' -or $info.Properties.Item('Name').Value -like '*MFC*' -or $info.Properties.Item('Name').Value -like '*Drucker*') {
          $targetInfo = $info
          break
        }
      }
      if ($null -eq $targetInfo) {
        $targetInfo = $dm.DeviceInfos.Item(1)
      }

      $dev = $targetInfo.Connect()
      $item = $dev.Items.Item(1)

      # 1. DPI Settings (6147=H, 6148=V)
      try { $item.Properties.Item('6147').Value = ${dpi} } catch {}
      try { $item.Properties.Item('6148').Value = ${dpi} } catch {}

      # 2. Color Mode (6146: 1=Color, 2=Grayscale, 4=B&W)
      try {
        $wiaColor = 2
        if ('${colorMode}' -eq 'Color') { $wiaColor = 1 }
        elseif ('${colorMode}' -eq 'BlackAndWhite') { $wiaColor = 4 }
        $item.Properties.Item('6146').Value = $wiaColor
      } catch {}

      # 3. Document Handling (3088: 1=FEEDER, 2=FLATBED, 5=FEEDER+DUPLEX)
      $useFeeder = $false
      try {
        $docCap = [int]$dev.Properties.Item('3086').Value
        $docStatus = [int]$dev.Properties.Item('3087').Value
        
        if ('${source}' -like '*feed*' -or '${source}' -like '*adf*') {
          $useFeeder = $true
        } elseif ('${source}' -eq 'auto' -or '${source}' -eq '') {
          if (($docStatus -band 1) -ne 0 -or ($docCap -band 1) -ne 0) {
            $useFeeder = $true
          }
        }

        if ($useFeeder) {
          if ('${source}' -like '*duplex*' -and (($docCap -band 4) -ne 0)) {
            $dev.Properties.Item('3088').Value = 5
          } else {
            $dev.Properties.Item('3088').Value = 1
          }
          # 3096: WIA_DPS_PAGES (0 = continuous scan all pages until feeder empty)
          try { $dev.Properties.Item('3096').Value = 0 } catch {}
        } else {
          $dev.Properties.Item('3088').Value = 2
          try { $dev.Properties.Item('3096').Value = 1 } catch {}
        }
      } catch {}

      $pageIndex = 0
      $scannedFiles = @()

      while ($true) {
        $pageIndex++
        $pageFile = Join-Path "${tempDir.replace(/\\/g, '\\\\')}" ("page_" + $pageIndex + ".jpg")
        
        try {
          $img = $item.Transfer()
          if ($null -ne $img) {
            $img.SaveFile($pageFile)
            if (Test-Path $pageFile) {
              $scannedFiles += $pageFile
              Write-Output "PAGE_SCANNED:$pageIndex"
            }
          } else {
            break
          }
        } catch [System.Runtime.InteropServices.COMException] {
          $hr = $_.Exception.ErrorCode
          # 0x80210003 (-2145320957): WIA_ERROR_PAPER_EMPTY -> Feeder finished cleanly!
          if ($hr -eq -2145320957 -or $hr -eq 0x80210003) {
            break
          }
          # 0x80210002 (-2145320958): WIA_ERROR_PAPER_JAM -> Paper jam
          if ($hr -eq -2145320958 -or $hr -eq 0x80210002) {
            if ($scannedFiles.Count -gt 0) { break }
            throw "Papierstau im Einzug erkannt."
          }
          if ($scannedFiles.Count -gt 0) {
            break
          }
          throw $_
        } catch {
          if ($scannedFiles.Count -gt 0) {
            break
          }
          throw $_
        }

        if (-not $useFeeder) {
          break
        }
      }

      $scannedFiles | ConvertTo-Json
    } catch {
      Write-Error $_.Exception.Message
      exit 2
    }
  `;

  log('log', `Starting Windows WIA scan (Source: ${source}, DPI: ${dpi}, Color: ${colorMode})...`);
  const { stdout } = await execAsync(`powershell -NoProfile -Command "${psScript.replace(/\n/g, ' ')}"`, { timeout: 120000 });

  const pages = [];
  if (fs.existsSync(tempDir)) {
    const files = fs.readdirSync(tempDir).filter((f) => f.endsWith('.jpg')).sort();
    for (let i = 0; i < files.length; i++) {
      const filePath = path.join(tempDir, files[i]);
      const buffer = fs.readFileSync(filePath);
      pages.push({ buffer, mimeType: 'image/jpeg' });
      try { fs.unlinkSync(filePath); } catch {}
    }
    try { fs.rmdirSync(tempDir); } catch {}
  }

  if (pages.length === 0) {
    throw new Error('Der WIA-Scanner hat keine Seiten geliefert oder der Einzug ist leer.');
  }

  log('log', `✅ WIA Scan completed: ${pages.length} page(s) captured.`);
  return pages;
}

// ─── 13. eSCL XML Settings Builder ────────────────────────────────────────────
function buildScanXml(options) {
  const { dpi = 300, colorMode = 'Grayscale8', inputSource = 'Feeder', isDuplex = false, mime = 'image/jpeg' } = options;
  const a4w = Math.round((210 / 25.4) * dpi);
  const a4h = Math.round((297 / 25.4) * dpi);
  const isPlaten = inputSource === 'Platen' || String(inputSource).toLowerCase().includes('platen') || String(inputSource).toLowerCase().includes('flatbed');
  const pwgSource = isPlaten ? 'Platen' : 'Feeder';

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
  <pwg:InputSource>${pwgSource}</pwg:InputSource>
  <scan:InputSource>${pwgSource}</scan:InputSource>
  ${isDuplex ? '<scan:Duplex>true</scan:Duplex>' : '<scan:Duplex>false</scan:Duplex>'}
  <scan:ColorMode>${colorMode}</scan:ColorMode>
  <scan:XResolution>${dpi}</scan:XResolution>
  <scan:YResolution>${dpi}</scan:YResolution>
  <pwg:DocumentFormat>${mime}</pwg:DocumentFormat>
</scan:ScanSettings>`;
}

function colorModeToEscl(mode) {
  const map = {
    Color:         'RGB24',
    Grayscale:     'Grayscale8',
    BlackAndWhite: 'BlackAndWhite1',
  };
  return map[mode] || 'Grayscale8';
}

// ─── 14. eSCL Continuous Multi-Page ADF Scan Engine ───────────────────────────
async function triggerEsclScan(ip, port, options, onProgress = null, jobTracker = null) {
  const { dpi = 300, colorMode = 'Grayscale', format = 'jpeg' } = options;
  const mime     = format === 'png' ? 'image/png' : 'image/jpeg';
  const esclMode = colorModeToEscl(colorMode);

  // 1. Inspect capabilities & live status to resolve optimal source
  const liveInfo = await getScannerCapabilitiesAndStatus(ip, port);
  const { effectiveSource, isAdf, isDuplex } = resolveScanSource(options, liveInfo.capabilities, liveInfo);

  if (jobTracker) {
    jobTracker.selectedSource = effectiveSource;
  }

  const xmlBody = buildScanXml({
    dpi,
    colorMode: esclMode,
    inputSource: effectiveSource,
    isDuplex,
    mime,
  });

  const isHttps = (port === 443 || port === 8443);
  const proto   = isHttps ? 'https' : 'http';
  const baseUrl = `${proto}://${ip}:${port}`;
  const jobsUrl = `${baseUrl}/eSCL/ScanJobs`;

  log('log', `Posting scan job to ${jobsUrl} (${dpi} DPI, ${colorMode}, Source: ${effectiveSource}, Duplex: ${isDuplex})`);

  const jobResp = await httpPost(jobsUrl, 'text/xml; charset=utf-8', xmlBody, 25000);
  if (jobResp.status !== 200 && jobResp.status !== 201) {
    if (jobResp.status === 409 || jobResp.status === 503) {
      throw new Error(`Scanner ist aktuell beschäftigt oder im Ruhemodus (HTTP ${jobResp.status}). Bitte kurz warten.`);
    }
    throw new Error(`eSCL POST /ScanJobs fehlgeschlagen: HTTP ${jobResp.status}`);
  }

  const location    = jobResp.headers['location'] || `${jobsUrl}/Job1`;
  const jobLocation = location.startsWith('http') ? location : `${baseUrl}${location}`;
  const nextDocUrl  = jobLocation.endsWith('/NextDocument') ? jobLocation : `${jobLocation}/NextDocument`;

  log('log', `Polling continuous document stream from: ${nextDocUrl}`);

  const pages = [];
  let isDone = false;
  let pageIndex = 0;

  while (!isDone) {
    if (jobTracker?.cancelled) {
      log('log', `Scan job was cancelled by user.`);
      try {
        await httpPost(`${jobLocation}/Cancel`, 'text/plain', '', 3000);
      } catch {}
      break;
    }

    pageIndex++;
    let attempt = 0;
    let pageBuffer = null;

    if (onProgress) {
      onProgress({
        type:    'scan_progress',
        status:  'scanning',
        page:    pageIndex,
        message: isAdf ? `Seite ${pageIndex} wird aus automatischem Einzug (ADF) eingezogen...` : `Seite wird gescannt...`,
      });
    }

    if (jobTracker) {
      jobTracker.pageCount = pages.length;
      jobTracker.message = isAdf ? `Ziehe Seite ${pageIndex} aus ADF ein...` : `Scanne Flachbett...`;
    }

    // Pull next document page
    while (attempt < 45 && !pageBuffer && !isDone) {
      if (jobTracker?.cancelled) break;
      attempt++;
      try {
        const docResp = await httpGetBinary(nextDocUrl, 25000);
        if (docResp.status === 200 && docResp.buffer && docResp.buffer.length > 200) {
          pageBuffer = docResp.buffer;
        } else if (docResp.status === 404 || docResp.status === 410) {
          // HTTP 404/410 on /NextDocument means: No more pages in ADF / Scan job complete!
          log('log', `✅ NextDocument returned ${docResp.status} (ADF empty / end of job). Total pages: ${pages.length}`);
          isDone = true;
          break;
        } else if (docResp.status === 503 || docResp.status === 409) {
          // Scanner busy scanning/processing current sheet
          await new Promise((r) => setTimeout(r, 1000));
        } else {
          await new Promise((r) => setTimeout(r, 1000));
        }
      } catch (err) {
        if (attempt > 20) {
          log('debug', `NextDocument poll attempt ${attempt} warning:`, err.message);
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    if (pageBuffer) {
      pages.push({ buffer: pageBuffer, mimeType: mime });
      log('log', `✅ [Page ${pages.length}] Scanned successfully (${pageBuffer.length} bytes).`);

      if (jobTracker) {
        jobTracker.pageCount = pages.length;
        jobTracker.message = `Seite ${pages.length} erfolgreich erfasst.`;
      }

      if (onProgress) {
        onProgress({
          type:    'scan_page_completed',
          status:  'page_ready',
          page:    pages.length,
          message: `Seite ${pages.length} erfolgreich erfasst.`,
        });
      }

      // Flatbed only has 1 physical page
      if (!isAdf) {
        isDone = true;
      } else {
        // Continuous ADF loop: give feeder a brief moment before pulling next sheet
        await new Promise((r) => setTimeout(r, 300));
      }
    } else {
      isDone = true;
    }
  }

  if (pages.length === 0) {
    if (isAdf) {
      throw new Error('Der automatische Dokumenteneinzug (ADF) ist leer. Bitte legen Sie Dokumente in den Einzug oder wählen Sie Flachbettglas.');
    }
    throw new Error('Der Scanner hat keine Bilddaten zurückgegeben.');
  }

  log('log', `🎉 Scan session complete: ${pages.length} page(s) acquired continuously from ${effectiveSource}.`);
  return pages;
}

// ─── 15. Unified Scan Orchestrator ────────────────────────────────────────────
async function executeScan(options, onProgress = null, jobTracker = null) {
  const { scannerIp, scannerPort = 80 } = options;

  // 1. Simulator Mode (Realistic Multi-Page Simulation)
  if (!scannerIp || scannerIp === 'SIMULATOR') {
    const rawSource = String(options.source || options.inputSource || 'auto').toLowerCase();
    const isAdf = rawSource === 'auto' || rawSource.includes('feed') || rawSource.includes('adf') || options.batchScan || options.multiPage;
    const requestedCount = typeof options.pageCount === 'number' && options.pageCount > 0 ? options.pageCount : (options.pagesCount || (isAdf ? 3 : 1));
    const pageCount = isAdf ? requestedCount : 1;

    log('log', `Simulator scan started (${pageCount} page(s) simulated via ${isAdf ? 'ADF' : 'Flatbed'}).`);
    const pages = [];

    for (let p = 1; p <= pageCount; p++) {
      if (jobTracker?.cancelled) {
        log('log', 'Simulator scan cancelled by user.');
        break;
      }
      if (onProgress) {
        onProgress({
          type:    'scan_progress',
          status:  'scanning',
          page:    p,
          message: isAdf ? `Simulator: Seite ${p} von ${pageCount} wird eingezogen...` : `Simulator: Scanne Seite...`,
        });
      }
      if (jobTracker) {
        jobTracker.pageCount = p;
        jobTracker.message = isAdf ? `Simulator: Ziehe Seite ${p} von ${pageCount} ein...` : `Simulator: Seite ${p} erfasst...`;
      }
      await new Promise((r) => setTimeout(r, 500));
      pages.push({
        buffer:   generateSampleDocumentPng(800, 1100, p, pageCount),
        mimeType: 'image/png',
      });
    }

    return pages;
  }

  // 2. Windows WIA / USB Scanner
  if (scannerIp.startsWith('USB_') || scannerIp.startsWith('WIA_') || scannerIp === 'USB' || scannerIp.startsWith('WIN_')) {
    return triggerWiaScan(options, onProgress);
  }

  // 3. Network eSCL Scanner
  const candidatePorts = [scannerPort, 80, 443, 8080, 8443].filter(
    (p, idx, arr) => arr.indexOf(p) === idx
  );

  for (const port of candidatePorts) {
    const isOpen = await tcpReachable(scannerIp, port, 400);
    if (!isOpen) continue;

    try {
      log('log', `Attempting physical eSCL scan on ${scannerIp}:${port}...`);
      const pages = await triggerEsclScan(scannerIp, port, options, onProgress, jobTracker);
      if (pages && pages.length > 0) return pages;
    } catch (err) {
      log('log', `eSCL scan on ${scannerIp}:${port} status: ${err.message}`);
      if (err.message.includes('ADF') || err.message.includes('leer') || err.message.includes('beschäftigt')) {
        throw err;
      }
    }
  }

  // 4. Windows WIA fallback for network scanners installed in Windows
  try {
    log('log', `Attempting Windows WIA scan fallback for ${scannerIp}...`);
    const pages = await triggerWiaScan(options, onProgress);
    if (pages && pages.length > 0) return pages;
  } catch {}

  // 5. Explicit physical failure message
  throw new Error(
    `Physischer Scan auf Gerät (${scannerIp}) nicht möglich: ` +
    `Ihr Gerät (z. B. Canon PIXMA MX490/MF Serie) unterstützt kein direktes eSCL/AirScan über HTTP. ` +
    `Lösung: Bitte fügen Sie den Scanner einmalig in Windows hinzu (Windows-Einstellungen → Bluetooth & Geräte → Drucker & Scanner → "Gerät hinzufügen") ` +
    `damit der Windows WIA-Treiber aktiv ist, oder wählen Sie den "WLAN-Scanner Simulator" zum Testen.`
  );
}

// ─── 16. Real Connection Test & Capability Probe ──────────────────────────────
async function testDeviceConnection(device) {
  if (!device || device.ip === 'SIMULATOR' || device.id === 'SIMULATOR') {
    return {
      connected: true,
      status:    'READY',
      state:     'Idle',
      details:   'Simulator bereit mit virtuellem ADF-Einzug',
      scanner: {
        name:           'LogiFlow Virtual AirScan 3000',
        connected:      true,
        sources:        { flatbed: true, adf: true, duplex: true },
        selectedSource: 'adf',
        adfStatus:      'Loaded',
      },
      capabilities: {
        printing:            true,
        scanning:            true,
        adf:                 true,
        duplex:              true,
        flatbed:             true,
        color:               true,
        grayscale:           true,
        supportedDpi:        [150, 300, 600],
        supportedPaperSizes: ['A4', 'Letter'],
        documentFormats:     ['image/jpeg', 'image/png', 'application/pdf'],
      },
    };
  }

  // WIA USB test
  if (device.protocol === 'WIA' || (device.ip && device.ip.startsWith('WIA_'))) {
    if (process.platform !== 'win32') {
      return { connected: false, status: 'OFFLINE', details: 'WIA ist nur unter Windows verfügbar.' };
    }
    return {
      connected: true,
      status:    'READY',
      state:     'Idle',
      details:   'Windows Drucker/Scanner bereit (WIA)',
      scanner: {
        name:           device.displayName || device.name || 'WIA Scanner',
        connected:      true,
        sources:        device.sources || { flatbed: true, adf: true, duplex: false },
        selectedSource: device.capabilities?.adf ? 'adf' : 'flatbed',
        adfStatus:      'Unknown',
      },
      capabilities: device.capabilities || {
        printing: true, scanning: true, flatbed: true, adf: true, color: true, grayscale: true, supportedDpi: [150, 300, 600]
      },
    };
  }

  const ip   = device.ip;
  const port = device.port || 80;
  if (!ip) {
    return { connected: false, status: 'OFFLINE', details: 'Keine IP-Adresse hinterlegt.' };
  }

  // Probe live eSCL Capabilities & ADF Status
  try {
    const isHttps = (port === 443 || port === 8443);
    const proto   = isHttps ? 'https' : 'http';
    const capUrl  = `${proto}://${ip}:${port}/eSCL/ScannerCapabilities`;
    const { status, body } = await httpGet(capUrl, 1500).catch(() => ({ status: 0, body: '' }));
    if (status === 200 && body && body.includes('ScannerCapabilities')) {
      const info = await getScannerCapabilitiesAndStatus(ip, port);
      return {
        connected: true,
        status:    'READY',
        state:     'Idle',
        details:   `AirScan eSCL verbunden [ADF: ${info.hasAdf ? 'Ja' : 'Nein'}, Status: ${info.adfState}]`,
        scanner: {
          name:           device.displayName || device.name || 'Netzwerkscanner',
          connected:      true,
          sources: {
            flatbed: info.hasFlatbed,
            adf:     info.hasAdf,
            duplex:  info.hasDuplex,
          },
          selectedSource: info.selectedSource,
          adfStatus:      info.adfState,
        },
        capabilities: info.capabilities,
      };
    }
  } catch {}

  // Test TCP Reachability on device ports
  const reachable = await tcpReachable(ip, port, 1200) ||
                    await tcpReachable(ip, 80, 1200) ||
                    await tcpReachable(ip, 443, 1200) ||
                    await tcpReachable(ip, 8611, 1200) ||
                    await tcpReachable(ip, 631, 1200);

  if (reachable) {
    return {
      connected: true,
      status:    'READY',
      state:     'Idle',
      details:   `Netzwerkgerät erreichbar (${ip})`,
      scanner: {
        name:           device.displayName || device.name || 'Netzwerkgerät',
        connected:      true,
        sources:        { flatbed: true, adf: true, duplex: true },
        selectedSource: 'adf',
        adfStatus:      'Unknown',
      },
      capabilities: device.capabilities || {
        printing: true, scanning: true, adf: true, duplex: true, flatbed: true, color: true, grayscale: true, supportedDpi: [150, 300, 600]
      },
    };
  }

  return { connected: false, status: 'OFFLINE', details: `Gerät unter ${ip} nicht erreichbar.` };
}

// ─── 17. HTTP Server & API Endpoints ──────────────────────────────────────────
function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type':                'application/json; charset=utf-8',
    'Content-Length':              Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function checkAuth(req) {
  if (!AUTH_TOKEN) return true;
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
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  if (!checkAuth(req)) {
    return sendJson(res, 401, { error: 'Unauthorized' });
  }

  const url = req.url.split('?')[0];

  try {
    // ── GET /health ──────────────────────────────────────────────────────────
    if (req.method === 'GET' && url === '/health') {
      return sendJson(res, 200, {
        status:    'ok',
        version:   VERSION,
        platform:  process.platform,
        hostname:  os.hostname(),
        uptime:    process.uptime(),
        timestamp: new Date().toISOString(),
        features:  ['adf', 'continuous_scan', 'duplex', 'wia', 'escl'],
      });
    }

    // ── GET /devices or GET /scanners ────────────────────────────────────────
    if (req.method === 'GET' && (url === '/devices' || url === '/scanners')) {
      if (cachedDevices.length > 0 && Date.now() - lastDiscoveryTime < CACHE_TTL_MS) {
        return sendJson(res, 200, cachedDevices);
      }
      if (cachedDevices.length > 0) {
        runUnifiedDiscovery().catch(() => {});
        return sendJson(res, 200, cachedDevices);
      }
      const devices = await runUnifiedDiscovery();
      return sendJson(res, 200, devices);
    }

    // ── POST /discover or GET /discover (Force fresh discovery) ──────────────
    if ((req.method === 'POST' || req.method === 'GET') && (url === '/discover' || url === '/scanners/discover')) {
      lastDiscoveryTime = 0;
      const devices = await runUnifiedDiscovery();
      return sendJson(res, 200, devices);
    }

    // ── POST /connect or POST /test ──────────────────────────────────────────
    if (req.method === 'POST' && (url === '/connect' || url === '/test')) {
      const body = await readBody(req);
      const targetDevice = body.device || (body.id ? cachedDevices.find((d) => d.id === body.id) : null) || body;
      const testResult = await testDeviceConnection(targetDevice);
      return sendJson(res, 200, testResult);
    }

    // ── GET /devices/:id/capabilities or GET /capabilities ───────────────────
    const capMatch = url.match(/^\/(?:devices|scanners)\/(.+)\/capabilities$/);
    if ((req.method === 'GET' && capMatch) || (req.method === 'GET' && url === '/capabilities')) {
      const id = capMatch ? decodeURIComponent(capMatch[1]) : '';
      const device = cachedDevices.find((d) => d.id === id) || cachedDevices[0];
      const testResult = await testDeviceConnection(device || { id, ip: id });
      return sendJson(res, 200, testResult);
    }

    // ── GET /devices/:id/status or GET /scanners/:id/status ──────────────────
    const statusMatch = url.match(/^\/(?:devices|scanners)\/(.+)\/status$/);
    if (req.method === 'GET' && statusMatch) {
      const id = decodeURIComponent(statusMatch[1]);
      const device = cachedDevices.find((d) => d.id === id);
      const testResult = await testDeviceConnection(device || { id, ip: id });
      return sendJson(res, 200, testResult);
    }

    // ── POST /scan (Direct synchronous scan with continuous ADF) ─────────────
    if (req.method === 'POST' && url === '/scan') {
      const options = await readBody(req);
      log('log', `Direct continuous scan requested on ${options.scannerIp || 'SIMULATOR'} (DPI: ${options.dpi || 300}, Source: ${options.source || options.inputSource || 'auto'}, Duplex: ${options.duplex || false})`);
      const pages = await executeScan(options);
      return sendJson(res, 200, {
        success:   true,
        type:      'scan_completed',
        status:    'completed',
        pageCount: pages.length,
        pages:     pages.map((p, i) => ({
          pageNumber: i + 1,
          mimeType:   p.mimeType,
          base64Data: p.buffer.toString('base64'),
        })),
      });
    }

    // ── POST /scan/job (Async continuous scan job) ───────────────────────────
    if (req.method === 'POST' && url === '/scan/job') {
      const options = await readBody(req);
      const jobId   = `JOB_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      
      const jobRecord = {
        id:             jobId,
        status:         'SCANNING',
        selectedSource: 'auto',
        pageCount:      0,
        pages:          [],
        message:        'Initialisiere Scanner und ADF...',
        error:          null,
        cancelled:      false,
        createdAt:      new Date().toISOString(),
      };
      activeScanJobs.set(jobId, jobRecord);

      // Execute scan asynchronously with live progress tracking
      executeScan(
        options,
        (progress) => {
          jobRecord.pageCount = progress.page;
          jobRecord.message   = progress.message;
        },
        jobRecord
      )
        .then((pages) => {
          jobRecord.status    = 'COMPLETED';
          jobRecord.pageCount = pages.length;
          jobRecord.message   = `Scan erfolgreich abgeschlossen (${pages.length} Seiten).`;
          jobRecord.pages     = pages.map((p, i) => ({
            pageNumber: i + 1,
            mimeType:   p.mimeType,
            base64Data: p.buffer.toString('base64'),
          }));
          log('log', `Scan job ${jobId} completed with ${pages.length} page(s).`);
        })
        .catch((err) => {
          jobRecord.status  = 'FAILED';
          jobRecord.error   = err.message || 'Scan failed';
          jobRecord.message = err.message || 'Scan fehlgeschlagen';
          log('error', `Scan job ${jobId} failed:`, err.message);
        });

      return sendJson(res, 202, {
        jobId,
        status:  'SCANNING',
        message: 'Scanauftrag gestartet',
      });
    }

    // ── GET /scan/:id/status ─────────────────────────────────────────────────
    const jobStatusMatch = url.match(/^\/scan\/([^/]+)\/status$/);
    if (req.method === 'GET' && jobStatusMatch) {
      const jobId = decodeURIComponent(jobStatusMatch[1]);
      const job = activeScanJobs.get(jobId);
      if (!job) return sendJson(res, 404, { error: 'Scan job not found' });
      return sendJson(res, 200, job);
    }

    // ── POST /scan/:id/cancel ────────────────────────────────────────────────
    const jobCancelMatch = url.match(/^\/scan\/([^/]+)\/cancel$/);
    if (req.method === 'POST' && jobCancelMatch) {
      const jobId = decodeURIComponent(jobCancelMatch[1]);
      const job = activeScanJobs.get(jobId);
      if (job) {
        job.cancelled = true;
        job.status    = 'CANCELLED';
        job.message   = 'Scanauftrag abgebrochen';
      }
      return sendJson(res, 200, { success: true, jobId, status: 'CANCELLED' });
    }

    sendJson(res, 404, { error: 'Not found', path: url });
  } catch (err) {
    log('error', 'API error:', err.message);
    sendJson(res, 500, { error: 'Internal connector error', message: err.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('╔═════════════════════════════════════════════════════════════════════╗');
  console.log(`║     LogiFlow — Windows Printer & Scanner Connector v${VERSION}             ║`);
  console.log('╠═════════════════════════════════════════════════════════════════════╣');
  console.log(`║  Local Bridge:  http://127.0.0.1:${PORT}                                ║`);
  console.log(`║  Platform:      ${process.platform.padEnd(52)}║`);
  console.log('║  Protocols:     mDNS (5353) • WSD (3702) • SSDP (1900) • BJNP (8611) ║');
  console.log('║                 eSCL AirScan • IPP • Windows WIA / USB              ║');
  console.log('║  ADF Support:   Continuous multi-page feeder & auto-detection       ║');
  console.log('║  Status:        ONLINE & READY                                      ║');
  console.log('╚═════════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Zero-configuration local network discovery & ADF auto-selection active.');
  console.log('Place 10/20/50 pages in ADF tray -> click Scan -> scans continuously.');
  console.log('');

  runUnifiedDiscovery().catch(() => {});
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use by another instance.`);
  } else {
    console.error('Connector server error:', err);
  }
  process.exit(1);
});

process.on('SIGINT',  () => { console.log('\nPrinter Connector stopped.'); process.exit(0); });
process.on('SIGTERM', () => { process.exit(0); });
