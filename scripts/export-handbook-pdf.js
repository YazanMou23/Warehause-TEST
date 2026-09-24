const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const rootDir = path.resolve(__dirname, '..');
const htmlPath = path.join(rootDir, 'Kunden_Handbuch_Warehouse_Management.html');
const pdfPath = path.join(rootDir, 'Kunden_Handbuch_Warehouse_Management.pdf');

console.log('HTML Quelle:', htmlPath);
console.log('PDF Ziel:', pdfPath);

if (!fs.existsSync(edgePath)) {
  console.error('Edge nicht gefunden unter:', edgePath);
  process.exit(1);
}

try {
  execFileSync(edgePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    '--run-all-compositor-stages-before-draw',
    `--print-to-pdf=${pdfPath}`,
    htmlPath
  ], { stdio: 'inherit' });

  if (fs.existsSync(pdfPath)) {
    const stats = fs.statSync(pdfPath);
    console.log(`Erfolg! PDF erfolgreich erstellt: ${stats.size} Bytes`);
  } else {
    console.error('PDF-Datei wurde nach Edge-Aufruf nicht gefunden.');
  }
} catch (err) {
  console.error('Fehler bei PDF-Generierung:', err);
}
