import { Device, ScanJobOptions, ScannerCapabilities, ScanPage } from './models';

export interface IScannerBackend {
  /**
   * The name of the backend (e.g., 'ESCL', 'WIA', 'TWAIN')
   */
  readonly name: string;

  /**
   * Tests if the backend can communicate with the device.
   */
  isAvailable(device: Device): Promise<boolean>;

  /**
   * Fetches detailed scanner capabilities from the device.
   */
  getCapabilities(device: Device): Promise<ScannerCapabilities>;

  /**
   * Starts a scan job and yields pages as they are scanned.
   * This should support continuous ADF scanning until the feeder is empty.
   */
  startScan(
    device: Device,
    options: ScanJobOptions,
    onProgress?: (message: string, pageCount: number) => void,
    cancellationToken?: { isCancelled: boolean }
  ): Promise<ScanPage[]>;
}
