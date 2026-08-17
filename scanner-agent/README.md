# LogiFlow — Local Scanner Bridge Agent

The **Local Scanner Bridge Agent** is a small Node.js HTTP server that runs on your local PC/laptop and acts as a bridge between the cloud-hosted LogiFlow web application and printers/scanners on your local Wi-Fi/LAN network.

> **Why is this needed?**
> The LogiFlow web app is hosted in the cloud (Render.com). Cloud servers cannot access your local Wi-Fi network — they cannot "see" your Brother, HP, Canon, or Epson printer at `192.168.1.x`. The agent runs locally (on the same network as your printer) and forwards scan requests from the web app to the physical device.

---

## Requirements

- **Node.js 18+** — [Download](https://nodejs.org)
- Windows, macOS, or Linux
- Your printer/scanner must be on the same Wi-Fi/LAN as this computer
- The printer should have **AirScan / eSCL** or **IPP** enabled in its web interface

---

## Quick Start

### 1. Open a Terminal

On Windows: Press `Win + R`, type `cmd`, press Enter.

### 2. Navigate to the agent folder

```bash
cd "C:\Users\yazan\OneDrive\Desktop\dev app\warehause management\scanner-agent"
```

### 3. Start the agent

```bash
node index.js
```

You should see:

```
╔═══════════════════════════════════════════════════════╗
║     LogiFlow — Local Scanner Bridge Agent  v1.0       ║
╠═══════════════════════════════════════════════════════╣
║  Listening on:  http://127.0.0.1:48281                ║
╚═══════════════════════════════════════════════════════╝

The agent is now bridging your local network to LogiFlow.
Keep this window open while scanning.
Press Ctrl+C to stop.
```

### 4. Open LogiFlow in your browser

The web app will automatically detect that the agent is running and use it for device discovery and scanning.

---

## How It Works

```
LogiFlow Web App (cloud)
        │
        │ calls http://127.0.0.1:48281
        ▼
Local Scanner Agent (your PC)
        │
        ├─ mDNS / Bonjour (_uscan._tcp.local)
        ├─ ARP table scan
        ├─ /24 subnet eSCL probe
        └─ Windows WIA (USB scanners)
               │
               ▼
        Your Network Printer/Scanner
        (Brother, HP, Canon, Epson, etc.)
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Agent status |
| `GET` | `/scanners` | List discovered devices (cached 30s) |
| `GET` | `/scanners/discover` | Force fresh discovery |
| `GET` | `/scanners/:id/status` | Real-time device status |
| `POST` | `/scan` | Execute scan job, return pages |

---

## Configuration (Optional)

| Variable | Default | Description |
|---|---|---|
| `SCANNER_AGENT_PORT` | `48281` | HTTP port (localhost only) |
| `SCANNER_AGENT_TOKEN` | (empty) | If set, requests must include `Authorization: Bearer <token>` |

Example with custom port:
```bash
SCANNER_AGENT_PORT=48282 node index.js
```

---

## Supported Protocols

| Protocol | Devices |
|---|---|
| **eSCL / AirScan** | Brother, HP (port 8080), Canon, Epson, Lexmark, Ricoh, and most modern network scanners |
| **WIA (USB)** | Any USB scanner on Windows with a WIA driver |
| **mDNS / Bonjour** | Devices advertising `_uscan._tcp.local` or `_ipp._tcp.local` |
| **ARP + /24 sweep** | Any eSCL device on the local /24 subnet |

---

## Printer Setup

### Brother (most models)
1. Open `http://<printer-ip>` in browser
2. Go to **Network → Web Services Settings → External Print/Scan**
3. Enable **AirScan**

### HP
1. Open `http://<printer-ip>` in browser
2. Go to **Scan → Webscan** → Enable it
3. HP uses port **8080** for eSCL

### Canon (PIXMA / imageCLASS)
1. Open **Canon IJ Network Tool** or printer's web UI
2. Enable **Bonjour** and **AirScan**

### Epson
1. Open `http://<printer-ip>` in browser
2. Go to **Scan → Epson Scan 2** → Enable network scanning

---

## Troubleshooting

| Problem | Solution |
|---|---|
| "No devices found" | Check printer is ON and on the same Wi-Fi. Try discovery again. |
| Agent can't find printer via mDNS | Use the manual IP fallback in LogiFlow UI |
| Windows Firewall blocks agent | Add `node.exe` as allowed in Windows Firewall |
| Port 48281 already in use | Set `SCANNER_AGENT_PORT=48282` |
| USB scanner not found | Ensure Windows WIA service is running (`services.msc → Windows Image Acquisition`) |

---

## Auto-Start on Windows (Optional)

To start the agent automatically when your PC boots:

1. Press `Win + R`, type `shell:startup`, press Enter
2. Create a new file `LogiFlow Scanner Agent.bat`:

```bat
@echo off
node "C:\Users\yazan\OneDrive\Desktop\dev app\warehause management\scanner-agent\index.js"
```

3. Save the file — it will run automatically on next login.

---

## Security

- The agent **only listens on `127.0.0.1` (localhost)**. It is never exposed to the internet or your local network.
- The web app running in the browser calls it via `http://127.0.0.1:48281` — this is a standard same-machine call.
- Optionally set `SCANNER_AGENT_TOKEN` for extra authentication.
