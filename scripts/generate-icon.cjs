/**
 * Procedurally generates build/icon.ico — small, multi-size, no native deps.
 * Draws a stylized "C" (CLAW) on an obsidian background with a gilt accent.
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'build', 'icon.ico');

// Palette (obsidian + gilt)
const BG_INNER = [0x18, 0x1c, 0x2e]; // obsidian-700
const BG_OUTER = [0x0a, 0x0a, 0x0f]; // obsidian-900
const RING = [0xda, 0xab, 0x35]; // gilt-400
const LETTER = [0xfb, 0xf8, 0xed]; // gilt-50 / parchment

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function blend(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

function drawIcon(size) {
  // RGBA buffer
  const px = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx); // -pi..pi

      let color;
      let alpha = 255;

      // Outside the icon disc → transparent
      if (r > maxR - 0.5) {
        alpha = 0;
        color = BG_OUTER;
      }
      // Outer gilt ring (1.5% of size)
      else if (r > maxR * 0.94) {
        color = RING;
      }
      // Background gradient (radial)
      else {
        const t = r / (maxR * 0.94); // 0 at center → 1 at ring
        color = blend(BG_INNER, BG_OUTER, t);

        // Stylized "C": annular sector facing right
        // Inner radius 0.42, outer radius 0.66, gap on the right
        const innerR = maxR * 0.42;
        const outerR = maxR * 0.66;
        const gapHalf = Math.PI / 5; // ~36deg gap on the right side
        const inSector =
          r >= innerR && r <= outerR && (angle > gapHalf || angle < -gapHalf);
        if (inSector) {
          color = LETTER;
        }
      }

      const idx = (y * size + x) * 4;
      px[idx + 0] = color[0];
      px[idx + 1] = color[1];
      px[idx + 2] = color[2];
      px[idx + 3] = alpha;
    }
  }

  return encodePng(size, size, px);
}

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    crc32.table = table;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = (table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Filter type 0 (None) on every row
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const dirs = [];
  let offset = 6 + 16 * entries.length;

  for (const { size, png } of entries) {
    const e = Buffer.alloc(16);
    e[0] = size === 256 ? 0 : size;
    e[1] = size === 256 ? 0 : size;
    e[2] = 0;
    e[3] = 0;
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    dirs.push(e);
    offset += png.length;
  }

  return Buffer.concat([header, ...dirs, ...entries.map((e) => e.png)]);
}

function main() {
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const entries = sizes.map((size) => ({ size, png: drawIcon(size) }));
  const ico = buildIco(entries);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, ico);

  // Also write a 256 PNG for non-Windows / web use
  fs.writeFileSync(path.join(path.dirname(OUT), 'icon.png'), entries[entries.length - 1].png);

  const kb = (ico.length / 1024).toFixed(1);
  console.log(`[icon] Wrote ${OUT} (${kb} KB, ${sizes.length} sizes)`);
}

main();
