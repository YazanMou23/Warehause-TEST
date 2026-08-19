#!/usr/bin/env node
/**
 * LogiFlow — Zero-Configuration Local Scanner & Printer Discovery Agent
 * ======================================================================
 * Runs on the user's PC/laptop to provide true zero-configuration hardware discovery
 * across local Wi-Fi and USB connections (Brother, HP, Canon, Epson, Lexmark, Xerox, etc.).
 *
 * Protocols supported:
 *  - mDNS / DNS-SD (UDP 224.0.0.251:5353) — _uscan, _uscans, _scanner, _ipp, _ipps, _printer
 *  - WS-Discovery (UDP 239.255.255.250:3702) — Web Services on Devices (WSD / DPWS)
 *  - SSDP / UPnP (UDP 239.255.255.250:1900) — Simple Service Discovery Protocol
 *  - Windows WIA & PnP (USB Cable & OS Spooler Printers)
 *  - eSCL / AirScan (HTTP/HTTPS REST Scanner Protocol on ports 80, 8080, 443, 8443, 5757, 9100)
 *
 * Local Server: HTTP/1.1 on 127.0.0.1:48281
 * Zero external npm dependencies — pure Node.js built-ins only.
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
const PORT             = parseInt(process.env.SCANNER_AGENT_PORT || '48281', 10);
const AUTH_TOKEN       = process.env.SCANNER_AGENT_TOKEN || '';
const ESCL_PORTS       = [80, 8080, 443, 8443, 5757, 9100];
const PROBE_TIMEOUT_MS = 1400;
const CACHE_TTL_MS     = 30_000;
const MULTICAST_WAIT   = 2200; // ms to listen for mDNS / WSD / SSDP responses

// ─── State ────────────────────────────────────────────────────────────────────
let cachedDevices     = [];
let lastDiscoveryTime = 0;
let isDiscovering     = false;

// ─── Logging ──────────────────────────────────────────────────────────────────
function log(level, ...args) {
  const ts = new Date().toISOString().slice(11, 19);
  console[level](`[${ts}] [Scanner-Agent]`, ...args);
}

// ─── XML & String Helpers ─────────────────────────────────────────────────────
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
  if (n.includes('BROTHER')) return 'Brother';
  if (n.includes('HP') || n.includes('HEWLETT')) return 'HP';
  if (n.includes('CANON')) return 'Canon';
  if (n.includes('EPSON')) return 'Epson';
  if (n.includes('LEXMARK')) return 'Lexmark';
  if (n.includes('XEROX')) return 'Xerox';
  if (n.includes('KYOCERA')) return 'Kyocera';
  if (n.includes('RICOH')) return 'Ricoh';
  if (n.includes('SAMSUNG')) return 'Samsung';
  if (n.includes('PANASONIC')) return 'Panasonic';
  if (n.includes('OKI')) return 'OKI';
  return 'Network Device';
}

function normalizeModelName(makeAndModel, fallback = 'Scanner') {
  if (!makeAndModel) return fallback;
  return makeAndModel
    .replace(/^(Brother|HP|Hewlett-Packard|Canon|Epson|Lexmark|Xerox|Kyocera|Ricoh)\s+/i, (m) => `${m.trim()} `)
    .trim();
}

// ─── Network Socket Helpers ───────────────────────────────────────────────────
function tcpReachable(ip, port, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const sock  = new net.Socket();
    const timer = setTimeout(() => { sock.destroy(); resolve(false); }, timeoutMs);
    sock.once('connect', () => { clearTimeout(timer); sock.destroy(); resolve(true); });
    sock.once('error',   () => { clearTimeout(timer); resolve(false); });
    sock.connect(port, ip);
  });
}

function httpGet(url, timeoutMs = 3500) {
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

function httpPost(url, contentType, body, timeoutMs = 20000) {
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

function httpGetBinary(url, timeoutMs = 15000) {
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

// ─── 1. True UDP Multicast mDNS / DNS-SD Engine ──────────────────────────────
function buildDnsQueryPacket(serviceNames) {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(0x0000, 0); // ID = 0 (standard for mDNS)
  header.writeUInt16BE(0x0000, 2); // Flags: standard query
  header.writeUInt16BE(serviceNames.length, 4); // QDCOUNT
  header.writeUInt16BE(0, 6); // ANCOUNT
  header.writeUInt16BE(0, 8); // NSCOUNT
  header.writeUInt16BE(0, 10); // ARCOUNT

  const questionBuffers = [];
  for (const name of serviceNames) {
    const parts = name.split('.');
    const qnameParts = [];
    for (const part of parts) {
      const pBuf = Buffer.from(part, 'utf8');
      qnameParts.push(Buffer.from([pBuf.length]), pBuf);
    }
    qnameParts.push(Buffer.from([0x00])); // Null terminator
    const typeClass = Buffer.alloc(4);
    typeClass.writeUInt16BE(12, 0); // QTYPE = PTR (12)
    typeClass.writeUInt16BE(1, 2);  // QCLASS = IN (1)
    questionBuffers.push(Buffer.concat([...qnameParts, typeClass]));
  }

  return Buffer.concat([header, ...questionBuffers]);
}

function parseDnsStrings(buffer) {
  const strings = [];
  let cur = '';
  for (let i = 0; i < buffer.length; i++) {
    const ch = buffer[i];
    if (ch >= 32 && ch <= 126) {
      cur += String.fromCharCode(ch);
    } else {
      if (cur.length >= 4) strings.push(cur);
      cur = '';
    }
  }
  if (cur.length >= 4) strings.push(cur);
  return strings;
}

async function discoverViaMdnsMulticast(discoveredIps, candidateMeta) {
  const serviceTypes = [
    '_uscan._tcp.local',
    '_uscans._tcp.local',
    '_scanner._tcp.local',
    '_ipp._tcp.local',
    '_ipps._tcp.local',
    '_pdl-datastream._tcp.local',
    '_printer._tcp.local',
    '_http._tcp.local',
  ];

  const packet = buildDnsQueryPacket(serviceTypes);

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

    socket.on('error', (err) => {
      log('debug', 'mDNS socket error:', err.message);
      clearTimeout(timer);
      try { socket.close(); } catch {}
      resolve();
    });

    socket.on('message', (msg, rinfo) => {
      if (rinfo.address && !rinfo.address.startsWith('127.')) {
        discoveredIps.add(rinfo.address);
        const parsed = parseDnsStrings(msg);
        const joined = parsed.join(' ');
        
        let foundName = null;
        for (const s of parsed) {
          if (/brother|officejet|laserjet|deskjet|pixma|ecotank|workforce|imageclass|imagerunner|color laser/i.test(s)) {
            foundName = s.replace(/_uscan\._tcp\.local|_ipp\._tcp\.local/i, '').trim();
            break;
          }
        }

        let serial = null;
        const serMatch = joined.match(/(?:ser|serial|serialnumber)[=:]([A-Za-z0-9_-]+)/i);
        if (serMatch) serial = serMatch[1];

        if (foundName || serial) {
          candidateMeta.set(rinfo.address, {
            name: foundName,
            serial,
            protocolHint: 'mDNS/Bonjour',
          });
        }
      }
    });

    socket.bind(0, () => {
      try {
        socket.setBroadcast(true);
        socket.setMulticastTTL(255);
        socket.send(packet, 0, packet.length, 5353, '224.0.0.251', (err) => {
          if (err) log('debug', 'mDNS send error:', err.message);
        });
      } catch (err) {
        log('debug', 'mDNS setup error:', err.message);
      }
    });
  });
}

// ─── 2. WS-Discovery (WSD / DPWS) Engine ─────────────────────────────────────
async function discoverViaWsd(discoveredIps, candidateMeta) {
  const probeMessage = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
               xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing"
               xmlns:wsd="http://schemas.xmlsoap.org/ws/2005/04/discovery"
               xmlns:wprt="http://schemas.microsoft.com/windows/2006/08/wdp/print"
               xmlns:wscn="http://schemas.microsoft.com/windows/2006/08/wdp/scan">
  <soap:Header>
    <wsa:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</wsa:To>
    <wsa:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</wsa:Action>
    <wsa:MessageID>urn:uuid:${crypto.randomUUID()}</wsa:MessageID>
  </soap:Header>
  <soap:Body>
    <wsd:Probe>
      <wsd:Types>wsd:Device</wsd:Types>
    </wsd:Probe>
  </soap:Body>
</soap:Envelope>`;

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
        const text = msg.toString('utf8');
        const endpoint = extractXmlTag(text, 'Address') || extractXmlTag(text, 'EndpointReference');
        const xaddrs   = extractXmlTag(text, 'XAddrs') || '';
        const types    = extractXmlTag(text, 'Types') || '';

        const uuidMatch = (endpoint || text).match(/urn:uuid:([0-9a-fA-F-]+)/i);
        const uuid = uuidMatch ? uuidMatch[1] : null;

        if (uuid || xaddrs || /print|scan/i.test(types)) {
          candidateMeta.set(rinfo.address, {
            ...(candidateMeta.get(rinfo.address) || {}),
            uuid,
            xaddrs,
            isWsd: true,
          });
        }
      }
    });

    socket.bind(0, () => {
      try {
        socket.setBroadcast(true);
        socket.setMulticastTTL(4);
        const buf = Buffer.from(probeMessage, 'utf8');
        socket.send(buf, 0, buf.length, 3702, '239.255.255.250', () => {});
      } catch {}
    });
  });
}

// ─── 3. SSDP / UPnP Discovery Engine ──────────────────────────────────────────
async function discoverViaSsdp(discoveredIps, candidateMeta) {
  const msg = [
    'M-SEARCH * HTTP/1.1',
    'HOST: 239.255.255.250:1900',
    'MAN: "ssdp:discover"',
    'MX: 2',
    'ST: ssdp:all',
    '',
    '',
  ].join('\r\n');

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

    socket.on('message', (buf, rinfo) => {
      if (rinfo.address && !rinfo.address.startsWith('127.')) {
        const text = buf.toString('utf8');
        if (/printer|scanner|print|scan|escl|airprint|mfp/i.test(text)) {
          discoveredIps.add(rinfo.address);
          const locationMatch = text.match(/LOCATION:\s*(http[^\r\n]+)/i);
          if (locationMatch) {
            candidateMeta.set(rinfo.address, {
              ...(candidateMeta.get(rinfo.address) || {}),
              ssdpLocation: locationMatch[1].trim(),
            });
          }
        }
      }
    });

    socket.bind(0, () => {
      try {
        socket.setBroadcast(true);
        socket.setMulticastTTL(2);
        const b = Buffer.from(msg, 'utf8');
        socket.send(b, 0, b.length, 1900, '239.255.255.250', () => {});
      } catch {}
    });
  });
}

// ─── 4. Windows PnP / WIA / Spooler Discovery ─────────────────────────────────
async function discoverViaWindowsPnp(seenIds, discovered) {
  if (process.platform !== 'win32') return;

  // Query WIA COM object for connected scanners (USB + WSD)
  try {
    const psWia = `
      try {
        $dm = New-Object -ComObject WIA.DeviceManager
        foreach ($d in $dm.DeviceInfos) {
          $n = try { $d.Properties.Item('Name').Value } catch { 'Scanner' }
          $m = try { $d.Properties.Item('Manufacturer').Value } catch { '' }
          $t = try { $d.Properties.Item('Port').Value } catch { '' }
          Write-Output "$($d.DeviceID)||$n||$m||$t"
        }
      } catch {}
    `;
    const { stdout } = await execAsync(`powershell -NoProfile -Command "${psWia.replace(/\n/g, ' ')}"`, { timeout: 4500 }).catch(() => ({ stdout: '' }));
    for (const line of (stdout || '').trim().split('\n').filter(Boolean)) {
      const [devId, devName, mfg, port] = line.split('||').map((s) => (s || '').trim());
      if (devId && devName && !seenIds.has(devId)) {
        seenIds.add(devId);
        const isUsb = devId.toUpperCase().startsWith('USB') || port.toUpperCase().startsWith('USB');
        const manufacturer = mfg || detectManufacturer(devName);
        discovered.push({
          id:             `WIA_${devId.replace(/[^A-Za-z0-9_-]/g, '_')}`,
          name:           devName,
          displayName:    `${manufacturer} ${devName}`.replace(`${manufacturer} ${manufacturer}`, manufacturer),
          manufacturer,
          model:          devName,
          type:           'scanner',
          connectionType: isUsb ? 'USB' : 'WIFI',
          protocol:       'WIA',
          status:         'available',
          statusDetails:  isUsb ? 'USB-Scanner (WIA) verbunden' : 'Windows Netzwerk-Scanner (WIA)',
          capabilities: {
            printing:            false,
            scanning:            true,
            adf:                 false,
            duplex:              false,
            flatbed:             true,
            color:               true,
            grayscale:           true,
            supportedDpi:        [150, 300, 600],
            supportedPaperSizes: ['A4', 'Letter'],
          },
        });
        log('log', `Found Windows WIA device: ${devName} [${isUsb ? 'USB' : 'LAN'}]`);
      }
    }
  } catch (e) {
    log('debug', 'WIA discovery error:', e.message);
  }

  // Query installed Windows Printers
  try {
    const psPrinters = `
      try {
        Get-Printer | Select-Object Name, DriverName, PortName | ConvertTo-Json
      } catch {}
    `;
    const { stdout } = await execAsync(`powershell -NoProfile -Command "${psPrinters.replace(/\n/g, ' ')}"`, { timeout: 4000 }).catch(() => ({ stdout: '' }));
    if (stdout && stdout.trim()) {
      let printers = [];
      try {
        const parsed = JSON.parse(stdout.trim());
        printers = Array.isArray(parsed) ? parsed : [parsed];
      } catch {}

      for (const p of printers) {
        if (!p.Name) continue;
        const nameLower = p.Name.toLowerCase();
        if (nameLower.includes('pdf') || nameLower.includes('xps') || nameLower.includes('onenote') || nameLower.includes('fax')) continue;

        const portName = p.PortName || '';
        const ipMatch  = portName.match(/\b(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)\b/);
        const ip       = ipMatch ? ipMatch[1] : null;

        const manufacturer = detectManufacturer(p.Name || p.DriverName);
        const deviceId = `WIN_${p.Name.replace(/\s+/g, '_')}`;

        if (!seenIds.has(deviceId)) {
          seenIds.add(deviceId);
          discovered.push({
            id:             deviceId,
            name:           p.Name,
            displayName:    p.Name,
            manufacturer,
            model:          p.DriverName || p.Name,
            type:           'printer_scanner',
            connectionType: ip ? 'WIFI' : 'USB',
            ip:             ip || undefined,
            port:           80,
            protocol:       'WIA',
            status:         'available',
            statusDetails:  'In Windows installiert',
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
            },
          });
          log('log', `Found Windows Installed Printer: ${p.Name}`);
        }
      }
    }
  } catch (e) {
    log('debug', 'Windows Get-Printer query error:', e.message);
  }
}

// ─── 5. ARP Cache Table Reader ────────────────────────────────────────────────
async function getArpIps() {
  const ips = [];
  try {
    const { stdout } = await execAsync('arp -a', { timeout: 3000 });
    const ipRe = /\b(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)\b/g;
    const matches = (stdout || '').match(ipRe) || [];
    ips.push(...new Set(matches));
  } catch {}
  return ips;
}

// ─── 6. eSCL Capabilities & Probe ─────────────────────────────────────────────
async function probeEsclDevice(ip, candidateMeta, seenSerials, seenIds) {
  for (const port of ESCL_PORTS) {
    try {
      const open = await tcpReachable(ip, port, PROBE_TIMEOUT_MS);
      if (!open) continue;

      const isHttps = (port === 443 || port === 8443);
      const proto   = isHttps ? 'https' : 'http';
      const capUrl  = `${proto}://${ip}:${port}/eSCL/ScannerCapabilities`;

      const { status, body } = await httpGet(capUrl, PROBE_TIMEOUT_MS).catch(() => ({ status: 0, body: '' }));
      if (status !== 200 || !body) continue;

      const makeModel    = extractXmlTag(body, 'MakeAndModel') || extractXmlTag(body, 'Model') || candidateMeta?.name || 'eSCL Network Scanner';
      const manufacturer = extractXmlTag(body, 'Manufacturer') || detectManufacturer(makeModel);
      const serial       = extractXmlTag(body, 'SerialNumber') || candidateMeta?.serial || null;
      const uuid         = extractXmlTag(body, 'UUID') || candidateMeta?.uuid || null;

      const inputSources = extractAllXmlTags(body, 'InputSource');
      const hasAdf       = inputSources.some((s) => /feeder|adf/i.test(s));
      const hasDuplex    = inputSources.some((s) => /duplex/i.test(s));
      const hasFlatbed   = inputSources.some((s) => /platen|flatbed/i.test(s)) || inputSources.length === 0;

      const xRes         = extractAllXmlTags(body, 'XResolution').map(Number).filter(Boolean);
      const dpis         = [...new Set(xRes)].sort((a, b) => a - b);
      const colorModes   = extractAllXmlTags(body, 'ColorMode');
      const formats      = extractAllXmlTags(body, 'DocumentFormat');

      // Deduplication Key: Serial Number > UUID > Model+IP
      const dedupeKey = serial
        ? `SERIAL_${serial.toUpperCase()}`
        : uuid
        ? `UUID_${uuid.toUpperCase()}`
        : `ESCL_${ip}_${port}`;

      if (seenSerials.has(dedupeKey)) return null;
      seenSerials.add(dedupeKey);

      const deviceId = serial
        ? `ESCL_${manufacturer}_${serial}`.replace(/[^A-Za-z0-9_-]/g, '_')
        : `ESCL_${ip.replace(/\./g, '_')}_${port}`;

      seenIds.add(deviceId);

      const normalizedModel = normalizeModelName(makeModel);
      const displayName     = `${manufacturer} ${normalizedModel}`.replace(new RegExp(`^${manufacturer}\\s+${manufacturer}`, 'i'), manufacturer);

      const device = {
        id:             deviceId,
        name:           makeModel,
        displayName,
        manufacturer,
        model:          normalizedModel,
        type:           'printer_scanner',
        connectionType: 'WIFI',
        ip,
        port,
        protocol:       'ESCL',
        serial:         serial || null,
        status:         'available',
        statusDetails:  `eSCL AirScan (${ip}:${port})`,
        capabilities: {
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
        },
      };

      log('log', `Discovered physical eSCL device: "${displayName}" at ${ip}:${port} [ADF:${hasAdf}, Flatbed:${hasFlatbed}]`);
      return device;
    } catch {
      // Continue to next port
    }
  }
  return null;
}

// ─── 7. Unified Discovery Orchestration ──────────────────────────────────────
async function runUnifiedDiscovery() {
  if (isDiscovering) return cachedDevices;
  isDiscovering = true;

  const discovered    = [];
  const seenIds       = new Set();
  const seenSerials   = new Set();
  const candidateIps  = new Set();
  const candidateMeta = new Map();

  try {
    log('log', '==================================================');
    log('log', '🔍 Starting Zero-Config Local Network Discovery...');
    log('log', '==================================================');

    // 1. Run mDNS, WSD, SSDP in parallel
    await Promise.all([
      discoverViaMdnsMulticast(candidateIps, candidateMeta),
      discoverViaWsd(candidateIps, candidateMeta),
      discoverViaSsdp(candidateIps, candidateMeta),
      discoverViaWindowsPnp(seenIds, discovered),
    ]);

    // 2. Read ARP table and local subnet
    const arpIps = await getArpIps();
    arpIps.forEach((ip) => candidateIps.add(ip));

    const localIps = getLocalIpv4Addresses();
    for (const lip of localIps) {
      // Add local subnet hosts
      subnetHosts(lip).forEach((h) => candidateIps.add(h));
    }

    log('log', `Probing ${candidateIps.size} network candidate(s) via eSCL AirScan...`);

    // 3. Probe all candidates with concurrency throttle
    const ipList = [...candidateIps];
    const CHUNK_SIZE = 35;

    for (let i = 0; i < ipList.length; i += CHUNK_SIZE) {
      const chunk = ipList.slice(i, i + CHUNK_SIZE);
      const results = await Promise.all(
        chunk.map((ip) => probeEsclDevice(ip, candidateMeta.get(ip), seenSerials, seenIds))
      );
      for (const dev of results) {
        if (dev) discovered.push(dev);
      }
    }

    // 4. Always provide Simulator Device for offline / demo environments
    if (!seenIds.has('SIMULATOR')) {
      discovered.push({
        id:             'SIMULATOR',
        name:           'LogiFlow Scanner Simulator',
        displayName:    'LogiFlow WLAN-Scanner Simulator (Test-Modus)',
        manufacturer:   'LogiFlow',
        model:          'Virtual AirScan 3000',
        type:           'printer_scanner',
        connectionType: 'WIFI',
        ip:             'SIMULATOR',
        port:           80,
        protocol:       'SIMULATOR',
        status:         'available',
        statusDetails:  'Virtueller Testscanner (Demo-Modus)',
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
      });
    }

    cachedDevices     = discovered;
    lastDiscoveryTime = Date.now();
    log('log', `✅ Discovery completed: ${discovered.length} device(s) ready.`);
  } catch (err) {
    log('error', 'Discovery error:', err);
  } finally {
    isDiscovering = false;
  }

  return discovered;
}

// ─── 8. Scanning Engine (eSCL / WIA / Simulator) ──────────────────────────────
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
  const map = {
    Color:         'RGB24',
    Grayscale:     'Grayscale8',
    BlackAndWhite: 'BlackAndWhite1',
  };
  return map[mode] || 'Grayscale8';
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
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = 1 + width * 3;
  const raw = Buffer.alloc(height * stride, 255);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * stride;
    raw[rowOffset] = 0; // Filter: none
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
  throw new Error('WIA scan produced no output image.');
}

async function triggerEsclScan(ip, port, options) {
  const { dpi = 300, colorMode = 'Grayscale', inputSource = 'Platen', format = 'jpeg', batchScan = false } = options;
  const mime     = format === 'png' ? 'image/png' : 'image/jpeg';
  const esclMode = colorModeToEscl(colorMode);
  const xmlBody  = buildScanXml({ dpi, colorMode: esclMode, inputSource, mime });
  const baseUrl  = `http://${ip}:${port}`;
  const jobsUrl  = `${baseUrl}/eSCL/ScanJobs`;

  log('log', `Posting scan job to ${jobsUrl} (${dpi} DPI, ${colorMode}, source: ${inputSource})`);
  const jobResp = await httpPost(jobsUrl, 'text/xml; charset=utf-8', xmlBody, 20000);
  if (jobResp.status !== 200 && jobResp.status !== 201) {
    throw new Error(`eSCL POST /ScanJobs returned HTTP ${jobResp.status}`);
  }

  const location    = jobResp.headers['location'] || `${jobsUrl}/Job1`;
  const jobLocation = location.startsWith('http') ? location : `${baseUrl}${location}`;
  const nextDocUrl  = jobLocation.endsWith('/NextDocument') ? jobLocation : `${jobLocation}/NextDocument`;

  log('log', `Polling scanned document stream: ${nextDocUrl}`);

  const pages = [];
  let isAdfBatch = (inputSource === 'Feeder' || inputSource === 'FeederDuplex') && batchScan;
  let done = false;

  while (!done) {
    let attempt = 0;
    let pageBuffer = null;

    while (attempt < 25 && !pageBuffer) {
      attempt++;
      try {
        const docResp = await httpGetBinary(nextDocUrl, 15000);
        if (docResp.status === 200 && docResp.buffer.length > 100) {
          pageBuffer = docResp.buffer;
        } else if (docResp.status === 404) {
          done = true; // Job done or ADF empty
          break;
        } else if (docResp.status === 503) {
          await new Promise((r) => setTimeout(r, 1200));
        } else {
          await new Promise((r) => setTimeout(r, 1200));
        }
      } catch {
        await new Promise((r) => setTimeout(r, 1200));
      }
    }

    if (pageBuffer) {
      pages.push({ buffer: pageBuffer, mimeType: mime });
      log('log', `✅ Page ${pages.length} scanned (${pageBuffer.length} bytes).`);
      if (!isAdfBatch) done = true; // Flatbed only 1 page
    } else {
      done = true;
    }
  }

  if (pages.length === 0) throw new Error('Scanner returned no document pages.');
  return pages;
}

async function executeScan(options) {
  const { scannerIp, scannerPort = 80 } = options;

  if (!scannerIp || scannerIp === 'SIMULATOR') {
    log('log', 'Simulator scan executed — returning sample document.');
    return [{ buffer: generateSampleDocumentPng(600, 800), mimeType: 'image/png' }];
  }

  if (scannerIp.startsWith('USB_') || scannerIp.startsWith('WIA_') || scannerIp === 'USB') {
    return triggerWiaScan();
  }

  return triggerEsclScan(scannerIp, scannerPort, options);
}

// ─── 9. HTTP API Server ───────────────────────────────────────────────────────
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
    // GET /health
    if (req.method === 'GET' && url === '/health') {
      return sendJson(res, 200, {
        status:    'ok',
        version:   '2.0.0',
        platform:  process.platform,
        hostname:  os.hostname(),
        uptime:    process.uptime(),
        timestamp: new Date().toISOString(),
      });
    }

    // GET /scanners or /devices (Discovery)
    if (req.method === 'GET' && (url === '/scanners' || url === '/devices')) {
      if (Date.now() - lastDiscoveryTime < CACHE_TTL_MS && cachedDevices.length > 0 && !isDiscovering) {
        return sendJson(res, 200, cachedDevices);
      }
      const devices = await runUnifiedDiscovery();
      return sendJson(res, 200, devices);
    }

    // GET /scanners/discover (Force fresh discovery)
    if (req.method === 'GET' && url === '/scanners/discover') {
      lastDiscoveryTime = 0;
      const devices = await runUnifiedDiscovery();
      return sendJson(res, 200, devices);
    }

    // GET /scanners/:id/status
    const statusMatch = url.match(/^\/scanners\/(.+)\/status$/);
    if (req.method === 'GET' && statusMatch) {
      const id = decodeURIComponent(statusMatch[1]);
      const device = cachedDevices.find((d) => d.id === id);
      if (!device || !device.ip || device.ip === 'SIMULATOR') {
        return sendJson(res, 200, { status: 'available', state: 'Idle', details: 'Simulator bereit' });
      }
      try {
        const { status: s, body } = await httpGet(`http://${device.ip}:${device.port || 80}/eSCL/ScannerStatus`, 3500);
        if (s !== 200) return sendJson(res, 200, { status: 'offline', details: `HTTP ${s}` });
        const state  = extractXmlTag(body, 'State') || 'Idle';
        const reason = extractXmlTag(body, 'AdfState') || extractXmlTag(body, 'Reason') || '';
        let status   = 'available';
        if (/busy|processing/i.test(state)) status = 'busy';
        if (/jam/i.test(reason))            status = 'paper_jam';
        if (/empty|nopaper/i.test(reason))  status = 'no_paper';
        return sendJson(res, 200, { status, state, details: device.statusDetails });
      } catch (e) {
        return sendJson(res, 200, { status: 'offline', details: e.message });
      }
    }

    // POST /scan
    if (req.method === 'POST' && url === '/scan') {
      const options = await readBody(req);
      log('log', `Scan requested on ${options.scannerIp || 'SIMULATOR'} (DPI: ${options.dpi || 300}, Source: ${options.inputSource || 'Platen'})`);
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
    log('error', 'API error:', err.message);
    sendJson(res, 500, { error: 'Internal agent error', message: err.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('╔═════════════════════════════════════════════════════════════════════╗');
  console.log('║       LogiFlow — Zero-Config Printer & Scanner Agent v2.0           ║');
  console.log('╠═════════════════════════════════════════════════════════════════════╣');
  console.log(`║  Local Bridge:  http://127.0.0.1:${PORT}                                ║`);
  console.log(`║  Platform:      ${process.platform.padEnd(52)}║`);
  console.log('║  Protocols:     mDNS/DNS-SD (5353) • WSD (3702) • SSDP (1900)       ║');
  console.log('║                 eSCL AirScan • Windows WIA / USB                    ║');
  console.log('╚═════════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Zero-configuration local network discovery is active.');
  console.log('The LogiFlow web application will now discover your real printers/scanners.');
  console.log('Keep this console window open while scanning.');
  console.log('');

  // Initial discovery warmup in background
  runUnifiedDiscovery().catch(() => {});
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use by another agent instance.`);
  } else {
    console.error('Agent server error:', err);
  }
  process.exit(1);
});

process.on('SIGINT',  () => { console.log('\nScanner Agent stopped.'); process.exit(0); });
process.on('SIGTERM', () => { process.exit(0); });
