import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContainerListDto, UpdateContainerListDto } from './dto/container-list.dto';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import PDFDocument from 'pdfkit';

@Injectable()
export class ContainerListsService {
  private readonly logger = new Logger(ContainerListsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Save a reviewed container list and all its rows to the database.
   */
  async create(dto: CreateContainerListDto, createdById?: string) {
    this.logger.log(`Saving container list for site ${dto.site} with ${dto.rows?.length || 0} rows...`);

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
          create: (dto.rows || []).map((r, index) => ({
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
            wartezeitStd: r.wartezeitStd,
            wickel: r.wickel,
            preis: r.preis,
            ps: r.ps,
            extraTeam: r.extraTeam,
            bemerkung: r.bemerkung,
            warnings: r.warnings ? JSON.stringify(r.warnings) : undefined,
            uncertainFields: r.uncertainFields ? JSON.stringify(r.uncertainFields) : undefined,
          })),
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

    return list;
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

    return list;
  }

  /**
   * Update a container list and its rows.
   */
  async update(id: string, dto: UpdateContainerListDto) {
    await this.findOne(id); // Ensure exists

    return this.prisma.$transaction(async (tx) => {
      // 1. Update parent
      const updateData: any = {};
      if (dto.site !== undefined) updateData.site = dto.site;
      if (dto.title !== undefined) updateData.title = dto.title;
      if (dto.date !== undefined) updateData.date = dto.date ? new Date(dto.date) : null;
      if (dto.status !== undefined) updateData.status = dto.status;
      if (dto.notes !== undefined) updateData.notes = dto.notes;

      // 2. If rows are provided, replace them
      if (dto.rows && Array.isArray(dto.rows)) {
        await tx.containerListRow.deleteMany({
          where: { containerListId: id },
        });

        await tx.containerListRow.createMany({
          data: dto.rows.map((r, index) => ({
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
            wartezeitStd: r.wartezeitStd,
            wickel: r.wickel,
            preis: r.preis,
            ps: r.ps,
            extraTeam: r.extraTeam,
            bemerkung: r.bemerkung,
            warnings: r.warnings ? JSON.stringify(r.warnings) : undefined,
            uncertainFields: r.uncertainFields ? JSON.stringify(r.uncertainFields) : undefined,
          })),
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
  }

  /**
   * Export a saved container list to the site's original Excel template
   * using exceljs. Clears previous data rows, fills new rows, preserves
   * template formatting / formulas / number formats.
   */
  async exportXlsx(id: string) {
    const list = await this.findOne(id);

    const templatesDir = path.join(process.cwd(), 'templates', 'container-lists');
    const templateFileName = `${list.site}.xlsx`;
    const templatePath = path.join(templatesDir, templateFileName);

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template not found for site ${list.site}: ${templatePath}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);

    // Sheet names are like "KW " (with trailing space for Gant) or "KW"
    const sheet = workbook.getWorksheet(list.site === 'Gant' ? 'KW ' : 'KW') 
      || workbook.worksheets.find((ws) => ws.name.trim() === list.site) 
      || workbook.worksheets[0];

    if (!sheet) {
      throw new Error('No worksheet found in template');
    }

    // Determine header row: Row 2 (1-based) based on inspection
    const headerRow = 2;
    const firstDataRow = 3; // Header at row 2, data starts row 3

    // Identify column indexes from header row by normalized header text
    const colIndex = (field: string, aliases: string[]): number => {
      const headers: string[] = [];
      sheet.getRow(headerRow).eachCell({ includeEmpty: true }, (cell, col) => {
        if (cell.value) {
          const val = String(cell.value).trim().toLowerCase();
          headers.push(`${col}:${val}`);
          const alias = aliases.find((a) => val.includes(a));
          if (alias) return col; // will be overwritten by last match, so break logic better
        }
      });
      // simple loop approach below
      const cellMap = new Map<string, number>();
      sheet.getRow(headerRow).eachCell({ includeEmpty: true }, (cell, col) => {
        if (cell.value) {
          cellMap.set(String(cell.value).trim().toLowerCase(), col);
        }
      });
      for (const alias of aliases) {
        const found = [...cellMap.keys()].find((k) => k.includes(alias.toLowerCase()));
        if (found) return cellMap.get(found)!;
      }
      return -1;
    };

    const idx = {
      date: colIndex('date', ['datum', 'we-datum']),
      container: colIndex('container', ['containernr', 'container nr', 'container no', 'container number']),
      fuss: colIndex('fuss', ['fuß', 'fuss', 'fuß lkw', 'fuss lkw']),
      artikel: colIndex('artikel', ['artikel', 'anzahl artikel']),
      kartons: colIndex('kartons', ['kartons', 'anzahl kartons']),
      termin: colIndex('termin', ['termin']),
      ankunft: colIndex('ankunft', ['ankunft']),
      start: colIndex('start', ['beginn der entw', 'start', 'beginn']),
      ende: colIndex('ende', ['ende der entw', 'ende', 'end']),
      personal: colIndex('personal', ['personal']),
      wartezeitVon: colIndex('wartezeitvon', ['wartezeit von', 'wartezeit von-bis', 'wartezeit']),
      wartezeitBis: colIndex('wartezeitbis', ['wartezeit von', 'wartezeit von-bis', 'wartezeit']),
      wartezeitStd: colIndex('wartezeitstd', ['dauer', 'wartezeit', 'dauer']),
      wickel: colIndex('wickel', ['wickel']),
      preis: colIndex('preis', ['preis']),
      ps: colIndex('ps', ['ps']),
      extraTeam: colIndex('extrateam', ['extra team', 'extrateam']),
      bemerkung: colIndex('bemerkung', ['bemerkung', 'kunde']),
    };

    // Clear old data rows (from row firstDataRow to max row with content, or until e.g. row 1000)
    const maxRow = Math.max(sheet.actualRowCount || 0, sheet.rowCount, 150);
    for (let r = firstDataRow; r <= maxRow; r++) {
      sheet.getRow(r).values = [];
      for (let c = 1; c <= sheet.columnCount; c++) {
        const cell = sheet.getCell(r, c);
        cell.value = null;
      }
    }

    const nowDate = new Date();
    const rows = list.rows || [];

    // Number format for time: "hh:mm"
    const timeFmt = 'hh:mm';

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const excelRow = firstDataRow + i;

      const timeToCell = (val: string): Date | any => {
        if (!val) return null;
        const m = val.trim().match(/^(\d{1,2}):(\d{2})$/);
        if (!m) return null;
        const d = new Date(nowDate);
        d.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0);
        return d;
      };

      if (idx.date >= 0) {
        const d = timeToCell(r.date || '');
        sheet.getCell(excelRow, idx.date).value = d;
        if (d) sheet.getCell(excelRow, idx.date).numFmt = 'mm-dd-yy';
      }
      if (idx.container >= 0) {
        sheet.getCell(excelRow, idx.container).value = r.containerNumber || null;
        sheet.getCell(excelRow, idx.container).font = { bold: true };
      }
      if (idx.fuss >= 0) {
        sheet.getCell(excelRow, idx.fuss).value = r.fuss || null;
      }
      if (idx.artikel >= 0) {
        sheet.getCell(excelRow, idx.artikel).value = r.artikel || null;
      }
      if (idx.kartons >= 0) {
        sheet.getCell(excelRow, idx.kartons).value = r.kartons ?? null;
      }
      if (idx.termin >= 0) {
        sheet.getCell(excelRow, idx.termin).value = timeToCell(r.termin || '');
      }
      if (idx.ankunft >= 0) {
        sheet.getCell(excelRow, idx.ankunft).value = timeToCell(r.ankunft || '');
      }
      if (idx.start >= 0) {
        sheet.getCell(excelRow, idx.start).value = timeToCell(r.start || '');
      }
      if (idx.ende >= 0) {
        sheet.getCell(excelRow, idx.ende).value = timeToCell(r.ende || '');
      }
      if (idx.personal >= 0) {
        sheet.getCell(excelRow, idx.personal).value = r.personal ?? null;
        sheet.getCell(excelRow, idx.personal).numFmt = '0';
      }

      // Wartezeit Von/Bis handled via wartezeitVon/wartezeitBis if indices exist, but template Dauer formula handles calculation.
      // For Gant, Dauer = H2-G2 formula; we can set values and let formula recalc? Simpler: set values, formula remains.
      // To be safe, set Von/Bis into their columns if mapped.
      if (idx.wartezeitVon >= 0) {
        sheet.getCell(excelRow, idx.wartezeitVon).value = timeToCell(r.wartezeitVon || '');
      }
      if (idx.wartezeitBis >= 0) {
        sheet.getCell(excelRow, idx.wartezeitBis).value = timeToCell(r.wartezeitBis || '');
      }

      // Set calculated Wartezeit Std (Dauer) if no formula? We keep template formulas for Dauer.
      // If wartezeitStd provided, set it (overriding formula) - but requirement says preserve formulas.
      // For now: set value for 'dauer' if mapped and wartezeitStd present (formula may not compute correctly with time diff).
      if (idx.wartezeitStd >= 0 && r.wartezeitStd) {
        const calc = r.wartezeitStd; // format like "1:40" or "0"
        const d = new Date(nowDate);
        const parts = calc.split(':');
        if (parts.length === 2) {
          d.setHours(parseInt(parts[0], 10) || 0, parseInt(parts[1], 10) || 0, 0, 0);
        } else if (parseInt(calc, 10) > 0) {
          d.setHours(parseInt(calc, 10), 0, 0, 0);
        }
        sheet.getCell(excelRow, idx.wartezeitStd).value = d;
        sheet.getCell(excelRow, idx.wartezeitStd).numFmt = timeFmt;
      }

      if (idx.wickel >= 0) {
        sheet.getCell(excelRow, idx.wickel).value = r.wickel || null;
      }
      if (idx.preis >= 0) {
        sheet.getCell(excelRow, idx.preis).value = r.preis ?? null;
        sheet.getCell(excelRow, idx.preis).numFmt = '#,##0.00 "€"';
      }
      if (idx.ps >= 0) {
        sheet.getCell(excelRow, idx.ps).value = r.ps || null;
      }
      if (idx.extraTeam >= 0) {
        sheet.getCell(excelRow, idx.extraTeam).value = r.extraTeam || null;
        sheet.getCell(excelRow, idx.extraTeam).numFmt = '#,##0.00 "€"';
      }
      if (idx.bemerkung >= 0) {
        sheet.getCell(excelRow, idx.bemerkung).value = r.bemerkung || null;
      }
    }

    const outDir = path.join(process.cwd(), 'storage', 'exports');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `${list.site}-CTR-${list.id}.xlsx`);
    const buffer = await workbook.xlsx.writeBuffer();
    fs.writeFileSync(outFile, buffer as any);

    return { filePath: outFile, filename: path.basename(outFile) };
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

    // Header
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text(`Container-Liste (CTR-Liste) — ${list.site}`, { align: 'center' });
    doc
      .fontSize(10)
      .font('Helvetica')
      .text(`Titel: ${list.title || '—'}  |  Datum: ${list.date ? new Date(list.date).toLocaleDateString('de-DE') : '—'}  |  Erfasst am: ${new Date(list.createdAt).toLocaleDateString('de-DE')}`,
        { align: 'center' });
    doc.moveDown(1);

    // Column headers (German matching template)
    const headers = [
      'Pos.', 'Datum', 'Container-Nr.', 'Fuß', 'Artikel', 'Kartons', 'Termin',
      'Ankunft', 'Start', 'Ende', 'Pers.', 'Wartezeit Std', 'Wickel', 'Bemerkung',
    ];

    const colWidths = [26, 52, 90, 28, 50, 34, 40, 40, 40, 40, 28, 55, 40, 110];
    let y = doc.y;
    const startX = 40;

    // Table Header
    let x = startX;
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#374151');
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

    // Table Rows
    rows.forEach((r, idx) => {
      const rowVals = [
        String(idx + 1),
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
        r.wartezeitStd || '',
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
        const align = ['Kartons', 'Pers.', 'Wartezeit Std', 'Fuß'].includes(headers[i])
          ? 'right'
          : 'left';
        doc.fillColor('#111827').text(val, x, y + 1, { width: colWidths[i], align });
        x += colWidths[i] + 4;
      });
      y += 16;

      // New page if needed
      if (y > 750) {
        doc.addPage({ layout: 'landscape', margin: 40 });
        y = 60;
      }
    });

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
