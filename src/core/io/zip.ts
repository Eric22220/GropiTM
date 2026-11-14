import { unzipSync, zipSync, strToU8 } from 'fflate';

export type FileMap = Record<string, Uint8Array>;

export function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export function isXlsx(files: FileMap): boolean {
  return Object.keys(files).some((k) => k.startsWith('xl/') || k === '[Content_Types].xml');
}

/** Dezarhivează și indexează după numele de bază (fără subfolder), ignorând __MACOSX */
export function unzipFlat(bytes: Uint8Array): FileMap {
  const all = unzipSync(bytes);
  const out: FileMap = {};
  for (const [path, data] of Object.entries(all)) {
    if (path.includes('__MACOSX') || path.endsWith('/')) continue;
    const base = path.split('/').pop()!;
    if (base.startsWith('._')) continue;
    out[base] = data;
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
