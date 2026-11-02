import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateContainerListDto,
  OtherWorkEntryDto,
  UpdateContainerListDto,
} from './dto/container-list.dto';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import PDFDocument from 'pdfkit';
import {
  calculateRowWaitingWorkerHours,
  calculateRowWorkWorkerHoursWithoutWaiting,
  formatCombinedWartezeitCell,
  formatGermanStd,
  matchCustomerSite,
  parseClockTime,
} from './customer-matcher';

const OTHER_WORK_META_FIELD = '__anderweitigeArbeiten';

interface TemplateBlock {
  dataRows: number[];
  wartezeitSummaryRow: number;
  wartezeitLabelCol: number;
  wartezeitValueCol: number;
  personalStdSummaryRow?: number;
  personalStdLabelCol?: number;
  personalStdValueCol?: number;
}

@Injectable()
export class ContainerListsService {
  private readonly logger = new Logger(ContainerListsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Encodes repeatable anderweitigeArbeiten entries inside row warnings JSON
   * when present, avoiding any Prisma schema migration while keeping warnings a valid JSON array.
   */
  private serializeRowWarnings(
    warnings: any[] | undefined,
    anderweitigeArbeiten: OtherWorkEntryDto[] | undefined,
  ): any {
    const cleanWarnings = Array.isArray(warnings)
      ? warnings.filter((w) => w?.field !== OTHER_WORK_META_FIELD)
      : [];

    if (Array.isArray(anderweitigeArbeiten) && anderweitigeArbeiten.length > 0) {
      return [
        ...cleanWarnings,
        {
          field: OTHER_WORK_META_FIELD,
          message: JSON.stringify(anderweitigeArbeiten),
          severity: 'info',
        },
      ];
    }

    return warnings !== undefined ? cleanWarnings : undefined;
  }

  /**
   * Restores anderweitigeArbeiten from serialized row warnings if not already present on the row.
   */
  private hydrateListRows<T extends { rows?: any[] }>(list: T): T {
    if (!list || !Array.isArray(list.rows)) return list;
    for (const r of list.rows) {
      if (Array.isArray(r.warnings)) {
        const metaEntry = r.warnings.find((w: any) => w?.field === OTHER_WORK_META_FIELD);
        if (metaEntry && !Array.isArray(r.anderweitigeArbeiten)) {
          try {
            r.anderweitigeArbeiten = JSON.parse(metaEntry.message || '[]');
          } catch {
            r.anderweitigeArbeiten = [];
          }
        }
        r.warnings = r.warnings.filter((w: any) => w?.field !== OTHER_WORK_META_FIELD);
      }
    }
    return list;
  }

  /**
   * Save a reviewed container list and all its rows to the database.
   */
  async create(dto: CreateContainerListDto, createdById?: string) {
    this.logger.log(
      `Saving container list for site ${dto.site} with ${dto.rows?.length || 0} rows...`,
    );

    const list = await this.prisma.containerList.create({
      data: {
        site: dto.site,
        title: dto.title || `Containerliste - ${dto.site}`,
        date: dto.date ? new Date(dto.date) : new Date(),
        rawFileName: dto.rawFileName,
        status: dto.status || 'SAVED',
        notes: dto.notes,
        createdById: createdById || null,
        rows: {
          create: (dto.rows || []).map((r, index) => {
            const calc = calculateRowWaitingWorkerHours(r);
            const computedWartezeitStd =
              (r.wartezeitVon || r.wartezeitBis) && r.personal && r.personal > 0
                ? formatGermanStd(calc.workerHours).replace(/\s*Std\.$/, '')
                : r.wartezeitStd;

            return {
              rowOrder: r.rowOrder ?? index,
              date: r.date,
              containerNumber: r.containerNumber,
              fuss: r.fuss,
              artikel: r.artikel,
              kartons: r.kartons,
              termin: r.termin,
              ankunft: r.ankunft,
              start: r.start,
              ende: r.ende,
              personal: r.personal,
              wartezeitVon: r.wartezeitVon,
              wartezeitBis: r.wartezeitBis,
              wartezeitStd: computedWartezeitStd,
              wickel: r.wickel,
              preis: r.preis,
              ps: r.ps,
              extraTeam: r.extraTeam,
              bemerkung: r.bemerkung,
              warnings: this.serializeRowWarnings(r.warnings, r.anderweitigeArbeiten),
              uncertainFields: (r.uncertainFields as any) ?? undefined,
            };
          }),
        },
      },
      include: {
        rows: {
          orderBy: { rowOrder: 'asc' },
        },
        createdBy: {
          select: { id: true, name: true, username: true },
        },
      },
    });

    return this.hydrateListRows(list);
  }

  /**
   * List all saved container lists with pagination and optional site filter.
   */
  async findAll(page: number = 1, limit: number = 10, site?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (site) where.site = site;

    const [total, items] = await Promise.all([
      this.prisma.containerList.count({ where }),
      this.prisma.containerList.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { rows: true } },
          createdBy: { select: { id: true, name: true, username: true } },
        },
      }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Find single container list by ID with all rows.
   */
  async findOne(id: string) {
    const list = await this.prisma.containerList.findUnique({
      where: { id },
      include: {
        rows: {
          orderBy: { rowOrder: 'asc' },
        },
        createdBy: {
          select: { id: true, name: true, username: true },
        },
      },
    });

    if (!list) {
      throw new NotFoundException(`ContainerList with ID ${id} not found`);
    }

    return this.hydrateListRows(list);
  }

  /**
   * Update a container list and its rows.
   */
  async update(id: string, dto: UpdateContainerListDto) {
    await this.findOne(id); // Ensure exists

    const updated = await this.prisma.$transaction(async (tx) => {
      const updateData: any = {};
      if (dto.site !== undefined) updateData.site = dto.site;
      if (dto.title !== undefined) updateData.title = dto.title;
      if (dto.date !== undefined) updateData.date = dto.date ? new Date(dto.date) : null;
      if (dto.status !== undefined) updateData.status = dto.status;
      if (dto.notes !== undefined) updateData.notes = dto.notes;

      if (dto.rows && Array.isArray(dto.rows)) {
        await tx.containerListRow.deleteMany({
          where: { containerListId: id },
        });

        await tx.containerListRow.createMany({
          data: dto.rows.map((r, index) => {
            const calc = calculateRowWaitingWorkerHours(r);
            const computedWartezeitStd =
              (r.wartezeitVon || r.wartezeitBis) && r.personal && r.personal > 0
                ? formatGermanStd(calc.workerHours).replace(/\s*Std\.$/, '')
                : r.wartezeitStd;

            return {
              containerListId: id,
              rowOrder: r.rowOrder ?? index,
              date: r.date,
              containerNumber: r.containerNumber,
              fuss: r.fuss,
              artikel: r.artikel,
              kartons: r.kartons,
              termin: r.termin,
              ankunft: r.ankunft,
              start: r.start,
              ende: r.ende,
              personal: r.personal,
              wartezeitVon: r.wartezeitVon,
              wartezeitBis: r.wartezeitBis,
              wartezeitStd: computedWartezeitStd,
              wickel: r.wickel,
              preis: r.preis,
              ps: r.ps,
              extraTeam: r.extraTeam,
              bemerkung: r.bemerkung,
              warnings: this.serializeRowWarnings(r.warnings, r.anderweitigeArbeiten),
              uncertainFields: (r.uncertainFields as any) ?? undefined,
            };
          }),
        });
      }

      return tx.containerList.update({
        where: { id },
        data: updateData,
        include: {
          rows: { orderBy: { rowOrder: 'asc' } },
          createdBy: { select: { id: true, name: true, username: true } },
        },
      });
    });

    return this.hydrateListRows(updated);
  }

  /**
   * Converts a 1-based column index to Excel column letter (1 -> A, 2 -> B, etc.).
   */
  private colToLetter(col: number): string {
    let temp = col;
    let letter = '';
    while (temp > 0) {
      const rem = (temp - 1) % 26;
      letter = String.fromCharCode(65 + rem) + letter;
      temp = Math.floor((temp - 1) / 26);
    }
    return letter;
  }

  /**
   * Resolves canonical template filename for a site name.
   */
  private resolveTemplateFileName(site: string, templatesDir: string): string {
    const matched = matchCustomerSite(site);
    const candidateSite = matched.matchedSite || site;
    const directPath = path.join(templatesDir, `${candidateSite}.xlsx`);
    if (fs.existsSync(directPath)) {
      return `${candidateSite}.xlsx`;
    }
    const files = fs.readdirSync(templatesDir).filter((f) => f.endsWith('.xlsx'));
    const ciMatch = files.find(
      (f) => f.toLowerCase() === `${candidateSite.toLowerCase()}.xlsx`,
    );
    if (ciMatch) return ciMatch;
    return `${site}.xlsx`;
  }

  /**
   * Export a saved container list to the site's original Excel template using exceljs.
   * Preserves original weekly/daily blocks, summary rows, Dauer formulas (Ende - Start),
   * Summe formulas, combined Wartezeit von-bis text cell, and Schwalbe-only summary/headers.
   */
  async exportXlsx(id: string) {
    const list = await this.findOne(id);

    const templatesDir = path.join(process.cwd(), 'templates', 'container-lists');
    const templateFileName = this.resolveTemplateFileName(list.site, templatesDir);
    const templatePath = path.join(templatesDir, templateFileName);

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template not found for site ${list.site}: ${templatePath}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);

    const sheet =
      workbook.getWorksheet(list.site === 'Gant' ? 'KW ' : 'KW') ||
      workbook.worksheets.find((ws) => ws.name.trim() === 'KW') ||
      workbook.worksheets[0];

    if (!sheet) {
      throw new Error('No worksheet found in template');
    }

    // 1. Detect header row dynamically
    let headerRow = 1;
    for (let r = 1; r <= Math.min(6, sheet.rowCount); r++) {
      const texts: string[] = [];
      sheet.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
        if (cell.value) texts.push(String(cell.value).trim().toLowerCase());
      });
      if (
        texts.some((t) => t.includes('datum')) &&
        texts.some((t) => t.includes('container'))
      ) {
        headerRow = r;
        break;
      }
    }

    // 2. Map columns strictly from headerRow
    const headerCells = new Map<number, string>();
    sheet.getRow(headerRow).eachCell({ includeEmpty: false }, (cell, col) => {
      if (cell.value !== null && cell.value !== undefined) {
        const normalizedHeader = String(cell.value)
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
        headerCells.set(col, normalizedHeader);
      }
    });

    const findCol = (predicate: (h: string) => boolean): number => {
      for (const [col, h] of headerCells.entries()) {
        if (predicate(h)) return col;
      }
      return -1;
    };

    const idx = {
      pos: 1,
      date: findCol((h) => h === 'datum' || h === 'we-datum' || h.includes('datum')),
      container: findCol((h) => h.includes('container')),
      fuss: findCol((h) => h.startsWith('fuß') || h.startsWith('fuss')),
      artikel: findCol((h) => h.includes('artikel')),
      kartons: findCol((h) => h.includes('karton')),
      termin: findCol((h) => h === 'termin' || h.includes('termin')),
      ankunft: findCol((h) => h === 'ankunft' || h.includes('ankunft')),
      start: findCol((h) => h.includes('beginn') || h === 'start'),
      ende: findCol((h) => h.includes('ende') || h === 'end'),
      dauer: findCol((h) => h === 'dauer'),
      personal: findCol((h) => h === 'personal' || h === 'personal anzahl' || h.includes('personal')),
      wartezeit: findCol((h) => h.startsWith('wartezeit')),
      wickel: findCol((h) => h === 'wickel' || h.includes('wickel')),
      kunde: findCol((h) => h === 'kunde'),
      preis: findCol((h) => h === 'preis'),
      ps: findCol((h) => h === 'ps.' || h === 'ps'),
      bemerkung: findCol((h) => h === 'bemerkung'),
      extraTeam: findCol((h) => h.includes('extra team')),
    };

    // 3. Discover template blocks, summary rows, and grand total row
    const blocks: TemplateBlock[] = [];
    let currentDataRows: number[] = [];
    let grandTotalRow = -1;

    const getCellText = (r: number, c: number): string => {
      if (c <= 0) return '';
      const val = sheet.getCell(r, c).value;
      if (val === null || val === undefined) return '';
      if (typeof val === 'object') {
        if ('formula' in val || 'sharedFormula' in val) {
          return String((val as any).result ?? '');
        }
        if ('richText' in val && Array.isArray((val as any).richText)) {
          return (val as any).richText.map((t: any) => t.text || '').join('');
        }
      }
      return String(val);
    };

    for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
      const colCText = getCellText(r, idx.container > 0 ? idx.container : 3).trim();
      const colCNormalized = colCText.replace(/\s+/g, ' ').toLowerCase();

      // Check if this row is the grand total row ("Summe", "SUMME:", or SUM formula in Preis)
      const preisCellVal = idx.preis > 0 ? sheet.getCell(r, idx.preis).value : null;
      const hasSumFormula =
        preisCellVal &&
        typeof preisCellVal === 'object' &&
        'formula' in preisCellVal &&
        String((preisCellVal as any).formula).toUpperCase().includes('SUM(');

      let hasSummeLabel = false;
      sheet.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
        const txt = String(cell.value ?? '').trim().toLowerCase();
        if (txt.startsWith('summe')) hasSummeLabel = true;
      });

      if (hasSumFormula || hasSummeLabel) {
        grandTotalRow = r;
        break;
      }

      // Check if this row is a Wartezeit summary row
      if (
        colCNormalized === 'wartezeit' ||
        colCNormalized === 'gesamt wartezeit'
      ) {
        // Find which column holds the "0 Std." / "1:40 Std." summary value
        let wzValCol = -1;
        sheet.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
          if (col === (idx.container > 0 ? idx.container : 3)) return;
          const txt = String(cell.value ?? '').trim().toLowerCase();
          if (txt.includes('std')) {
            wzValCol = col;
          }
        });
        if (wzValCol < 0) {
          wzValCol = idx.kartons > 0 ? idx.kartons : 6;
        }

        const block: TemplateBlock = {
          dataRows: [...currentDataRows],
          wartezeitSummaryRow: r,
          wartezeitLabelCol: idx.container > 0 ? idx.container : 3,
          wartezeitValueCol: wzValCol,
        };
        currentDataRows = [];

        // Check if next row is Schwalbe's "Gesamt Personal Std. ohne Wartezeit"
        const nextRow = r + 1;
        if (nextRow <= sheet.rowCount) {
          const nextCText = getCellText(
            nextRow,
            idx.container > 0 ? idx.container : 3,
          )
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
          if (nextCText.includes('gesamt personal std. ohne wartezeit')) {
            let pStdValCol = idx.personal > 0 ? idx.personal : 13;
            sheet.getRow(nextRow).eachCell({ includeEmpty: false }, (cell, col) => {
              if (col === (idx.container > 0 ? idx.container : 3)) return;
              const txt = String(cell.value ?? '').trim().toLowerCase();
              if (txt.includes('std')) {
                pStdValCol = col;
              }
            });
            block.personalStdSummaryRow = nextRow;
            block.personalStdLabelCol = idx.container > 0 ? idx.container : 3;
            block.personalStdValueCol = pStdValCol;
            r = nextRow; // Advance past the second summary row
          }
        }

        blocks.push(block);
        continue;
      }

      // Regular container data row in current block
      const posVal = sheet.getCell(r, 1).value;
      const kundeVal = idx.kunde > 0 ? getCellText(r, idx.kunde).trim() : '';
      if (posVal !== null && posVal !== undefined && String(posVal).trim() !== '' || kundeVal) {
        currentDataRows.push(r);
      }
    }

    // 4. Capture template defaults from the first data row before cleaning
    const sampleRowNum = blocks[0]?.dataRows[0] ?? headerRow + 1;
    const rawPosSample = sheet.getCell(sampleRowNum, 1).value;
    const usesNumericPos = typeof rawPosSample === 'number';
    const defaultKundeVal =
      idx.kunde > 0
        ? getCellText(sampleRowNum, idx.kunde).trim() || list.site
        : list.site;
    const rawDefaultFuss =
      idx.fuss > 0 ? sheet.getCell(sampleRowNum, idx.fuss).value : null;
    const defaultFussVal =
      rawDefaultFuss !== null && rawDefaultFuss !== undefined && String(rawDefaultFuss).trim() !== ''
        ? rawDefaultFuss
        : null;

    // 5. Group input rows into blocks (by distinct date when <= blocks.length, else by ISO week / sequential blocks)
    const inputRows = [...(list.rows || [])];
    const dateGroups: { key: string; rows: any[] }[] = [];
    let lastDateKey = '';

    for (const r of inputRows) {
      const rawDate = (r.date || '').trim();
      const effectiveKey = rawDate || lastDateKey || '__block_0__';
      if (rawDate) lastDateKey = rawDate;

      let group = dateGroups.find((g) => g.key === effectiveKey);
      if (!group) {
        group = { key: effectiveKey, rows: [] };
        dateGroups.push(group);
      }
      group.rows.push(r);
    }

    // Map groups to template blocks
    const assignedBlockRows: any[][] = blocks.map(() => []);
    if (dateGroups.length <= blocks.length) {
      dateGroups.forEach((g, idxGroup) => {
        assignedBlockRows[idxGroup] = g.rows;
      });
    } else {
      // More date groups than template blocks: group by ISO calendar week or distribute across blocks
      const weekGroups: { key: string; rows: any[] }[] = [];
      for (const g of dateGroups) {
        const weekKey = this.getIsoWeekKey(g.key);
        let wg = weekGroups.find((w) => w.key === weekKey);
        if (!wg) {
          wg = { key: weekKey, rows: [] };
          weekGroups.push(wg);
        }
        wg.rows.push(...g.rows);
      }
      weekGroups.forEach((wg, idxWeek) => {
        const targetBlock = Math.min(idxWeek, blocks.length - 1);
        assignedBlockRows[targetBlock].push(...wg.rows);
      });
    }

    // If any block has more assigned rows than pre-allocated dataRows in the template,
    // insert additional rows into that block from bottom block to top block so indices stay aligned.
    for (let b = blocks.length - 1; b >= 0; b--) {
      const needed = assignedBlockRows[b].length;
      const available = blocks[b].dataRows.length;
      if (needed > available && available > 0) {
        const extra = needed - available;
        const lastDataRow = blocks[b].dataRows[available - 1];
        sheet.duplicateRow(lastDataRow, extra, true);

        // Update row indices for current block and all subsequent blocks + grandTotalRow
        for (let k = 1; k <= extra; k++) {
          blocks[b].dataRows.push(lastDataRow + k);
        }
        blocks[b].wartezeitSummaryRow += extra;
        if (blocks[b].personalStdSummaryRow !== undefined) {
          blocks[b].personalStdSummaryRow! += extra;
        }
        for (let nextB = b + 1; nextB < blocks.length; nextB++) {
          blocks[nextB].dataRows = blocks[nextB].dataRows.map((rn) => rn + extra);
          blocks[nextB].wartezeitSummaryRow += extra;
          if (blocks[nextB].personalStdSummaryRow !== undefined) {
            blocks[nextB].personalStdSummaryRow! += extra;
          }
        }
        if (grandTotalRow > 0) {
          grandTotalRow += extra;
        }
      }
    }

    const startColLetter = idx.start > 0 ? this.colToLetter(idx.start) : '';
    const endeColLetter = idx.ende > 0 ? this.colToLetter(idx.ende) : '';

    const toTimeCellValue = (val: string | null | undefined): number | string | null => {
      if (!val || !String(val).trim()) return null;
      const s = String(val).trim();
      const parsed = parseClockTime(s, true);
      if (parsed.minutes !== null && !parsed.isUnclear) {
        return parsed.minutes / 1440;
      }
      return s;
    };

    const setTimeCell = (rowNum: number, colNum: number, val: string | null | undefined) => {
      if (colNum <= 0) return;
      const cell = sheet.getCell(rowNum, colNum);
      const converted = toTimeCellValue(val);
      cell.value = converted;
      if (typeof converted === 'number') {
        cell.numFmt = 'h:mm';
      }
    };

    // 6. Populate each block's container rows and summary rows
    for (let b = 0; b < blocks.length; b++) {
      const block = blocks[b];
      const bRows = assignedBlockRows[b] || [];
      let blockWartezeitWorkerHours = 0;
      let blockWorkWorkerHoursOhneWartezeit = 0;

      for (let s = 0; s < block.dataRows.length; s++) {
        const excelRow = block.dataRows[s];
        const r = bRows[s];

        // Position number in Col A
        sheet.getCell(excelRow, 1).value = usesNumericPos ? s + 1 : `${s + 1}.`;

        // Clear mutable data cells first (cleans sample row in Gant.xlsx while preserving styles)
        const clearCols = [
          idx.date,
          idx.container,
          idx.artikel,
          idx.kartons,
          idx.termin,
          idx.ankunft,
          idx.start,
          idx.ende,
          idx.personal,
          idx.wartezeit,
          idx.wickel,
          idx.preis,
          idx.ps,
          idx.bemerkung,
          idx.extraTeam,
        ];
        for (const c of clearCols) {
          if (c > 0) sheet.getCell(excelRow, c).value = null;
        }
        if (idx.fuss > 0) {
          sheet.getCell(excelRow, idx.fuss).value = defaultFussVal;
        }
        if (idx.kunde > 0) {
          sheet.getCell(excelRow, idx.kunde).value = defaultKundeVal;
        }

        // Compute Dauer formula (Ende - Start) and preserve it on every container row
        let dauerResult = 0;
        if (r) {
          const pStart = parseClockTime(r.start, true);
          const pEnde = parseClockTime(r.ende, true);
          if (
            pStart.minutes !== null &&
            pEnde.minutes !== null &&
            pEnde.minutes >= pStart.minutes
          ) {
            dauerResult = (pEnde.minutes - pStart.minutes) / 1440;
          }
        }
        if (idx.dauer > 0 && startColLetter && endeColLetter) {
          const dauerCell = sheet.getCell(excelRow, idx.dauer);
          dauerCell.value = {
            formula: `${endeColLetter}${excelRow}-${startColLetter}${excelRow}`,
            result: dauerResult,
          };
          dauerCell.numFmt = 'h:mm';
        }

        if (!r) continue;

        // Populate row values
        if (idx.date > 0) {
          sheet.getCell(excelRow, idx.date).value = r.date || null;
        }
        if (idx.container > 0) {
          sheet.getCell(excelRow, idx.container).value = r.containerNumber || null;
        }
        if (idx.fuss > 0) {
          const fussRaw = r.fuss !== undefined && r.fuss !== null && String(r.fuss).trim() !== ''
            ? r.fuss
            : defaultFussVal;
          sheet.getCell(excelRow, idx.fuss).value =
            fussRaw !== null && !isNaN(Number(fussRaw)) ? Number(fussRaw) : fussRaw;
        }
        if (idx.artikel > 0) {
          const artRaw = r.artikel;
          sheet.getCell(excelRow, idx.artikel).value =
            artRaw !== undefined && artRaw !== null && String(artRaw).trim() !== ''
              ? !isNaN(Number(artRaw))
                ? Number(artRaw)
                : String(artRaw)
              : null;
        }
        if (idx.kartons > 0) {
          sheet.getCell(excelRow, idx.kartons).value = r.kartons ?? null;
        }
        setTimeCell(excelRow, idx.termin, r.termin);
        setTimeCell(excelRow, idx.ankunft, r.ankunft);
        setTimeCell(excelRow, idx.start, r.start);
        setTimeCell(excelRow, idx.ende, r.ende);

        if (idx.personal > 0) {
          sheet.getCell(excelRow, idx.personal).value = r.personal ?? null;
        }

        // Wartezeit von-bis is ONE combined text cell (e.g. "09:00 bis 09:50")
        if (idx.wartezeit > 0) {
          sheet.getCell(excelRow, idx.wartezeit).value = formatCombinedWartezeitCell(
            r.wartezeitVon,
            r.wartezeitBis,
          );
        }

        if (idx.wickel > 0) {
          sheet.getCell(excelRow, idx.wickel).value = r.wickel || null;
        }
        if (idx.preis > 0) {
          sheet.getCell(excelRow, idx.preis).value = r.preis ?? null;
        }
        if (idx.ps > 0) {
          sheet.getCell(excelRow, idx.ps).value = r.ps || null;
        }
        if (idx.extraTeam > 0) {
          sheet.getCell(excelRow, idx.extraTeam).value = r.extraTeam || null;
        }
        if (idx.bemerkung > 0) {
          sheet.getCell(excelRow, idx.bemerkung).value = r.bemerkung || null;
        }

        // Accumulate waiting worker-hours (with deductions for anderweitigeArbeiten)
        const wzCalc = calculateRowWaitingWorkerHours(r);
        blockWartezeitWorkerHours += wzCalc.workerHours;

        // Accumulate work worker-hours without waiting time (for Schwalbe)
        const workCalc = calculateRowWorkWorkerHoursWithoutWaiting(r);
        blockWorkWorkerHoursOhneWartezeit += workCalc.workerHours;
      }

      // Write block Wartezeit summary cell
      sheet.getCell(block.wartezeitSummaryRow, block.wartezeitValueCol).value =
        formatGermanStd(blockWartezeitWorkerHours);

      // Write Schwalbe-only "Gesamt Personal Std. ohne Wartezeit" summary cell if present in template
      if (
        block.personalStdSummaryRow !== undefined &&
        block.personalStdValueCol !== undefined
      ) {
        sheet.getCell(block.personalStdSummaryRow, block.personalStdValueCol).value =
          formatGermanStd(blockWorkWorkerHoursOhneWartezeit);
      }
    }

    // 7. Preserve Grand Total SUM formula
    if (grandTotalRow > 0 && idx.preis > 0) {
      const preisColLetter = this.colToLetter(idx.preis);
      const firstRow = headerRow + 1;
      const lastRow = grandTotalRow - 1;
      const totalPreis = inputRows.reduce((sum, r) => sum + (Number(r.preis) || 0), 0);
      sheet.getCell(grandTotalRow, idx.preis).value = {
        formula: `SUM(${preisColLetter}${firstRow}:${preisColLetter}${lastRow})`,
        result: totalPreis,
      };
    }

    const outDir = path.join(process.cwd(), 'storage', 'exports');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `${list.site}-CTR-${list.id}.xlsx`);
    const buffer = await workbook.xlsx.writeBuffer();
    fs.writeFileSync(outFile, buffer as any);

    return { filePath: outFile, filename: path.basename(outFile) };
  }

  private getIsoWeekKey(dateStr: string): string {
    const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    let d: Date | null = null;
    if (isoMatch) {
      d = new Date(
        Date.UTC(
          parseInt(isoMatch[1], 10),
          parseInt(isoMatch[2], 10) - 1,
          parseInt(isoMatch[3], 10),
        ),
      );
    } else {
      const deMatch = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?/);
      if (deMatch) {
        const yearRaw = deMatch[3] ? parseInt(deMatch[3], 10) : new Date().getUTCFullYear();
        const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
        d = new Date(Date.UTC(year, parseInt(deMatch[2], 10) - 1, parseInt(deMatch[1], 10)));
      }
    }
    if (!d || isNaN(d.getTime())) return dateStr;

    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }

  /**
   * Export a saved container list to a PDF matching the Excel layout.
   * Uses pdfkit. German language throughout.
   */
  async exportPdf(id: string) {
    const list = await this.findOne(id);
    const rows = list.rows || [];

    const outDir = path.join(process.cwd(), 'storage', 'exports');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `${list.site}-CTR-${list.id}.pdf`);

    const doc = new PDFDocument({
      layout: 'landscape',
      margin: 40,
    });

    const stream = fs.createWriteStream(outFile);
    doc.pipe(stream);

    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text(`Container-Liste — ${list.site}`, { align: 'center' });
    doc
      .fontSize(10)
      .font('Helvetica')
      .text(
        `Titel: ${list.title || '—'}  |  Datum: ${list.date ? new Date(list.date).toLocaleDateString('de-DE') : '—'}  |  Erfasst am: ${new Date(list.createdAt).toLocaleDateString('de-DE')}`,
        { align: 'center' },
      );
    doc.moveDown(1);

    const isSchwalbe = matchCustomerSite(list.site).matchedSite === 'Schwalbe';
    const isGant = matchCustomerSite(list.site).matchedSite === 'Gant';

    const headers = [
      'Pos.',
      'Datum',
      'Container-Nr.',
      'Fuß',
      'Artikel',
      'Kartons',
      'Termin',
      'Ankunft',
      'Start',
      'Ende',
      isSchwalbe ? 'Personal Anzahl' : 'Pers.',
      isGant ? 'Wartezeit' : 'Wartezeit Von-Bis',
      'Wickel',
      'Bemerkung',
    ];

    const colWidths = [24, 50, 86, 26, 46, 34, 38, 38, 38, 38, 36, 70, 38, 100];
    let y = doc.y;
    const startX = 40;

    let x = startX;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#374151');
    headers.forEach((h, i) => {
      doc
        .rect(x - 1, y - 1, colWidths[i] + 2, 14)
        .fill('#f3f4f6')
        .stroke('#d1d5db');
      doc
        .fillColor('#111827')
        .text(h, x, y + 1, { width: colWidths[i], align: 'center' });
      x += colWidths[i] + 4;
    });
    y += 16;

    let totalWaitingWorkerHours = 0;
    let totalWorkWorkerHoursOhneWartezeit = 0;

    rows.forEach((r, idxRow) => {
      const combinedWz = formatCombinedWartezeitCell(r.wartezeitVon, r.wartezeitBis) || '';
      const wzCalc = calculateRowWaitingWorkerHours(r);
      totalWaitingWorkerHours += wzCalc.workerHours;
      const workCalc = calculateRowWorkWorkerHoursWithoutWaiting(r);
      totalWorkWorkerHoursOhneWartezeit += workCalc.workerHours;

      const rowVals = [
        String(idxRow + 1),
        r.date || '',
        r.containerNumber || '',
        r.fuss || '',
        r.artikel || '',
        r.kartons ? String(r.kartons) : '',
        r.termin || '',
        r.ankunft || '',
        r.start || '',
        r.ende || '',
        r.personal ? String(r.personal) : '',
        combinedWz,
        r.wickel || '',
        r.bemerkung || '',
      ];

      const uncertainFields = Array.isArray(r.uncertainFields) ? r.uncertainFields : [];
      const isUncertain = uncertainFields.length > 0;
      const hasMissingPersonal = !r.personal || r.personal <= 0;
      const rowColor = isUncertain ? '#fef3c7' : hasMissingPersonal ? '#fee2e2' : null;

      x = startX;
      doc.font('Helvetica').fontSize(8).fillColor('#111827');
      rowVals.forEach((val, i) => {
        if (rowColor) {
          doc
            .rect(x - 1, y - 1, colWidths[i] + 2, 14)
            .fill(rowColor)
            .stroke('#e5e7eb');
        }
        const align = ['Kartons', 'Pers.', 'Personal Anzahl', 'Fuß'].includes(headers[i])
          ? 'right'
          : 'left';
        doc.fillColor('#111827').text(val, x, y + 1, { width: colWidths[i], align });
        x += colWidths[i] + 4;
      });
      y += 16;

      if (y > 720) {
        doc.addPage({ layout: 'landscape', margin: 40 });
        y = 60;
      }
    });

    y += 6;
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#111827')
      .text(
        `${isSchwalbe ? 'Gesamt Wartezeit' : 'Wartezeit'}: ${formatGermanStd(totalWaitingWorkerHours)}`,
        startX,
        y,
      );
    if (isSchwalbe) {
      y += 14;
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#111827')
        .text(
          `Gesamt Personal Std. ohne Wartezeit: ${formatGermanStd(totalWorkWorkerHoursOhneWartezeit)}`,
          startX,
          y,
        );
    }

    doc.end();

    await new Promise<void>((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    return { filePath: outFile, filename: path.basename(outFile) };
  }

  /**
   * Delete a container list.
   */
  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.containerList.delete({
      where: { id },
    });
  }
}
