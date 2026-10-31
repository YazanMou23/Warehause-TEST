const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const templatesDir = '/home/ubuntu/Warehause-TEST/templates/container-lists';
const sites = ['Gant', 'Brooks', 'Schwalbe', 'WE-Britax', 'Medisana', 'Zwilling', 'ProHeq'];

async function inspectHeaders() {
  for (const site of sites) {
    const filePath = path.join(templatesDir, `${site}.xlsx`);
    if (!fs.existsSync(filePath)) continue;

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];

    console.log(`\n=== ${site} === Sheet: "${sheet.name}"`);
    console.log(`Columns: ${sheet.columnCount}`);

    // Print header row (row 1) - ALL cells including empty
    const headerCells = [];
    for (let c = 1; c <= sheet.columnCount; c++) {
      const cell = sheet.getCell(1, c);
      if (cell.value !== null && cell.value !== undefined && cell.value !== '') {
        const fmt = cell.numFmt ? ` fmt:${cell.numFmt}` : '';
        headerCells.push(`${c}:${String(cell.value).trim()}${fmt}`);
      }
    }
    console.log(`Header Row: ${headerCells.join(' | ')}`);

    // Print column widths
    const widths = [];
    sheet.columns.forEach((col, idx) => {
      if (col.width) widths.push(`${idx + 1}:${col.width}`);
    });
    if (widths.length) console.log(`Widths: ${widths.join(' | ')}`);
  }
}

inspectHeaders().catch(console.error);
