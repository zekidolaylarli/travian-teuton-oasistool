// PWA ikonlarını (PNG + SVG) üretir. Bağımlılık yok: PNG, zlib ile elle kodlanır.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const cx = size / 2, cy = size / 2;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / size, dy = (y - cy) / size;
      let [r, g, b] = [31, 61, 43]; // zemin: koyu yeşil
      const d = Math.hypot(dx, dy);
      if (d < 0.36) [r, g, b] = [44, 90, 61]; // kalkan
      if (d < 0.36 && d > 0.33) [r, g, b] = [224, 178, 90];
      // çapraz iki kılıç
      const a = Math.abs(dx - dy), c2 = Math.abs(dx + dy);
      if (d < 0.3 && (a < 0.028 || c2 < 0.028)) [r, g, b] = [240, 236, 220];
      if (d < 0.07) [r, g, b] = [224, 178, 90];
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync(new URL('../icons/', import.meta.url), { recursive: true });
for (const s of [180, 192, 512]) writeFileSync(new URL(`../icons/icon-${s}.png`, import.meta.url), png(s));
writeFileSync(new URL('../icons/icon.svg', import.meta.url), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#1f3d2b"/><circle cx="50" cy="50" r="34.5" fill="#2c5a3d" stroke="#e0b25a" stroke-width="3"/><path d="M29 29 71 71M71 29 29 71" stroke="#f0ecdc" stroke-width="4" stroke-linecap="round"/><circle cx="50" cy="50" r="7" fill="#e0b25a"/></svg>\n`);
console.log('İkonlar üretildi.');
