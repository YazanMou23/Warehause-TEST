import * as zlib from 'zlib';

/**
 * Generates a 100% valid, structurally complete PNG document image in pure Node.js (no external deps).
 * This ensures OpenAI Vision, image decoders, and browsers never fail on simulated/demo scans with image_parse_error.
 */
export function generateSampleDocumentPng(width = 600, height = 800): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function chunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcVal = zlib.crc32(Buffer.concat([typeBuf, data]));
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crcVal >>> 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // 8-bit depth
  ihdr[9] = 2;  // RGB (Color Type 2)
  ihdr[10] = 0; // Deflate compression
  ihdr[11] = 0; // Filter method
  ihdr[12] = 0; // No interlace

  const stride = 1 + width * 3;
  const raw = Buffer.alloc(height * stride, 255); // White background

  for (let y = 0; y < height; y++) {
    const rowOffset = y * stride;
    raw[rowOffset] = 0; // Filter: None

    // Top Header Banner (Dark Blue)
    if (y >= 40 && y <= 90) {
      for (let x = 40; x < width - 40; x++) {
        const px = rowOffset + 1 + x * 3;
        raw[px] = 30;     // R
        raw[px + 1] = 58;  // G
        raw[px + 2] = 138; // B
      }
    }

    // Document Title Banner Line (Accent Cyan)
    if (y >= 92 && y <= 95) {
      for (let x = 40; x < width - 40; x++) {
        const px = rowOffset + 1 + x * 3;
        raw[px] = 14;     // R
        raw[px + 1] = 165; // G
        raw[px + 2] = 233; // B
      }
    }

    // Table Horizontal Separators
    if (
      (y >= 160 && y <= 162) ||
      (y >= 220 && y <= 221) ||
      (y >= 280 && y <= 281) ||
      (y >= 340 && y <= 341) ||
      (y >= 400 && y <= 401) ||
      (y >= 460 && y <= 461) ||
      (y >= 520 && y <= 522)
    ) {
      for (let x = 40; x < width - 40; x++) {
        const px = rowOffset + 1 + x * 3;
        raw[px] = 210;
        raw[px + 1] = 215;
        raw[px + 2] = 225;
      }
    }

    // Table Vertical Column Grid Lines
    if (y >= 160 && y <= 520) {
      const colXPositions = [40, 180, 280, 380, 480, width - 40];
      for (const cx of colXPositions) {
        for (let dx = 0; dx <= 1; dx++) {
          const px = rowOffset + 1 + (cx + dx) * 3;
          if (px < rowOffset + stride - 2) {
            raw[px] = 210;
            raw[px + 1] = 215;
            raw[px + 2] = 225;
          }
        }
      }
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
