// Generează iconițele PNG ale PWA (fără dependențe): grilă cu un „șoc” pe fundal albastru închis.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

function crc32(buf: Buffer) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size: number, pixel: (x: number, y: number) => [number, number, number]) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x / size, y / size);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// semnal: linie de bază cu un vârf în mijloc, peste o grilă
function pixel(u: number, v: number): [number, number, number] {
  const bg: [number, number, number] = [11, 61, 92];
  const grid = (Math.abs(((u * 4) % 1) - 0.5) > 0.47 || Math.abs(((v * 4) % 1) - 0.5) > 0.47) && u > 0.1 && u < 0.9 && v > 0.1 && v < 0.9;
  const x = (u - 0.5) / 0.38;
  const wave = 0.6 - (Math.abs(x) < 1 ? 0.04 * Math.sin(x * 25) + 0.34 * Math.exp(-(x * x) / 0.012) * (x < 0 ? 1 : -0.7) : 0);
  const onWave = Math.abs(x) < 1 && Math.abs(v - wave) < 0.03;
  if (onWave) return [255, 196, 0];
  if (grid) return [40, 100, 135];
  return bg;
}
mkdirSync('public', { recursive: true });
writeFileSync('public/icon-192.png', png(192, pixel));
writeFileSync('public/icon-512.png', png(512, pixel));
writeFileSync('public/apple-touch-icon.png', png(180, pixel));
console.log('iconițe generate');
