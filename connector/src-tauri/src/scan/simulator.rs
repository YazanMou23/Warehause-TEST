use super::ScannedPage;
use base64::{Engine as _, engine::general_purpose::STANDARD as B64};

/// Returns a synthetic 1-page PNG document for demo/testing purposes.
pub fn simulate_scan() -> Result<Vec<ScannedPage>, String> {
    log::info!("Simulator scan — returning sample document.");
    let png = generate_sample_png(600, 800);
    Ok(vec![ScannedPage {
        page_number: 1,
        mime_type:   "image/png".into(),
        base64_data: B64.encode(&png),
    }])
}

fn generate_sample_png(width: u32, height: u32) -> Vec<u8> {
    // Minimal valid PNG: white background with a blue header band
    let mut raw = vec![255u8; (height * (1 + width * 3)) as usize];
    for y in 0..height {
        raw[(y * (1 + width * 3)) as usize] = 0; // filter byte
        if y >= 40 && y <= 90 {
            for x in 40..(width - 40) {
                let off = (y * (1 + width * 3) + 1 + x * 3) as usize;
                raw[off]     = 30;
                raw[off + 1] = 58;
                raw[off + 2] = 138;
            }
        }
    }

    let compressed = miniz_compress(&raw);
    build_png(width, height, &compressed)
}

fn miniz_compress(data: &[u8]) -> Vec<u8> {
    use std::io::Write;
    let mut enc = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
    enc.write_all(data).unwrap();
    enc.finish().unwrap()
}

fn build_png(width: u32, height: u32, idat: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(&[137, 80, 78, 71, 13, 10, 26, 10]); // PNG signature

    // IHDR
    let mut ihdr = Vec::new();
    ihdr.extend_from_slice(&width.to_be_bytes());
    ihdr.extend_from_slice(&height.to_be_bytes());
    ihdr.extend_from_slice(&[8, 2, 0, 0, 0]); // 8-bit RGB
    write_chunk(&mut out, b"IHDR", &ihdr);

    // IDAT
    write_chunk(&mut out, b"IDAT", idat);

    // IEND
    write_chunk(&mut out, b"IEND", &[]);

    out
}

fn write_chunk(out: &mut Vec<u8>, chunk_type: &[u8], data: &[u8]) {
    out.extend_from_slice(&(data.len() as u32).to_be_bytes());
    out.extend_from_slice(chunk_type);
    out.extend_from_slice(data);
    let mut hasher = crc32fast::Hasher::new();
    hasher.update(chunk_type);
    hasher.update(data);
    out.extend_from_slice(&hasher.finalize().to_be_bytes());
}
