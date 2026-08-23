# LogiFlow — Windows Local Printer & Scanner Connector v2.0

The **LogiFlow Windows Printer & Scanner Connector** is a lightweight local Windows service that provides zero-configuration local hardware discovery and scanning for Wi-Fi, Ethernet, and USB printers/scanners (Brother, HP, Canon, Epson, Xerox, Kyocera, Lexmark, etc.) directly into the LogiFlow web application.

---

## Zero-Tech Installation

1. Double-click `install.bat`.
2. The connector is automatically installed to `%LOCALAPPDATA%\LogiFlowPrinterConnector`, registered for automatic startup upon Windows login, and launched silently in the background.
3. Open the LogiFlow web application in your browser and click **[ Vom Drucker scannen ]**.

---

## Features

- **Zero Network Configuration**: Automatically discovers local devices using mDNS/DNS-SD (UDP 5353), WS-Discovery (UDP 3702), SSDP (UDP 1900), Windows WIA COM API, Windows Print Spooler, and eSCL AirScan.
- **Hardware Deduplication**: Identifies the same physical multifunction device across multiple network protocols and shows it only once.
- **Real Connection Verification**: Live connection test (`/connect` / `/test`) verifies device online status and retrieves hardware capabilities (ADF, duplex, flatbed, resolutions, color modes).
- **Multi-Page ADF & Flatbed Scanning**: Real physical batch scanning from document feeders or flatbed glass.
- **Silent Background Execution**: Runs quietly on `127.0.0.1:48281` with zero popup windows.
- **Clean 1-Click Uninstall**: Run `uninstall.bat` to completely remove all files and startup registrations.

---

## API Endpoints (Localhost Only)

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Connector status & version |
| `GET` | `/devices` | Discovered hardware devices (cached 25s) |
| `POST` | `/discover` | Force fresh hardware discovery |
| `POST` | `/connect` | Verify connection & retrieve live capabilities |
| `POST` | `/scan` | Direct synchronous scan job |
| `POST` | `/scan/job` | Asynchronous scan job |
| `GET` | `/scan/:id/status` | Real-time scan progress & page stream |
| `POST` | `/scan/:id/cancel` | Cancel active scan job |
