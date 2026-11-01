/**
 * Fix-verification tests (mock-based, no DB, no paid API calls) for the
 * container-lists hardening branch:
 *  1. JwtAuthGuard present on previously unguarded routes
 *  2. warnings/uncertainFields stored as JSON objects, not stringified
 *  3. Excel export writes the Datum column (regression: time-parser always null)
 *  4. Excel + PDF export produce real files
 *  5. PDF uploads go through the text extraction path, not the image path
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { ContainerListsController } from './container-lists.controller';
import { ContainerListsService } from './container-lists.service';
import { ContainerExtractorService } from './container-extractor.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

const GUARDS_METADATA = '__guards__';

describe('container-lists hardening fixes', () => {
  const exportsDir = path.join(process.cwd(), 'storage', 'exports');

  afterAll(() => {
    fs.rmSync(path.join(process.cwd(), 'storage'), { recursive: true, force: true });
  });

  describe('1. route guards', () => {
    it('protects extract, findAll and findOne with JwtAuthGuard', () => {
      const proto = ContainerListsController.prototype as any;
      for (const method of ['extractDraft', 'findAll', 'findOne']) {
        const guards = Reflect.getMetadata(GUARDS_METADATA, proto[method]) || [];
        const hasJwt = guards.some((g: any) => g === JwtAuthGuard || g?.name === 'JwtAuthGuard' || g?.metatype === JwtAuthGuard);
        expect(hasJwt).toBe(true);
      }
    });
  });

  describe('2. JSON columns stored as objects', () => {
    it('create() passes warnings/uncertainFields as objects, not strings', async () => {
      let captured: any;
      const prismaMock: any = {
        containerList: {
          create: async (args: any) => {
            captured = args.data.rows.create[0];
            return { id: 'x', ...args.data };
          },
        },
      };
      const service = new ContainerListsService(prismaMock);
      await service.create({
        site: 'Gant',
        rows: [{ containerNumber: 'MSKU1234567', warnings: [{ field: 'personal', message: 'm', severity: 'warning' as const }], uncertainFields: ['personal'] } as any],
      } as any);
      expect(typeof captured.warnings).toBe('object');
      expect(Array.isArray(captured.warnings)).toBe(true);
      expect(Array.isArray(captured.uncertainFields)).toBe(true);
    });
  });

  describe('3+4. exports produce correct files', () => {
    const fakeList: any = {
      id: 'test-id-1',
      site: 'Gant',
      title: 'Test',
      date: new Date('2026-10-25'),
      createdAt: new Date('2026-10-25'),
      rows: [
        {
          rowOrder: 0, date: '25.10', containerNumber: 'YXEU1802671', fuss: '40',
          artikel: 'Testartikel', kartons: 100, termin: '08:00', ankunft: '07:45',
          start: '08:15', ende: '11:30', personal: 2, wartezeitVon: '09:00',
          wartezeitBis: '09:50', wartezeitStd: '01:40', wickel: null, preis: 12.5,
          ps: null, extraTeam: null, bemerkung: 'ok', warnings: null, uncertainFields: null,
        },
      ],
    };
    const prismaMock: any = { containerList: { findUnique: async () => fakeList } };

    it('exportXlsx writes the Datum column as the sheet date string', async () => {
      const service = new ContainerListsService(prismaMock);
      const { filePath } = await service.exportXlsx('test-id-1');
      expect(fs.existsSync(filePath)).toBe(true);

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(filePath);
      const sheet = wb.getWorksheet('KW ') || wb.worksheets[0];
      // find the datum column from the header row, same way the exporter does
      let datumCol = -1;
      sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
        if (cell.value && String(cell.value).trim().toLowerCase().includes('datum')) datumCol = col;
      });
      expect(datumCol).toBeGreaterThan(0);
      expect(String(sheet.getCell(2, datumCol).value)).toBe('25.10');
    });

    it('exportPdf creates a non-empty PDF file', async () => {
      const service = new ContainerListsService(prismaMock);
      const { filePath } = await service.exportPdf('test-id-1');
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.statSync(filePath).size).toBeGreaterThan(500);
      const head = fs.readFileSync(filePath).subarray(0, 5).toString();
      expect(head).toBe('%PDF-');
    });
  });

  describe('5. extractor PDF path', () => {
    const configMock: any = { get: () => 'test-key' };
    const sampleRow = { containerNumber: 'MSKU1234567', personal: 2 };

    function mockFetchCapture() {
      const calls: any[] = [];
      (global as any).fetch = jest.fn(async (_url: string, opts: any) => {
        calls.push(JSON.parse(opts.body));
        return {
          ok: true,
          json: async () => ({ choices: [{ message: { content: JSON.stringify({ site: 'Gant', rows: [sampleRow] }) } }] }),
          text: async () => '',
        };
      });
      return calls;
    }

    it('sends PDFs as extracted text, not as an image', async () => {
      const calls = mockFetchCapture();
      const svc = new ContainerExtractorService(configMock);

      // build a real digital PDF with enough text for the text path
      const PDFDocument = require('pdfkit');
      const tmpPdf = path.join(process.cwd(), 'storage', 'test-input.pdf');
      fs.mkdirSync(path.dirname(tmpPdf), { recursive: true });
      await new Promise<void>((resolve) => {
        const doc = new PDFDocument();
        const stream = fs.createWriteStream(tmpPdf);
        doc.pipe(stream);
        doc.text('CTR-Liste Gant Datum Container-Nr Fuss Artikel Kartons Termin Ankunft Start Ende Personal Wartezeit MSKU1234567');
        doc.end();
        stream.on('finish', () => resolve());
      });

      const file: any = { originalname: 'liste.pdf', mimetype: 'application/pdf', buffer: fs.readFileSync(tmpPdf), size: 1 };
      const result = await svc.extractDraft(file, 'Gant');

      expect(calls.length).toBe(1);
      const content = calls[0].messages[0].content;
      const types = content.map((c: any) => c.type);
      expect(types).not.toContain('image_url');
      expect(content.some((c: any) => c.type === 'text' && String(c.text).includes('DOCUMENT TEXT'))).toBe(true);
      expect(result.rows.length).toBe(1);
      fs.rmSync(tmpPdf, { force: true });
    });

    it('keeps the image path for image uploads', async () => {
      const calls = mockFetchCapture();
      const svc = new ContainerExtractorService(configMock);
      const file: any = { originalname: 'foto.jpg', mimetype: 'image/jpeg', buffer: Buffer.from('fakejpegdata'), size: 1 };
      await svc.extractDraft(file, 'Gant');
      const content = calls[0].messages[0].content;
      expect(content.some((c: any) => c.type === 'image_url')).toBe(true);
    });
  });
});
