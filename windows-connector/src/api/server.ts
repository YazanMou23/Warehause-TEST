import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { DiscoveryManager } from '../discovery/DiscoveryManager';
import { ScanJobManager } from '../core/JobManager';
import { WiaBackend } from '../backends/wia';
import { EsclBackend } from '../backends/escl';
import { ScanJobOptions } from '../core/models';

export function startApiServer(port = 8000) {
  const app = express();
  
  app.use(cors());
  app.use(express.json());
  
  const discovery = new DiscoveryManager();
  const jobs = new ScanJobManager();
  const wiaBackend = new WiaBackend();
  const esclBackend = new EsclBackend();
  
  discovery.startDiscovery();

  // Status check
  app.get('/api/status', (req, res) => {
    res.json({
      status: 'online',
      version: '2.3.0-ts',
      connector: 'LogiFlow Universal TS'
    });
  });

  // Discovery
  app.get('/api/printers', (req, res) => {
    res.json(discovery.getDevices());
  });

  // Scan Job Management
  app.post('/api/scan/jobs', async (req, res) => {
    const { deviceId, options } = req.body as { deviceId: string, options: ScanJobOptions };
    
    const device = discovery.getDevice(deviceId);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const backend = device.protocol === 'ESCL' ? esclBackend : wiaBackend;
    
    if (!await backend.isAvailable(device)) {
      return res.status(503).json({ error: 'Device is offline or unreachable' });
    }

    const jobId = jobs.createJob();
    
    // Kick off asynchronously
    jobs.runJob(jobId, backend, device, options || {});
    
    res.status(201).json({ id: jobId, status: 'queued' });
  });

  app.get('/api/scan/jobs/:id', (req, res) => {
    const job = jobs.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  });

  app.delete('/api/scan/jobs/:id', (req, res) => {
    jobs.cancelJob(req.params.id);
    res.status(204).send();
  });

  app.get('/api/scan/jobs/:id/results', (req, res) => {
    const results = jobs.getJobResults(req.params.id);
    if (!results) return res.status(404).json({ error: 'Results not ready or job not found' });
    
    // Return all pages encoded in base64 to the webapp (or standard multipart, but base64 is easiest)
    res.json(results.map(r => ({
      pageNumber: r.pageNumber,
      mimeType: r.mimeType,
      data: r.buffer.toString('base64')
    })));
  });

  // Print endpoints (placeholders for future print management)
  app.post('/api/print', (req, res) => {
    res.status(501).json({ error: 'Printing not implemented in this phase' });
  });

  app.listen(port, '0.0.0.0', () => {
    console.log(`[Server] Connector API running on http://0.0.0.0:${port}`);
  });
}
