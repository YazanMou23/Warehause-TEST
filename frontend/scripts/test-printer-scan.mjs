// Run: node --experimental-strip-types scripts/test-printer-scan.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPdfFromJpegs } from "../src/app/utils/jpeg-pdf.ts";
import { pickScanner, selectableScanners } from "../src/app/utils/scanner-select.ts";

// Smallest valid 1x1 JPEG
const jpeg = Uint8Array.from(Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64"));
const pdf = buildPdfFromJpegs([
  { data: jpeg, width: 1, height: 1 },
  { data: jpeg, width: 1, height: 1 },
]);
const text = Buffer.from(pdf).toString("latin1");
assert.ok(text.startsWith("%PDF-1.4"));
assert.ok(text.includes("/Count 2"));
assert.ok(text.trimEnd().endsWith("%%EOF"));
// xref offsets must point at "N 0 obj"
const xrefAt = Number(/startxref\n(\d+)/.exec(text)[1]);
assert.ok(text.slice(xrefAt).startsWith("xref"));
const entries = [...text.slice(xrefAt).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
entries.forEach((off, i) => assert.ok(text.slice(off).startsWith(`${i + 1} 0 obj`), `obj ${i + 1}`));
assert.throws(() => buildPdfFromJpegs([]));
try {
  const dir = mkdtempSync(join(tmpdir(), "pdf-"));
  const f = join(dir, "t.pdf");
  writeFileSync(f, pdf);
  const info = execFileSync("pdfinfo", [f]).toString();
  assert.match(info, /Pages:\s+2/);
  console.log("pdfinfo ok");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}

const A = { id: "escl_1", name: "Canon", capabilities: { scanning: true } };
const B = { id: "escl_2", name: "HP", capabilities: { scanning: true } };
const SIM = { id: "simulator", name: "Simulator", capabilities: { scanning: true } };
const PRINTONLY = { id: "p1", name: "Printer", capabilities: { scanning: false } };
assert.deepEqual(selectableScanners([SIM, PRINTONLY, A]).map((d) => d.id), ["escl_1"]);
assert.equal(pickScanner([A], null).id, "escl_1");
assert.equal(pickScanner([A, B], null), null);
assert.equal(pickScanner([A, B], "escl_2").id, "escl_2");
assert.equal(pickScanner([A, B], "gone"), null);
assert.equal(pickScanner([SIM], null), null);
console.log("printer-scan tests ok");
