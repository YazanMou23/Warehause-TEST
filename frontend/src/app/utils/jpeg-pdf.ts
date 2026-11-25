// Builds a simple multi-page PDF from JPEG images (one image per page).
// No dependency: JPEG bytes are embedded as-is with the DCTDecode filter.

export interface JpegPage {
  data: Uint8Array;
  width: number;
  height: number;
}

const enc = new TextEncoder();

export function buildPdfFromJpegs(pages: JpegPage[]): Uint8Array {
  if (!pages.length) throw new Error("No pages");
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (c: Uint8Array | string) => {
    const bytes = typeof c === "string" ? enc.encode(c) : c;
    chunks.push(bytes);
    length += bytes.length;
  };
  const beginObj = (id: number) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
  };

  // Object ids: 1 catalog, 2 pages, then 3 objects per page (page, image, content)
  push("%PDF-1.4\n");
  beginObj(1);
  push("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  beginObj(2);
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ");
  push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`);

  pages.forEach((p, i) => {
    const pageId = 3 + i * 3;
    const imgId = pageId + 1;
    const contentId = pageId + 2;
    // 1 pixel = 0.36 pt (200 dpi) so an A4 scan lands near A4 size
    const w = Math.round(p.width * 0.36 * 100) / 100;
    const h = Math.round(p.height * 0.36 * 100) / 100;
    beginObj(pageId);
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] ` +
        `/Resources << /XObject << /Im0 ${imgId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
    );
    beginObj(imgId);
    push(
      `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.data.length} >>\nstream\n`,
    );
    push(p.data);
    push("\nendstream\nendobj\n");
    const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    beginObj(contentId);
    push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
  });

  const xrefStart = length;
  const count = 3 + pages.length * 3;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let id = 1; id < count; id++) {
    xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  push(xref);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}
