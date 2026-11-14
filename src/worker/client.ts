import type { VibrationConfig } from '../core/config';
import type { DeclaredSurface, ProcessedRide } from '../core/types';

let worker: Worker | null = null;
let seq = 0;

export function warmWorker() {
  try { if (!worker) worker = new Worker(new URL('./processing.worker.ts', import.meta.url), { type: 'module' }); } catch { /* se creează la prima folosire */ }
}

export function processInWorker(
  name: string,
  bytes: ArrayBuffer,
  cfg: VibrationConfig,
  declared: DeclaredSurface,
  onProgress?: (stage: string, frac: number) => void,
): Promise<ProcessedRide> {
  if (!worker) worker = new Worker(new URL('./processing.worker.ts', import.meta.url), { type: 'module' });
  const id = ++seq;
  const w = worker;
  return new Promise((resolve, reject) => {
    const handler = (ev: MessageEvent) => {
      const m = ev.data;
      if (m.id !== id) return;
      if (m.type === 'progress') onProgress?.(m.stage, m.frac);
      else {
        w.removeEventListener('message', handler);
        if (m.type === 'done') resolve(m.result as ProcessedRide);
        else reject(new Error(m.message));
      }
    };
    w.addEventListener('message', handler);
    w.addEventListener('error', (e) => reject(new Error(e.message || 'Eroare în Web Worker')), { once: true });
    // copie, ca fișierul original să rămână disponibil pentru salvare
    w.postMessage({ id, name, bytes: bytes.slice(0), cfg, declared });
  });
}
