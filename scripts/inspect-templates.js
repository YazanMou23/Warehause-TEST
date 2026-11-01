const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const templatesDir = '/home/ubuntu/Warehause-TEST/templates/container-lists';
const sites = ['Gant', 'Brooks', 'Schwalbe', 'WE-Britax', 'Medisana', 'Zwilling', 'ProHeq'];

async function inspectTemplates() {
  console.log('===========================================================');
  console.log('INSPECTING 7 CTR-LISTE TEMPLATES WITH EXCELJS');
  console.log('===========================================================');

  for (const site of sites) {
    const filePath = path.join(templatesDir, `${site}.xlsx`);
    if (!fs.existsSync(filePath)) {
      console.log(`[MISSING] ${site}: ${filePath}`);
      continue;
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    console.log(`\n-----------------------------------------------------------`);
    console.log(`SITE: ${site} (${path.basename(filePath)})`);
    console.log(`Worksheets: ${workbook.worksheets.map(w => w.name).join(', ')}`);

    const sheet = workbook.worksheets[0];
    console.log(`Active Sheet: "${sheet.name}" (Rows: ${sheet.rowCount}, Columns: ${sheet.columnCount})`);

    // Scan first 15 rows to find header and data layout
    for (let r = 1; r <= Math.min(sheet.rowCount, 15); r++) {
      const row = sheet.getRow(r);
      const values = [];
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        let val = cell.value;
        if (typeof val === 'object' && val !== null) {
          if (val.result !== undefined) val = `formula(${val.formula})=${val.result}`;
          else if (val.text !== undefined) val = val.text;
          else if (val.richText) val = val.richText.map(t => t.text).join('');
        }
        values.push(`[C${colNumber}] ${String(val).trim().replace(/\n/g, ' ')}`);
      });
      if (values.length > 0) {
        console.log(`  Row ${r.toString().padStart(2, ' ')}: ${values.slice(0, 10).join(' | ')}${values.length > 10 ? ' ...' : ''}`);
      }
    }
  }
}

inspectTemplates().catch(console.error);
