// Parsare CSV robustă: elimină BOM, citește coloanele după nume, câmp gol → null/NaN.

export interface CsvTable {
  header: string[];
  rows: string[][];
}

export function decodeText(bytes: Uint8Array): string {
  let text = new TextDecoder('utf-8').decode(bytes);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text;
}

function splitLine(line: string): string[] {
  if (line.indexOf('"') === -1) return line.split(',');
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

export function parseCsv(text: string): CsvTable {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.split(/\r?\n/);
  let h = 0;
  while (h < lines.length && lines[h].trim() === '') h++;
  if (h >= lines.length) return { header: [], rows: [] };
  const header = splitLine(lines[h]).map((s) => s.trim());
  const rows: string[][] = [];
  for (let i = h + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() === '') continue;
    rows.push(splitLine(l));
  }
  return { header, rows };
}

/**
 * Parcurgere în flux, fără a reține rândurile (fișierele de senzori au sute de mii de linii):
 * întoarce antetul și apelează cb pentru fiecare rând nevid.
 */
export function forEachRow(text: string, onHeader: (h: string[]) => void, cb: (row: string[]) => void): void {
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let header = true;
  const n = text.length;
  while (pos < n) {
    let end = text.indexOf('\n', pos);
    if (end < 0) end = n;
    let line = text.slice(pos, end);
    if (line.endsWith('\r')) line = line.slice(0, -1);
    pos = end + 1;
    if (line.trim() === '') continue;
    const cells = splitLine(line);
    if (header) { onHeader(cells.map((s) => s.trim())); header = false; }
    else cb(cells);
  }
}

export function colIndex(t: CsvTable, ...names: string[]): number {
  for (const n of names) {
    const i = t.header.findIndex((h) => h.toLowerCase() === n.toLowerCase());
    if (i >= 0) return i;
  }
  return -1;
}

/** valoare numerică; gol / absent / nenumeric → NaN */
export function num(row: string[], i: number): number {
  if (i < 0) return NaN;
  const s = row[i];
  if (s === undefined) return NaN;
  const v = s.trim();
  if (v === '' || v.toLowerCase() === 'null' || v.toLowerCase() === 'nan') return NaN;
  return Number(v);
}

export function numOrNull(row: string[], i: number): number | null {
  const v = num(row, i);
  return Number.isFinite(v) ? v : null;
}

export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    if (v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v))) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n') + '\n';
}
