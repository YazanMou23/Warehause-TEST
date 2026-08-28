import { IScannerBackend } from './backend.interface';
import { Device, ScanJobOptions, ScanJobState, ScanPage } from './models';
import { randomUUID } from 'crypto';

export class ScanJobManager {
  private jobs: Map<string, ScanJobState> = new Map();
  private cancellationTokens: Map<string, { isCancelled: boolean }> = new Map();
  private results: Map<string, ScanPage[]> = new Map();

  createJob(): string {
    const id = randomUUID();
    this.jobs.set(id, {
      id,
      status: 'queued',
      pageCount: 0,
      message: 'Job created',
      createdAt: new Date()
    });
    return id;
  }

  getJob(id: string): ScanJobState | undefined {
    return this.jobs.get(id);
  }

  getJobResults(id: string): ScanPage[] | undefined {
    return this.results.get(id);
  }

  cancelJob(id: string) {
    const token = this.cancellationTokens.get(id);
    if (token) {
      token.isCancelled = true;
    }
    const job = this.jobs.get(id);
    if (job && (job.status === 'scanning' || job.status === 'queued' || job.status === 'initializing')) {
      job.status = 'cancelled';
      job.message = 'Job cancelled by user';
    }
  }

  async runJob(id: string, backend: IScannerBackend, device: Device, options: ScanJobOptions) {
    const job = this.jobs.get(id);
    if (!job) return;

    job.status = 'initializing';
    job.message = 'Connecting to scanner...';

    const token = { isCancelled: false };
    this.cancellationTokens.set(id, token);

    try {
      const pages = await backend.startScan(device, options, (msg, count) => {
        job.message = msg;
        job.pageCount = count;
        job.status = 'scanning';
      }, token);

      if (token.isCancelled) {
        job.status = 'cancelled';
        return;
      }

      this.results.set(id, pages);
      job.status = 'completed';
      job.message = 'Scan completed successfully';
      job.pageCount = pages.length;

    } catch (err: any) {
      if (token.isCancelled) return;
      job.status = 'failed';
      job.error = err.message;
      job.message = 'Scan failed';
    } finally {
      this.cancellationTokens.delete(id);
    }
  }
}
