// Analiza live în timpul turei. NU e o a doua implementare a algoritmului: la fiecare ~5 s rulăm exact
// funcțiile din nucleu (computeSignal / computeWindows / detectShocks) pe ultimele ~30 s de date, iar din
// rezultat păstrăm doar ferestrele și șocurile noi. Rezultatul final al turei vine tot din procesarea completă
// după oprire (aceeași ca la importul Sensor Logger); cifrele live sunt informative.
import { DEFAULT_CONFIG, type VibrationConfig } from '../core/config';
import { GpsTrack, computeDistance } from '../core/gpstrack';
import type { GpsFix, RawRide, Shock, VibWindow } from '../core/types';
import { computeSignal, computeWindows, detectShocks } from '../core/vibration';

export interface MotionSample { t: number; x: number; y: number; z: number; withGravity: boolean; gyro: number | null }

export interface LiveSummary {
  windows: number;
  validWindows: number;
  lastRms: number | null;
  candidates: { t: number; lat: number | null; lon: number | null; peak: number; review: boolean }[];
  distance: number;
  moving: boolean;
  stoppedFor_s: number;
}

const WARMUP_MS = 25000; // baseline-ul șocurilor are nevoie de 20 s de istoric, filtrele de 2 s

export class LiveAnalyzer {
  private motion: MotionSample[] = [];
  private gps: GpsFix[] = [];
  private processedUntil = -Infinity;
  private lastRun = -Infinity;
  private windows: VibWindow[] = [];
  private shocks: Shock[] = [];
  private distance = 0;
  private lastMoving = -Infinity;
  constructor(private cfg: VibrationConfig = DEFAULT_CONFIG, private everyMs = 5000) {}

  addMotion(s: MotionSample) {
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y) || !Number.isFinite(s.z)) return;
    const last = this.motion[this.motion.length - 1];
    if (last && s.t <= last.t) return;
    this.motion.push(s);
  }

  addFix(f: GpsFix) {
    const prev = this.gps[this.gps.length - 1];
    if (prev && f.t <= prev.t) return;
    if (prev) {
      // aceeași regulă ca distanța din nucleu (6.6): ambele viteze, v ≥ 0,5 m/s, dt ≤ 3 s
      const dt = (f.t - prev.t) / 1000;
      if (prev.speed !== null && f.speed !== null && dt > 0 && dt <= 3) {
        const v = (prev.speed + f.speed) / 2;
        if (v >= 0.5) this.distance += v * dt;
      }
    }
    if (f.speed !== null && f.speed >= 0.7) this.lastMoving = f.t;
    this.gps.push(f);
  }

  /** rulează analiza dacă au trecut everyMs de la ultima; întoarce true dacă a rulat */
  tick(now: number): boolean {
    if (now - this.lastRun < this.everyMs) return false;
    this.lastRun = now;
    this.run();
    return true;
  }

  run() {
    const lastT = this.motion.length ? this.motion[this.motion.length - 1].t : -Infinity;
    if (!Number.isFinite(lastT)) return;
    const from = Math.max(this.motion[0].t, Math.min(this.processedUntil, lastT) - WARMUP_MS);
    let i0 = 0;
    while (i0 < this.motion.length && this.motion[i0].t < from) i0++;
    const chunk = this.motion.slice(i0);
    if (chunk.length < 50) return;
    const withGravity = chunk[0].withGravity;
    const gyroRows = chunk.filter((m) => m.gyro !== null);
    const raw: RawRide = {
      meta: { source: 'shockgrid', ride_key: 'live', start_ms: chunk[0].t, stop_ms: lastT, orientation_aware: withGravity, warnings: [], extra: {} },
      motion: {
        t: Float64Array.from(chunk.map((m) => m.t)), x: Float32Array.from(chunk.map((m) => m.x)),
        y: Float32Array.from(chunk.map((m) => m.y)), z: Float32Array.from(chunk.map((m) => m.z)), withGravity,
      },
      gyro: gyroRows.length ? { t: Float64Array.from(gyroRows.map((m) => m.t)), mag: Float32Array.from(gyroRows.map((m) => m.gyro!)) } : null,
      gps: this.gps.filter((f) => f.t >= from - 5000),
      events: [],
    };
    const sig = computeSignal(raw, this.cfg);
    const track = new GpsTrack(raw.gps);
    const ws = computeWindows(raw, sig, this.cfg, track, computeDistance(raw.gps).cum);
    const lastWinEnd = this.windows.length ? this.windows[this.windows.length - 1].t1 : -Infinity;
    for (const w of ws) if (w.t1 > lastWinEnd && w.t0 >= this.processedUntil - this.cfg.window_s * 1000) this.windows.push(w);
    const minShockT = this.shocks.length ? this.shocks[this.shocks.length - 1].t + this.cfg.shock_cooldown_s * 1000 : -Infinity;
    for (const s of detectShocks(raw, sig, this.cfg, track)) if (s.t > minShockT && s.t >= this.processedUntil - 1000) this.shocks.push(s);
    this.processedUntil = lastT;
    // memoria rămâne mică: păstrăm doar fereastra de lucru
    const keepFrom = lastT - WARMUP_MS - 5000;
    let k = 0;
    while (k < this.motion.length && this.motion[k].t < keepFrom) k++;
    if (k) this.motion.splice(0, k);
    let g = 0;
    while (g < this.gps.length - 2 && this.gps[g].t < keepFrom) g++;
    if (g) this.gps.splice(0, g);
  }

  summary(now: number): LiveSummary {
    const valid = this.windows.filter((w) => w.valid);
    const moving = now - this.lastMoving < 15000;
    return {
      windows: this.windows.length,
      validWindows: valid.length,
      lastRms: valid.length ? valid[valid.length - 1].rms : null,
      candidates: this.shocks.map((s) => ({ t: s.t, lat: s.lat, lon: s.lon, peak: s.peak, review: s.needs_review })),
      distance: this.distance,
      moving,
      stoppedFor_s: moving || !Number.isFinite(this.lastMoving) ? 0 : (now - this.lastMoving) / 1000,
    };
  }
}
