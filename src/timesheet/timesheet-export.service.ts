import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

@Injectable()
export class TimesheetExportService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── PDF Export ────────────────────────────────────────────────────────────

  async exportPdf(timesheetId: string): Promise<Buffer> {
    const timesheet = await this.loadTimesheet(timesheetId);

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ margin: 40, size: 'A4' });

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.buildPdfContent(doc, timesheet);
      doc.end();
    });
  }

  private buildPdfContent(doc: PDFKit.PDFDocument, timesheet: any) {
    const primaryColor = '#1a56db';
    const lightGray = '#f8fafc';
    const borderColor = '#e2e8f0';

    // ── Header ──────────────────────────────────────────────────────────────
    doc
      .fontSize(20)
      .fillColor(primaryColor)
      .text('LogiFlow', 40, 40)
      .fontSize(10)
      .fillColor('#64748b')
      .text('Wöchentlicher Stundenzettel', 40, 65);

    // ── Trennlinie ───────────────────────────────────────────────────────────
    doc
      .moveTo(40, 85)
      .lineTo(555, 85)
      .strokeColor(primaryColor)
      .lineWidth(2)
      .stroke();

    // ── Mitarbeiter-Info ─────────────────────────────────────────────────────
    doc
      .fontSize(11)
      .fillColor('#1e293b')
      .text(`Mitarbeiter:`, 40, 100)
      .font('Helvetica-Bold')
      .text(timesheet.employee?.name ?? timesheet.employeeName, 140, 100)
      .font('Helvetica')
      .text(`Kalenderwoche:`, 40, 118)
      .text(this.getKw(timesheet.weekStartDate), 140, 118)
      .text(`Zeitraum:`, 40, 136)
      .text(this.getWeekRange(timesheet.weekStartDate), 140, 136);

    // ── Tabellen-Header ──────────────────────────────────────────────────────
    const tableTop = 165;
    const cols = [40, 110, 185, 240, 295, 350, 440];
    const headers = ['Wochentag', 'Datum', 'Von', 'Bis', 'Pause', 'Gesamt', 'Ort'];

    doc
      .rect(40, tableTop, 515, 18)
      .fillColor(primaryColor)
      .fill();

    headers.forEach((h, i) => {
      doc
        .fontSize(9)
        .fillColor('#ffffff')
        .font('Helvetica-Bold')
        .text(h, cols[i], tableTop + 4, { width: cols[i + 1] ? cols[i + 1] - cols[i] - 4 : 100 });
    });

    // ── Tabellenzeilen ───────────────────────────────────────────────────────
    let y = tableTop + 18;
    const rows = timesheet.entries ?? [];
    let totalHours = 0;

    rows.forEach((entry: any, idx: number) => {
      const rowColor = idx % 2 === 0 ? '#ffffff' : lightGray;
      doc
        .rect(40, y, 515, 17)
        .fillColor(rowColor)
        .fill();

      // Border
      doc
        .rect(40, y, 515, 17)
        .strokeColor(borderColor)
        .lineWidth(0.5)
        .stroke();

      const date = new Date(entry.date);
      const dateStr = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

      const rowData = [
        entry.weekday,
        dateStr,
        entry.startTime,
        entry.endTime,
        `${entry.breakMinutes} Min`,
        `${entry.totalHours.toFixed(2)} h`,
        entry.location ?? '—',
      ];

      rowData.forEach((text, i) => {
        doc
          .fontSize(9)
          .fillColor('#1e293b')
          .font('Helvetica')
          .text(String(text), cols[i], y + 4, {
            width: cols[i + 1] ? cols[i + 1] - cols[i] - 4 : 110,
            ellipsis: true,
          });
      });

      totalHours += entry.totalHours ?? 0;
      y += 17;
    });

    // ── Summenzeile ──────────────────────────────────────────────────────────
    doc
      .rect(40, y, 515, 20)
      .fillColor('#e2e8f0')
      .fill();

    doc
      .fontSize(10)
      .fillColor('#1e293b')
      .font('Helvetica-Bold')
      .text('Gesamt:', 285, y + 5)
      .text(`${totalHours.toFixed(2)} Stunden`, 350, y + 5);

    // ── Footer ───────────────────────────────────────────────────────────────
    doc
      .fontSize(8)
      .fillColor('#94a3b8')
      .font('Helvetica')
      .text(
        `Erstellt am ${new Date().toLocaleDateString('de-DE')} · LogiFlow Warehouse Management`,
        40,
        800,
        { align: 'center', width: 515 },
      );
  }

  // ─── XLSX Export ───────────────────────────────────────────────────────────

  async exportXlsx(timesheetId: string): Promise<Buffer> {
    const timesheet = await this.loadTimesheet(timesheetId);
    const workbook = new ExcelJS.Workbook();

    workbook.creator = 'LogiFlow';
    workbook.created = new Date();

    this.buildXlsxSheet(workbook, timesheet);
    this.buildXlsxInfoSheet(workbook, timesheet);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private buildXlsxSheet(workbook: ExcelJS.Workbook, timesheet: any) {
    const sheet = workbook.addWorksheet('Stundenzettel', {
      pageSetup: { paperSize: 9, orientation: 'landscape' },
    });

    // ── Spaltenbreiten ───────────────────────────────────────────────────────
    sheet.columns = [
      { key: 'weekday', width: 14 },
      { key: 'date', width: 14 },
      { key: 'startTime', width: 10 },
      { key: 'endTime', width: 10 },
      { key: 'breakMinutes', width: 12 },
      { key: 'totalHours', width: 14 },
      { key: 'location', width: 22 },
    ];

    // ── Titel ────────────────────────────────────────────────────────────────
    sheet.mergeCells('A1:G1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'Wöchentlicher Stundenzettel';
    titleCell.font = { bold: true, size: 16, color: { argb: 'FF1A56DB' } };
    titleCell.alignment = { horizontal: 'center' };
    sheet.getRow(1).height = 28;

    // ── Mitarbeiter-Info ─────────────────────────────────────────────────────
    sheet.getCell('A2').value = 'Mitarbeiter:';
    sheet.getCell('B2').value = timesheet.employee?.name ?? timesheet.employeeName;
    sheet.getCell('A3').value = 'Kalenderwoche:';
    sheet.getCell('B3').value = this.getKw(timesheet.weekStartDate);
    sheet.getCell('A4').value = 'Zeitraum:';
    sheet.getCell('B4').value = this.getWeekRange(timesheet.weekStartDate);

    [sheet.getCell('A2'), sheet.getCell('A3'), sheet.getCell('A4')].forEach((c) => {
      c.font = { bold: true, color: { argb: 'FF64748B' } };
    });
    [sheet.getCell('B2'), sheet.getCell('B3'), sheet.getCell('B4')].forEach((c) => {
      c.font = { bold: true };
    });

    sheet.getRow(5).height = 8; // spacer

    // ── Header Row ───────────────────────────────────────────────────────────
    const headerRow = sheet.getRow(6);
    const headers = ['Wochentag', 'Datum', 'Von', 'Bis', 'Pause (Min)', 'Gesamt (h)', 'Ort / Lager'];
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A56DB' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
    });
    headerRow.height = 20;

    // ── Datenzeilen ──────────────────────────────────────────────────────────
    const entries = timesheet.entries ?? [];
    entries.forEach((entry: any, idx: number) => {
      const rowNum = 7 + idx;
      const row = sheet.getRow(rowNum);
      const date = new Date(entry.date);

      row.getCell(1).value = entry.weekday;
      row.getCell(2).value = date.toLocaleDateString('de-DE');
      row.getCell(3).value = entry.startTime;
      row.getCell(4).value = entry.endTime;
      row.getCell(5).value = entry.breakMinutes;
      row.getCell(6).value = entry.totalHours;
      row.getCell(7).value = entry.location ?? '';

      // Alternating row colors
      const bgColor = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC';
      for (let c = 1; c <= 7; c++) {
        const cell = row.getCell(c);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
        if (c === 6) {
          cell.numFmt = '0.00';
          cell.alignment = { horizontal: 'right' };
        }
      }

      row.height = 16;
    });

    // ── Summenzeile ──────────────────────────────────────────────────────────
    const sumRowNum = 7 + entries.length;
    const sumRow = sheet.getRow(sumRowNum);
    sumRow.getCell(5).value = 'Gesamt:';
    sumRow.getCell(5).font = { bold: true };
    sumRow.getCell(5).alignment = { horizontal: 'right' };

    const totalHours = entries.reduce((sum: number, e: any) => sum + (e.totalHours ?? 0), 0);
    sumRow.getCell(6).value = totalHours;
    sumRow.getCell(6).numFmt = '0.00';
    sumRow.getCell(6).font = { bold: true, color: { argb: 'FF1A56DB' } };
    sumRow.getCell(6).alignment = { horizontal: 'right' };

    for (let c = 1; c <= 7; c++) {
      sumRow.getCell(c).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2E8F0' },
      };
    }
    sumRow.height = 20;
  }

  private buildXlsxInfoSheet(workbook: ExcelJS.Workbook, timesheet: any) {
    const sheet = workbook.addWorksheet('Info');
    sheet.columns = [{ width: 20 }, { width: 30 }];

    const rows = [
      ['Feld', 'Wert'],
      ['Erstellt am', new Date().toLocaleDateString('de-DE')],
      ['Mitarbeiter', timesheet.employee?.name ?? timesheet.employeeName],
      ['Wochenbeginn', new Date(timesheet.weekStartDate).toLocaleDateString('de-DE')],
      ['Status', timesheet.status === 'CONFIRMED' ? 'Bestätigt' : 'Ausstehend'],
      ['System', 'LogiFlow Warehouse Management'],
    ];

    rows.forEach((r, i) => {
      const row = sheet.getRow(i + 1);
      row.getCell(1).value = r[0];
      row.getCell(2).value = r[1];
      if (i === 0) {
        row.getCell(1).font = { bold: true };
        row.getCell(2).font = { bold: true };
      }
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async loadTimesheet(id: string) {
    const timesheet = await this.prisma.timesheet.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, name: true, phone: true } },
        entries: { orderBy: { date: 'asc' } },
      },
    });

    if (!timesheet) {
      throw new NotFoundException(`Stundenzettel mit ID ${id} nicht gefunden`);
    }

    return timesheet;
  }

  private getKw(weekStart: Date | string): string {
    const d = new Date(weekStart);
    // ISO week calculation
    const startOfYear = new Date(d.getFullYear(), 0, 1);
    const diff = (d.getTime() - startOfYear.getTime()) / 86400000;
    const week = Math.ceil((diff + startOfYear.getDay() + 1) / 7);
    return `KW ${week} / ${d.getFullYear()}`;
  }

  private getWeekRange(weekStart: Date | string): string {
    const start = new Date(weekStart);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
    return `${start.toLocaleDateString('de-DE', opts)} – ${end.toLocaleDateString('de-DE', opts)}`;
  }
}
