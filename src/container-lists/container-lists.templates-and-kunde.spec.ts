import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { ContainerListsService } from './container-lists.service';
import { ContainerExtractorService } from './container-extractor.service';
import {
  KNOWN_CONTAINER_SITES,
  calculateRowWaitingWorkerHours,
  calculateRowWorkWorkerHoursWithoutWaiting,
  formatCombinedWartezeitCell,
  formatGermanStd,
  matchCustomerSite,
  parseDurationToHours,
} from './customer-matcher';

describe('Container Liste — Kunde Auto-Detection, Original Templates & Accounting Rules', () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // PART A: MOCKED UNIT & TEMPLATE EXPORT TESTS (No network, no DB, no paid API)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('[Mocked Unit Tests] 1. Automatic Kunde/Customer Detection & Matching', () => {
    it.each([
      ['Gant', 'Gant'],
      ['gant logistik', 'Gant'],
      ['Brooks', 'Brooks'],
      ['BROOKS RUNNING', 'Brooks'],
      ['Schwalbe', 'Schwalbe'],
      ['WE-Schwalbe', 'Schwalbe'],
      ['WE.Schwalbe', 'Schwalbe'],
      ['WE-Britax', 'WE-Britax'],
      ['WE.-Britax', 'WE-Britax'],
      ['Britax Römer', 'WE-Britax'],
      ['Medisana', 'Medisana'],
      ['Zwilling', 'Zwilling'],
      ['ProHeq', 'ProHeq'],
      ['WE.-ProHeq', 'ProHeq'],
      ['LOXX', 'LOXX'],
      ['Loxx Logistik', 'LOXX'],
    ])('matches "%s" as an exact normalized match to "%s"', (rawInput, expectedSite) => {
      const res = matchCustomerSite(rawInput);
      expect(res.matchType).toBe('exact');
      expect(res.matchedSite).toBe(expectedSite);
      expect(res.requiresConfirmation).toBe(false);
    });

    it.each([
      ['WE', ['WE-Britax', 'ProHeq', 'Schwalbe']],
      ['Schwal', ['Schwalbe']],
      ['Medis', ['Medisana']],
      ['Gant / Brooks', ['Gant', 'Brooks']],
    ])(
      'flags partial or multi-match "%s" as ambiguous requiring explicit confirmation',
      (rawInput, expectedCandidates) => {
        const res = matchCustomerSite(rawInput);
        expect(res.matchType).toBe('ambiguous');
        expect(res.requiresConfirmation).toBe(true);
        expect(res.candidates).toEqual(expect.arrayContaining(expectedCandidates));
        expect(res.warning).toBeTruthy();
      },
    );

    it('flags unknown customer names with matchType="unknown", requiresConfirmation=true, and no silent default', () => {
      const res = matchCustomerSite('IKEA Supply AG');
      expect(res.matchType).toBe('unknown');
      expect(res.matchedSite).toBeNull();
      expect(res.requiresConfirmation).toBe(true);
      expect(res.detectedCustomerRaw).toBe('IKEA Supply AG');
      expect(res.warning).toContain('IKEA Supply AG');
    });

    it('does not treat a default (like Gant) as detected when customer is unknown or ambiguous during extractDraft', async () => {
      const configMock: any = { get: () => 'test-key' };
      const svc = new ContainerExtractorService(configMock);

      // Mock AI returning an unknown customer
      (global as any).fetch = jest.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  site: 'Unbekannt Logistik GmbH',
                  date: '2026-10-25',
                  rows: [{ containerNumber: 'MSKU1234567', personal: 3 }],
                }),
              },
            },
          ],
        }),
      }));

      const file: any = {
        originalname: 'scan.jpg',
        mimetype: 'image/jpeg',
        buffer: Buffer.from('fakeimg'),
        size: 7,
      };

      const res = await svc.extractDraft(file, 'AUTO');
      expect(res.site).toBe('');
      expect(res.customerDetection?.matchType).toBe('unknown');
      expect(res.customerDetection?.requiresConfirmation).toBe(true);
      expect(res.globalWarnings.some((w) => w.includes('Unbekannt Logistik GmbH'))).toBe(true);
    });

    it('preserves explicit manual site override without silently overwriting when document has another customer', async () => {
      const configMock: any = { get: () => 'test-key' };
      const svc = new ContainerExtractorService(configMock);

      (global as any).fetch = jest.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  site: 'Medisana',
                  date: '2026-10-25',
                  rows: [{ containerNumber: 'MSKU1234567', personal: 3 }],
                }),
              },
            },
          ],
        }),
      }));

      const file: any = {
        originalname: 'scan.jpg',
        mimetype: 'image/jpeg',
        buffer: Buffer.from('fakeimg'),
        size: 7,
      };

      const res = await svc.extractDraft(file, 'Brooks');
      expect(res.site).toBe('Brooks');
      expect(res.customerDetection?.matchedSite).toBe('Medisana');
      expect(
        res.globalWarnings.some(
          (w) => w.includes('Medisana') && w.includes('Brooks'),
        ),
      ).toBe(true);
    });
  });

  describe('[Mocked Unit Tests] 2, 3, 4 & 6. Duration Parsing, 1:40 Notation & Waiting Time Accounting Rules', () => {
    it('treats "1:40" strictly as 1 hour 40 minutes (1.6667h), NEVER as 1.40 decimal hours', () => {
      const parsed = parseDurationToHours('1:40');
      expect(parsed.isUnclear).toBe(false);
      expect(parsed.hours).toBeCloseTo(1 + 40 / 60, 5);
      expect(parsed.hours).not.toBeCloseTo(1.4, 2);
    });

    it('flags ambiguous dot notation like "1.40" as unclear rather than guessing', () => {
      const parsed = parseDurationToHours('1.40');
      expect(parsed.isUnclear).toBe(true);
      expect(parsed.hours).toBeNull();
      expect(parsed.reason).toContain('1.40');
    });

    it('calculates 45 minutes × 5 workers = 3.75 worker-hours ("3,75 Std.")', () => {
      const calc = calculateRowWaitingWorkerHours({
        wartezeitVon: '09:00',
        wartezeitBis: '09:45',
        personal: 5,
      });
      expect(calc.workerHours).toBeCloseTo(3.75, 5);
      expect(formatGermanStd(calc.workerHours)).toBe('3,75 Std.');
    });

    it('deducts time spent working on another container during waiting (4 workers 09:00–10:00 minus 2 workers 09:15–09:45 = 3 worker-hours)', () => {
      const calc = calculateRowWaitingWorkerHours({
        wartezeitVon: '09:00',
        wartezeitBis: '10:00',
        personal: 4,
        anderweitigeArbeiten: [
          {
            personal: 2,
            von: '09:15',
            bis: '09:45',
            bemerkung: 'Parallelcontainer',
          },
        ],
      });
      expect(calc.baseWorkerHours).toBeCloseTo(4.0, 5);
      expect(calc.deductionWorkerHours).toBeCloseTo(1.0, 5);
      expect(calc.workerHours).toBeCloseTo(3.0, 5);
      expect(formatGermanStd(calc.workerHours)).toBe('3 Std.');
    });

    it('never infers shared workers merely from overlapping container times when anderweitigeArbeiten is empty', () => {
      const row1 = calculateRowWaitingWorkerHours({
        wartezeitVon: '09:00',
        wartezeitBis: '10:00',
        personal: 4,
      });
      expect(row1.workerHours).toBeCloseTo(4.0, 5);
    });

    it('persists and rehydrates anderweitigeArbeiten via ContainerListsService without Prisma schema changes', async () => {
      let savedCreatePayload: any = null;
      const prismaMock: any = {
        containerList: {
          create: async (args: any) => {
            savedCreatePayload = args.data;
            return {
              id: 'list-deduct-1',
              ...args.data,
              rows: args.data.rows.create.map((r: any, i: number) => ({
                id: `row-${i}`,
                ...r,
              })),
            };
          },
        },
      };

      const service = new ContainerListsService(prismaMock);
      const created = await service.create({
        site: 'Gant',
        rows: [
          {
            rowOrder: 1,
            containerNumber: 'MSKU1111111',
            personal: 4,
            wartezeitVon: '09:00',
            wartezeitBis: '10:00',
            anderweitigeArbeiten: [{ personal: 2, von: '09:15', bis: '09:45' }],
          },
        ],
      });

      expect(Array.isArray(savedCreatePayload.rows.create[0].warnings)).toBe(true);
      expect(savedCreatePayload.rows.create[0].wartezeitStd).toBe('3');
      expect((created.rows[0] as any).anderweitigeArbeiten).toEqual([
        { personal: 2, von: '09:15', bis: '09:45' },
      ]);
      expect(created.rows[0].warnings).toEqual([]);
    });

    it('updates a saved container list (metadata + edited rows) and recalculates wartezeitStd via ContainerListsService.update', async () => {
      let createdRowsPayload: any[] = [];
      let updatedMetadataPayload: any = null;

      const prismaMock: any = {
        containerList: {
          findUnique: async () => ({
            id: 'saved-list-1',
            site: 'Gant',
            title: 'Alt',
            date: new Date('2026-09-21'),
            rows: [],
          }),
        },
        $transaction: async (cb: any) => {
          const tx = {
            containerListRow: {
              deleteMany: jest.fn(async () => ({ count: 1 })),
              createMany: jest.fn(async (args: any) => {
                createdRowsPayload = args.data;
                return { count: args.data.length };
              }),
            },
            containerList: {
              update: jest.fn(async (args: any) => {
                updatedMetadataPayload = args.data;
                return {
                  id: 'saved-list-1',
                  site: args.data.site || 'Gant',
                  title: args.data.title || 'Alt',
                  date: args.data.date || new Date('2026-09-21'),
                  rows: createdRowsPayload.map((r, idx) => ({
                    id: `row-new-${idx}`,
                    ...r,
                  })),
                };
              }),
            },
          };
          return cb(tx);
        },
      };

      const service = new ContainerListsService(prismaMock);
      const updated = await service.update('saved-list-1', {
        site: 'Schwalbe',
        title: 'Schwalbe Bearbeitet',
        date: '2026-09-22',
        rows: [
          {
            id: 'old-row-id',
            rowOrder: 1,
            date: '2026-09-22',
            containerNumber: 'MSKU9999999',
            fuss: '40',
            kartons: 1200,
            start: '08:00',
            ende: '10:00',
            personal: 5,
            wartezeitVon: '07:15',
            wartezeitBis: '08:00', // 45m * 5 = 3.75 Std. -> "3,75"
            anderweitigeArbeiten: [{ personal: 1, von: '07:15', bis: '07:45' }], // -0.5 Std. -> "3,25"
            bemerkung: 'Nachbearbeitet',
          },
        ],
      });

      expect(updatedMetadataPayload.site).toBe('Schwalbe');
      expect(updatedMetadataPayload.title).toBe('Schwalbe Bearbeitet');
      expect(createdRowsPayload).toHaveLength(1);
      expect(createdRowsPayload[0].containerNumber).toBe('MSKU9999999');
      expect(createdRowsPayload[0].wartezeitStd).toBe('3,25');
      expect((updated.rows[0] as any).anderweitigeArbeiten).toEqual([
        { personal: 1, von: '07:15', bis: '07:45' },
      ]);
    });
  });

  describe('[Mocked Unit Tests] 2, 3, 4, 5 & 7. Excel Template Fidelity Across All 8 Customer Templates', () => {
    it.each(KNOWN_CONTAINER_SITES)(
      'exports "%s" preserving weekly blocks, single von–bis cell, Dauer formulas, Summe formula, and weekly Wartezeit totals',
      async (site) => {
        const fakeList: any = {
          id: `test-${site}`,
          site,
          title: `Test ${site}`,
          date: new Date('2026-09-21'),
          createdAt: new Date('2026-09-21'),
          rows: [
            // Block 1 (Date 2026-09-21): 45 min * 5 workers = 3.75 worker-hours ("3,75 Std.")
            {
              rowOrder: 1,
              date: '2026-09-21',
              containerNumber: 'CSGU6686481',
              fuss: '40',
              artikel: '11',
              kartons: 1548,
              termin: '08:00',
              ankunft: '09:00',
              start: '09:45',
              ende: '11:45', // 2 hours unloading * 5 workers = 10 worker-hours
              personal: 5,
              wartezeitVon: '09:00',
              wartezeitBis: '09:45',
              preis: 250,
              bemerkung: 'Test Block 1',
            },
            // Block 2 (Date 2026-09-24): 60 min * 4 workers minus 2 workers for 30 min = 3 worker-hours ("3 Std.")
            {
              rowOrder: 2,
              date: '2026-09-24',
              containerNumber: 'FFAU6003714',
              fuss: '40',
              artikel: '6',
              kartons: 800,
              termin: '09:00',
              ankunft: '09:00',
              start: '10:00',
              ende: '11:30', // 1.5 hours unloading * 4 workers = 6 worker-hours
              personal: 4,
              wartezeitVon: '09:00',
              wartezeitBis: '10:00',
              anderweitigeArbeiten: [{ personal: 2, von: '09:15', bis: '09:45' }],
              preis: 150,
              bemerkung: 'Test Block 2',
            },
          ],
        };

        const prismaMock: any = {
          containerList: { findUnique: async () => fakeList },
        };
        const service = new ContainerListsService(prismaMock);
        const { filePath } = await service.exportXlsx(`test-${site}`);
        expect(fs.existsSync(filePath)).toBe(true);

        const wb = new ExcelJS.Workbook();
        await wb.xlsx.readFile(filePath);
        const sheet = wb.worksheets[0];

        // Find header columns
        const headers = new Map<string, number>();
        sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
          headers.set(
            String(cell.value).replace(/\s+/g, ' ').trim().toLowerCase(),
            col,
          );
        });

        // Verify Gant-specific vs standard Wartezeit header
        if (site === 'Gant') {
          expect(headers.has('wartezeit')).toBe(true);
        } else {
          expect(headers.has('wartezeit von-bis')).toBe(true);
        }

        // Verify Schwalbe-only header "Personal Anzahl"
        if (site === 'Schwalbe') {
          expect(headers.has('personal anzahl')).toBe(true);
        } else {
          expect(headers.has('personal')).toBe(true);
          expect(headers.has('personal anzahl')).toBe(false);
        }

        const wzCol =
          headers.get('wartezeit') ?? headers.get('wartezeit von-bis') ?? -1;
        const dauerCol = headers.get('dauer') ?? -1;
        const preisCol = headers.get('preis') ?? -1;

        expect(wzCol).toBeGreaterThan(0);
        expect(dauerCol).toBeGreaterThan(0);
        expect(preisCol).toBeGreaterThan(0);

        // Verify Row 2 (first container in Block 1) has ONE combined Wartezeit text cell
        expect(sheet.getCell(2, wzCol).value).toBe('09:00 bis 09:45');

        // Verify Row 2 Dauer cell preserves formula (Ende - Start) and is NOT overwritten with waiting hours
        const dauerVal: any = sheet.getCell(2, dauerCol).value;
        expect(dauerVal).toBeDefined();
        expect(typeof dauerVal).toBe('object');
        expect(String(dauerVal.formula)).toMatch(/^[A-Z]+2-[A-Z]+2$/);
        // 09:45 to 11:45 is 2 hours (ExcelJS deserializes h:mm cached result as 1899-12-30T02:00:00.000Z or 120/1440)
        if (dauerVal.result instanceof Date) {
          expect(dauerVal.result.getUTCHours()).toBe(2);
          expect(dauerVal.result.getUTCMinutes()).toBe(0);
        } else {
          expect(dauerVal.result).toBeCloseTo(120 / 1440, 5);
        }

        // Scan summary rows in sheet
        const wartezeitSummaries: string[] = [];
        const personalStdOhneWartezeitSummaries: string[] = [];
        let sumFormulaFound = false;

        for (let r = 2; r <= sheet.rowCount; r++) {
          const cText = String(sheet.getCell(r, 3).value || '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
          if (cText === 'wartezeit' || cText === 'gesamt wartezeit') {
            sheet.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
              if (col !== 3 && String(cell.value || '').includes('Std.')) {
                wartezeitSummaries.push(String(cell.value));
              }
            });
          }
          if (cText.includes('gesamt personal std. ohne wartezeit')) {
            const pCol = headers.get('personal anzahl')!;
            personalStdOhneWartezeitSummaries.push(
              String(sheet.getCell(r, pCol).value || ''),
            );
          }

          const pVal: any = sheet.getCell(r, preisCol).value;
          if (pVal && typeof pVal === 'object' && String(pVal.formula || '').startsWith('SUM(')) {
            sumFormulaFound = true;
            expect(pVal.result).toBeCloseTo(400, 2);
          }
        }

        // Block 1 Wartezeit summary = "3,75 Std.", Block 2 Wartezeit summary = "3 Std.", remaining blocks = "0 Std."
        expect(wartezeitSummaries[0]).toBe('3,75 Std.');
        expect(wartezeitSummaries[1]).toBe('3 Std.');
        expect(wartezeitSummaries.slice(2).every((v) => v === '0 Std.')).toBe(true);

        // Verify Schwalbe-only "Gesamt Personal Std. ohne Wartezeit" summary
        if (site === 'Schwalbe') {
          expect(personalStdOhneWartezeitSummaries.length).toBeGreaterThanOrEqual(4);
          // Block 1: 2h * 5 workers = 10 Std.
          expect(personalStdOhneWartezeitSummaries[0]).toBe('10 Std.');
          // Block 2: 1.5h * 4 workers = 6 Std.
          expect(personalStdOhneWartezeitSummaries[1]).toBe('6 Std.');
          expect(
            personalStdOhneWartezeitSummaries.slice(2).every((v) => v === '0 Std.'),
          ).toBe(true);
        } else {
          expect(personalStdOhneWartezeitSummaries.length).toBe(0);
        }

        expect(sumFormulaFound).toBe(true);
        fs.rmSync(filePath, { force: true });
      },
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PART B: REAL-FILE EXTRACTION & ROUND-TRIP TESTS (Local files, zero paid API)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('[Real-File Extraction Tests] 7. Real LOXX Dataset & Digital PDF Extraction (No Paid API Calls)', () => {
    it('extracts the real LOXX multi-container per day dataset, auto-detects LOXX, and exports matching weekly/daily summaries', async () => {
      const loxxCsv = [
        ',WE-Datum,Container Nr.,Fuß,Anzahl Artikel,Anzahl Kartons,Termin,Ankunft,Beginn der Entladung,Ende der Entladung,Dauer,Personal,Wartezeit      Von-Bis,Kunde,Preis,Bemerkung',
        '1.,2026-09-21,CSGU6686481,,11,1548,08:00:00,11:40:00,11:50:00,15:00:00,03:10:00,3,08:00-09:30,LOXX,,Artikel sind durcheinander gewesen dadurch längere entlade-zeit + Verspätung',
        '2.,,TXGU8067204,,3,1431,10:00:00,09:30:00,09:30:00,11:20:00,01:50:00,3,,LOXX,,Artikel sind durcheinander gewesen',
        ',,Wartezeit,,,"4,5 Std.",,,,,,,,,,',
        '1.,2026-09-24,FFAU6003714,,6,4800,08:00:00,abgesagt,,,00:00:00,3,08:00-10:00,LOXX,,abgesagt ',
        ',,Wartezeit,,,6 Std.,,,,,,,,,,',
        ',,,,,,,,,,,,,SUMME:,0,',
      ].join('\n');

      const configMock: any = { get: () => undefined }; // Ensure zero paid API calls
      const extractor = new ContainerExtractorService(configMock);

      const file: any = {
        originalname: 'LOXX-KW39.csv',
        mimetype: 'text/csv',
        buffer: Buffer.from(loxxCsv, 'utf-8'),
        size: loxxCsv.length,
      };

      const extracted = await extractor.extractDraft(file, 'AUTO');
      expect(extracted.simulated).toBe(false);
      expect(extracted.site).toBe('LOXX');
      expect(extracted.customerDetection?.matchType).toBe('exact');
      expect(extracted.customerDetection?.matchedSite).toBe('LOXX');
      expect(extracted.rows).toHaveLength(3);

      // Row 1 & Row 2 belong to 2026-09-21
      expect(extracted.rows[0].date).toBe('2026-09-21');
      expect(extracted.rows[0].containerNumber).toBe('CSGU6686481');
      expect(extracted.rows[0].wartezeitVon).toBe('08:00');
      expect(extracted.rows[0].wartezeitBis).toBe('09:30');
      expect(extracted.rows[0].wartezeitStd).toBe('4,5');

      expect(extracted.rows[1].date).toBe('2026-09-21');
      expect(extracted.rows[1].containerNumber).toBe('TXGU8067204');

      // Row 3 belongs to 2026-09-24 with "abgesagt"
      expect(extracted.rows[2].date).toBe('2026-09-24');
      expect(extracted.rows[2].containerNumber).toBe('FFAU6003714');
      expect(extracted.rows[2].ankunft).toBe('abgesagt');
      expect(extracted.rows[2].wartezeitStd).toBe('6');

      // Now export this extracted list via LOXX.xlsx template and verify exact cells
      const prismaMock: any = {
        containerList: {
          findUnique: async () => ({
            id: 'loxx-real-1',
            site: extracted.site,
            title: 'LOXX KW39',
            date: new Date('2026-09-21'),
            createdAt: new Date('2026-09-21'),
            rows: extracted.rows,
          }),
        },
      };
      const listsService = new ContainerListsService(prismaMock);
      const { filePath } = await listsService.exportXlsx('loxx-real-1');

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(filePath);
      const sheet = wb.getWorksheet('KW') || wb.worksheets[0];

      // Block 1 (2026-09-21): Rows 2 and 3, Summary at Row 7 Col F (6)
      expect(sheet.getCell('C2').value).toBe('CSGU6686481');
      expect(sheet.getCell('M2').value).toBe('08:00 bis 09:30');
      expect(sheet.getCell('C3').value).toBe('TXGU8067204');
      expect(sheet.getCell('C7').value).toBe('Wartezeit');
      expect(sheet.getCell('F7').value).toBe('4,5 Std.');

      // Block 2 (2026-09-24): Row 8, Summary at Row 13 Col F (6)
      expect(sheet.getCell('C8').value).toBe('FFAU6003714');
      expect(sheet.getCell('H8').value).toBe('abgesagt');
      expect(sheet.getCell('M8').value).toBe('08:00 bis 10:00');
      expect(sheet.getCell('C13').value).toBe('Wartezeit');
      expect(sheet.getCell('F13').value).toBe('6 Std.');

      // Grand total at Row 32
      expect(sheet.getCell('N32').value).toBe('SUMME:');
      const sumFormula: any = sheet.getCell('O32').value;
      expect(sumFormula.formula).toBe('SUM(O2:O31)');

      fs.rmSync(filePath, { force: true });
    });

    it('extracts customer name from a real digital PDF file buffer without paid API calls', async () => {
      const tmpPdf = path.join(process.cwd(), 'storage', 'test-schwalbe-real.pdf');
      fs.mkdirSync(path.dirname(tmpPdf), { recursive: true });
      await new Promise<void>((resolve) => {
        const doc = new PDFDocument();
        const stream = fs.createWriteStream(tmpPdf);
        doc.pipe(stream);
        doc.text('Container-Entladeliste Kunde: WE-Schwalbe Datum: 2026-10-25 Container: MSKU1234567 Personal Anzahl: 4');
        doc.end();
        stream.on('finish', () => resolve());
      });

      const configMock: any = { get: () => undefined }; // Offline mode, no paid API calls
      const extractor = new ContainerExtractorService(configMock);
      const file: any = {
        originalname: 'dokument.pdf',
        mimetype: 'application/pdf',
        buffer: fs.readFileSync(tmpPdf),
        size: fs.statSync(tmpPdf).size,
      };

      const res = await extractor.extractDraft(file, 'AUTO');
      expect(res.site).toBe('Schwalbe');
      expect(res.customerDetection?.matchType).toBe('exact');
      expect(res.customerDetection?.matchedSite).toBe('Schwalbe');

      fs.rmSync(tmpPdf, { force: true });
    });

    it('dynamically expands a day/block when Schwalbe has more than 4 containers on the same day, placing summary rows after the last container row', async () => {
      const fiveRowsSameDay = Array.from({ length: 5 }, (_, i) => ({
        rowOrder: i + 1,
        date: '2026-09-21',
        containerNumber: `MSKU000000${i + 1}`,
        fuss: '40',
        artikel: '10',
        kartons: 500,
        termin: '08:00',
        ankunft: '08:00',
        start: '08:30',
        ende: '09:30', // 1h unloading * 2 workers = 2 Std. per row => 10 Std. total for 5 rows
        personal: 2,
        wartezeitVon: '08:00',
        wartezeitBis: '08:30', // 0.5h waiting * 2 workers = 1 Std. per row => 5 Std. total for 5 rows
        preis: 100,
      }));

      const prismaMock: any = {
        containerList: {
          findUnique: async () => ({
            id: 'schwalbe-5rows',
            site: 'Schwalbe',
            title: 'Schwalbe 5 Container an einem Tag',
            date: new Date('2026-09-21'),
            createdAt: new Date('2026-09-21'),
            rows: fiveRowsSameDay,
          }),
        },
      };

      const service = new ContainerListsService(prismaMock);
      const { filePath } = await service.exportXlsx('schwalbe-5rows');

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(filePath);
      const sheet = wb.getWorksheet('KW') || wb.worksheets[0];

      // Rows 2..6 are the 5 containers (1. to 5.)
      expect(sheet.getCell('A6').value).toBe('5.');
      expect(sheet.getCell('C6').value).toBe('MSKU0000005');

      // Row 7 is now "Gesamt  Wartezeit" -> 5 Std.
      expect(String(sheet.getCell('C7').value).replace(/\s+/g, ' ').trim()).toBe(
        'Gesamt Wartezeit',
      );
      expect(sheet.getCell('L7').value).toBe('5 Std.');

      // Row 8 is now "Gesamt Personal Std. ohne Wartezeit" -> 10 Std.
      expect(String(sheet.getCell('C8').value).replace(/\s+/g, ' ').trim()).toBe(
        'Gesamt Personal Std. ohne Wartezeit',
      );
      expect(sheet.getCell('M8').value).toBe('10 Std.');

      fs.rmSync(filePath, { force: true });
    });
  });
});
