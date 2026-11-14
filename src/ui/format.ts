import type { ComfortClass } from '../core/aggregate';

const nf = (d: number) => new Intl.NumberFormat('ro-RO', { maximumFractionDigits: d, minimumFractionDigits: d });

export function fmt(v: number | null | undefined, d = 1, unit = ''): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return 'necunoscut';
  return nf(d).format(v) + (unit ? ` ${unit}` : '');
}

export function fmtLen(m: number | null | undefined): string {
  if (m === null || m === undefined || !Number.isFinite(m)) return 'necunoscut';
  return m >= 1000 ? `${nf(2).format(m / 1000)} km` : `${Math.round(m)} m`;
}

export function fmtDur(s: number): string {
  if (!Number.isFinite(s)) return 'necunoscut';
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  return m ? `${m} min ${r} s` : `${r} s`;
}

export function fmtDateTime(ms: number | null | undefined): string {
  if (!ms || !Number.isFinite(ms)) return 'necunoscut';
  return new Date(ms).toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' });
}

/** paletă lizibilă pentru daltoniști (albastru → galben → portocaliu → vișiniu) */
export const CLASS_COLORS: Record<ComfortClass, string> = {
  A: '#2166ac',
  B: '#67a9cf',
  C: '#e6ab02',
  D: '#e66101',
  E: '#99000d',
};

export function download(name: string, data: BlobPart, type = 'application/octet-stream') {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Web Share API (Drive, WhatsApp, e-mail) cu rezervă descărcare */
export async function shareOrDownload(name: string, data: Uint8Array | ArrayBuffer, type = 'application/zip') {
  const file = new File([data as BlobPart], name, { type });
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  download(name, data as BlobPart, type);
}
