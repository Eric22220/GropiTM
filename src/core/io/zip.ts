import { inflateSync, zipSync, strToU8 } from 'fflate';

export type FileMap = Record<string, Uint8Array>;

export function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export function isXlsx(files: FileMap): boolean {
  return Object.keys(files).some((k) => k.startsWith('xl/') || k === '[Content_Types].xml');
}

export interface ZipEntry {
  name: string;
  method: number;
  csize: number;
  usize: number;
  offset: number;
}

/**
 * Citește directorul central al unui ZIP, inclusiv ZIP64. Sensor Logger scrie dimensiunile ca 0xFFFFFFFF
 * în antete și pe cele reale în câmpul extra 0x0001 (ZIP64); `unzipSync` din fflate ar încerca să aloce 4 GB
 * în browser („Array buffer allocation failed”). Aici dimensiunile se citesc corect, iar fflate doar decomprimă.
 */
export function listZip(bytes: Uint8Array): ZipEntry[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (o: number) => dv.getUint16(o, true);
  const u32 = (o: number) => dv.getUint32(o, true);
  const u64 = (o: number) => dv.getUint32(o, true) + dv.getUint32(o + 4, true) * 4294967296;
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65536); i--) if (u32(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('ZIP invalid: lipsește sfârșitul directorului central.');
  let count = u16(eocd + 10);
  let cdOff = u32(eocd + 16);
  if (count === 0xffff || cdOff === 0xffffffff) {
    const loc = eocd - 20;
    if (loc >= 0 && u32(loc) === 0x07064b50) {
      const z64 = u64(loc + 8);
      if (u32(z64) === 0x06064b50) { count = u64(z64 + 32); cdOff = u64(z64 + 48); }
    }
  }
  const out: ZipEntry[] = [];
  let o = cdOff;
  for (let k = 0; k < count; k++) {
    if (u32(o) !== 0x02014b50) throw new Error('ZIP invalid: intrare de director coruptă.');
    const method = u16(o + 10);
    let csize = u32(o + 20), usize = u32(o + 24);
    const fl = u16(o + 28), el = u16(o + 30), cl = u16(o + 32);
    let offset = u32(o + 42);
    const name = new TextDecoder().decode(bytes.subarray(o + 46, o + 46 + fl));
    // câmpul extra ZIP64 (0x0001): usize, csize, offset — doar cele marcate cu 0xFFFFFFFF, în această ordine
    let e = o + 46 + fl;
    const eEnd = e + el;
    while (e + 4 <= eEnd) {
      const id = u16(e), sz = u16(e + 2);
      if (id === 0x0001) {
        let p = e + 4;
        if (usize === 0xffffffff) { usize = u64(p); p += 8; }
        if (csize === 0xffffffff) { csize = u64(p); p += 8; }
        if (offset === 0xffffffff) { offset = u64(p); p += 8; }
      }
      e += 4 + sz;
    }
    out.push({ name, method, csize, usize, offset });
    o += 46 + fl + el + cl;
  }
  return out;
}

export function extractEntry(bytes: Uint8Array, en: ZipEntry): Uint8Array {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(en.offset, true) !== 0x04034b50) throw new Error(`ZIP invalid: antet local lipsă pentru ${en.name}.`);
  const start = en.offset + 30 + dv.getUint16(en.offset + 26, true) + dv.getUint16(en.offset + 28, true);
  const data = bytes.subarray(start, start + en.csize);
  if (en.method === 0) return data.slice();
  if (en.method === 8) return en.usize > 0 ? inflateSync(data, { out: new Uint8Array(en.usize) }) : en.csize === 0 ? new Uint8Array(0) : inflateSync(data);
  throw new Error(`Metodă de compresie nesuportată (${en.method}) pentru ${en.name}.`);
}

/** Dezarhivează și indexează după numele de bază (fără subfolder), ignorând __MACOSX */
export function unzipFlat(bytes: Uint8Array): FileMap {
  const out: FileMap = {};
  for (const en of listZip(bytes)) {
    if (en.name.includes('__MACOSX') || en.name.endsWith('/')) continue;
    const base = en.name.split('/').pop()!;
    if (base.startsWith('._')) continue;
    out[base] = extractEntry(bytes, en);
  }
  return out;
}

export function findFile(files: FileMap, name: string): Uint8Array | null {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(files)) if (k.toLowerCase() === lower) return v;
  return null;
}

export function makeZip(entries: Record<string, string | Uint8Array>): Uint8Array {
  const data: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(entries)) data[k] = typeof v === 'string' ? strToU8(v) : v;
  return zipSync(data, { level: 6 });
}
