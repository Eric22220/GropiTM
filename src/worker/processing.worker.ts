/// <reference lib="webworker" />
// Procesarea grea (parsare ZIP, gravitație, filtre, ferestre, șocuri) rulează aici, ca UI-ul să nu se blocheze.
import type { VibrationConfig } from '../core/config';
import { parseRideFile } from '../core/io';
import { processRide } from '../core/process';
import type { DeclaredSurface } from '../core/types';

export interface WorkerRequest {
  id: number;
  name: string;
  bytes: ArrayBuffer;
  cfg: VibrationConfig;
  declared: DeclaredSurface;
}

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const { id, name, bytes, cfg, declared } = ev.data;
  const post = (m: unknown) => (self as unknown as Worker).postMessage(m);
  try {
    post({ id, type: 'progress', stage: 'citire ZIP', frac: 0.05 });
    const raw = parseRideFile(name, new Uint8Array(bytes));
    const p = processRide(raw, {
      cfg,
      declaredSurface: declared,
      onProgress: (stage, frac) => post({ id, type: 'progress', stage, frac }),
    });
    post({ id, type: 'done', result: p });
  } catch (e) {
    post({ id, type: 'error', message: (e as Error).message || String(e) });
  }
};
