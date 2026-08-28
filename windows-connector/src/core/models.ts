export interface Device {
  id: string;
  name: string;
  displayName: string;
  manufacturer: string;
  model: string;
  connectionType: 'USB' | 'WIFI' | 'NETWORK';
  ip?: string;
  port?: number;
  protocol: 'WIA' | 'TWAIN' | 'ESCL' | 'SPOOLER' | 'BJNP' | 'UNKNOWN';
  status: 'available' | 'offline' | 'attention';
  statusDetails?: string;
  capabilities: {
    printer: boolean;
    scanner: boolean;
  };
  scannerCaps?: ScannerCapabilities;
  sources?: {
    flatbed: boolean;
    adf: boolean;
    duplex: boolean;
  };
}

export interface ScannerCapabilities {
  sources: {
    flatbed: boolean;
    adf: boolean;
    duplex: boolean;
  };
  resolutions: number[];
  colorModes: ('Color' | 'Grayscale' | 'BlackAndWhite')[];
  documentFormats: string[];
}

export interface ScanJobOptions {
  source?: 'auto' | 'flatbed' | 'adf';
  duplex?: boolean;
  dpi?: number;
  colorMode?: 'Color' | 'Grayscale' | 'BlackAndWhite';
  format?: 'jpeg' | 'png' | 'pdf';
  pageCount?: number;
  batchScan?: boolean;
}

export interface ScanPage {
  pageNumber: number;
  mimeType: string;
  buffer: Buffer;
}

export interface ScanJobState {
  id: string;
  status: 'queued' | 'initializing' | 'scanning' | 'completed' | 'cancelled' | 'failed';
  pageCount: number;
  message: string;
  error?: string;
  createdAt: Date;
}
