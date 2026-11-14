// Înregistratorul web: devicemotion + watchPosition + Screen Wake Lock, loturi de ~1 s în IndexedDB,
// analiză live (LiveAnalyzer, același nucleu ca la import). Un site web NU poate citi accelerometrul cu
// ecranul blocat; pentru asta rămâne Sensor Logger.
import { buildShockGridZip, type RecorderData, type RecorderMotionRow } from '../core/io/shockgrid';
import type { RideEvent } from '../core/types';
import type { GeoLike } from '../services/location';
import { recAppend, recDelete, recGet, type RecChunk } from '../storage/idb';
import { LiveAnalyzer, type LiveSummary } from './live';

type DME = typeof DeviceMotionEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };

/** Trebuie apelat PRIMUL, sincron, direct în handlerul click-ului (iOS), înainte de orice await. */
export function requestMotionPermission(): Promise<string> {
  const D = (typeof DeviceMotionEvent !== 'undefined' ? DeviceMotionEvent : undefined) as DME | undefined;
  if (D && typeof D.requestPermission === 'function') return D.requestPermission();
  return Promise.resolve(D ? 'granted' : 'unsupported');
}

const n = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? null : v);

export interface MotionLike {
  timeStamp: number;
  interval?: number;
  accelerationIncludingGravity: { x: number | null; y: number | null; z: number | null } | null;
  acceleration: { x: number | null; y: number | null; z: number | null } | null;
  rotationRate: { alpha: number | null; beta: number | null; gamma: number | null } | null;
}

export interface RecorderDeps {
  addMotion: (l: (e: MotionLike) => void) => void;
  removeMotion: (l: (e: MotionLike) => void) => void;
  geo: GeoLike | null;
  append: (c: RecChunk) => Promise<void>;
  load: (session: string) => Promise<RecChunk[]>;
  requestWakeLock?: () => Promise<{ release: () => Promise<void>; addEventListener: (t: 'release', f: () => void) => void } | null>;
  onVisibility?: (l: (hidden: boolean) => void) => () => void;
  now: () => number; // ms epoch
  timeOrigin: number;
  setInterval: (f: () => void, ms: number) => unknown;
  clearInterval: (h: unknown) => void;
}

export function browserDeps(): RecorderDeps {
  return {
    addMotion: (l) => addEventListener('devicemotion', l as unknown as EventListener),
    removeMotion: (l) => removeEventListener('devicemotion', l as unknown as EventListener),
    geo: 'geolocation' in navigator ? navigator.geolocation : null,
    append: recAppend,
    load: recGet,
    requestWakeLock: async () => {
      const wl = (navigator as Navigator & { wakeLock?: WakeLock }).wakeLock;
      return wl ? await wl.request('screen') : null;
    },
    onVisibility: (l) => {
      const h = () => l(document.visibilityState === 'hidden');
      document.addEventListener('visibilitychange', h);
      return () => document.removeEventListener('visibilitychange', h);
    },
    now: () => Date.now(),
    timeOrigin: performance.timeOrigin,
    setInterval: (f, ms) => window.setInterval(f, ms),
    clearInterval: (h) => window.clearInterval(h as number),
  };
}

export type RecState = 'recording' | 'paused' | 'stopped';

export interface LiveStats {
  state: RecState;
  elapsed_s: number;
  samples: number;
  fs: number;
  fixes: number;
  acc: number | null;
  speed: number | null;
  lastFixAge_s: number | null;
  wakeLock: 'on' | 'off' | 'error' | 'unsupported';
  imu: 'ok' | 'waiting' | 'none';
  problems: string[];
  live: LiveSummary;
  track: [number, number][];
  lastFix: { lat: number; lon: number; acc: number | null } | null;
}

export class Recorder {
  readonly session = `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  private motion: RecorderMotionRow[] = [];
  private gps: RecorderData['gps'] = [];
  private events: RideEvent[] = [];
  private watchId: number | null = null;
  private timer: unknown = null;
  private wake: { release: () => Promise<void> } | null = null;
  private wakeState: LiveStats['wakeLock'] = 'off';
  private start: number;
  private count = 0;
  private recent: number[] = [];
  private lastMotionT = 0;
  private lastFix: { t: number; lat: number; lon: number; acc: number | null; speed: number | null } | null = null;
  private nFix = 0;
  private problems = new Set<string>();
  private paused = false;
  private stopped = false;
  private pausedMs = 0;
  private pausedAt: number | null = null;
  private allTenth = true;
  private clockMode: 'event' | 'receive' = 'event';
  private unVis: (() => void) | null = null;
  private track: [number, number][] = [];
  readonly analyzer = new LiveAnalyzer();
  constructor(private meta: Record<string, unknown>, private deps: RecorderDeps = browserDeps()) {
    this.start = deps.now();
  }

  private ev(type: string, detail?: string) {
    this.events.push({ t: this.deps.now(), type, detail });
  }

  readonly onMotion = (e: MotionLike) => {
    if (this.paused || this.stopped) return;
    let t = e.timeStamp ? this.deps.timeOrigin + e.timeStamp : 0;
    if (!e.timeStamp) { t = this.deps.now(); this.clockMode = 'receive'; }
    const g = e.accelerationIncludingGravity, a = e.acceleration, r = e.rotationRate;
    const row: RecorderMotionRow = {
      t, interval: n(e.interval),
      agx: n(g?.x), agy: n(g?.y), agz: n(g?.z),
      ax: n(a?.x), ay: n(a?.y), az: n(a?.z),
      ra: n(r?.alpha), rb: n(r?.beta), rg: n(r?.gamma),
    };
    // unele browsere (de ex. Chrome pe desktop) trimit evenimente goale: nu le numărăm ca date de senzor
    if (row.agx === null && row.ax === null) return;
    if (this.lastMotionT && t - this.lastMotionT > 500) { this.ev('motion_gap', `${Math.round(t - this.lastMotionT)} ms`); this.problems.add('gol în fluxul senzorilor'); }
    this.lastMotionT = t;
    if (this.allTenth && row.agx !== null && Math.abs(row.agx * 10 - Math.round(row.agx * 10)) > 1e-6) this.allTenth = false;
    this.motion.push(row);
    this.count++;
    this.recent.push(t);
    // accelerometrul e sursa principală; giroscopul doar informație auxiliară (filtrul de rotație)
    const withG = row.agx !== null && row.agy !== null && row.agz !== null;
    const x = withG ? row.agx! : row.ax, y = withG ? row.agy! : row.ay, z = withG ? row.agz! : row.az;
    if (x !== null && y !== null && z !== null) {
      const gyro = row.ra !== null && row.rb !== null && row.rg !== null ? Math.hypot(row.ra, row.rb, row.rg) : null;
      this.analyzer.addMotion({ t, x, y, z, withGravity: withG, gyro });
    }
  };

  async begin() {
    this.ev('ride_start');
    this.deps.addMotion(this.onMotion);
    this.unVis = this.deps.onVisibility?.((hidden) => {
      if (hidden) { this.ev('visibility_hidden'); this.problems.add('ecranul a fost stins sau aplicația ascunsă: senzorii nu s-au citit în acel interval'); }
      else { this.ev('visibility_visible'); void this.lockScreen(); }
    }) ?? null;
    if (this.deps.geo) {
      this.watchId = this.deps.geo.watchPosition(
        (p) => {
          if (this.paused || this.stopped) return;
          const c = p.coords;
          const fix = { fix_t: p.timestamp, recv_t: this.deps.now(), lat: c.latitude, lon: c.longitude, acc: n(c.accuracy), alt: n(c.altitude), alt_acc: n(c.altitudeAccuracy), speed: n(c.speed), heading: n(c.heading) };
          this.gps.push(fix);
          this.nFix++;
          this.lastFix = { t: this.deps.now(), lat: fix.lat, lon: fix.lon, acc: fix.acc, speed: fix.speed };
          if (fix.acc === null || fix.acc <= 30) this.track.push([fix.lat, fix.lon]);
          this.analyzer.addFix({ t: fix.fix_t, lat: fix.lat, lon: fix.lon, acc: fix.acc, alt: fix.alt, speed: fix.speed, heading: fix.heading, speedAcc: null });
        },
        (err) => { this.ev('gps_error', `${err.code} ${err.message}`); this.problems.add(err.code === 1 ? 'accesul la locație e refuzat' : 'GPS indisponibil'); },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
      );
    } else this.problems.add('locația nu e disponibilă în acest browser');
    await this.lockScreen();
    let lastStale = 0;
    this.timer = this.deps.setInterval(() => {
      const now = this.deps.now();
      if (!this.paused && this.lastFix && now - this.lastFix.t > 5000 && now - lastStale > 5000) { this.ev('gps_stale'); lastStale = now; }
      try { this.analyzer.tick(now); } catch (e) { this.problems.add('analiza live a eșuat: ' + (e as Error).message); }
      void this.flush();
    }, 1000);
  }

  private async lockScreen() {
    if (!this.deps.requestWakeLock) { this.wakeState = 'unsupported'; return; }
    try {
      const w = await this.deps.requestWakeLock();
      if (!w) { this.wakeState = 'unsupported'; return; }
      this.wake = w;
      this.wakeState = 'on';
      this.ev('wakelock_acquired');
      w.addEventListener('release', () => { this.wakeState = 'off'; this.ev('wakelock_released'); });
    } catch (e) {
      this.wakeState = 'error';
      this.ev('wakelock_error', (e as Error).message);
    }
  }

  async flush() {
    const m = this.motion, g = this.gps, e = this.events;
    this.motion = []; this.gps = []; this.events = [];
    try {
      if (m.length) await this.deps.append({ session: this.session, kind: 'motion', data: m });
      if (g.length) await this.deps.append({ session: this.session, kind: 'gps', data: g });
      if (e.length) await this.deps.append({ session: this.session, kind: 'events', data: e });
    } catch (err) {
      this.problems.add('salvarea locală a eșuat: ' + (err as Error).message);
    }
  }

  pause() { if (this.paused || this.stopped) return; this.paused = true; this.pausedAt = this.deps.now(); this.ev('pause'); }
  resume() {
    if (!this.paused || this.stopped) return;
    this.paused = false;
    if (this.pausedAt !== null) this.pausedMs += this.deps.now() - this.pausedAt;
    this.pausedAt = null;
    this.lastMotionT = 0;
    this.ev('resume');
  }
  mark(detail = 'reper') { this.ev('marker', detail); }

  stats(): LiveStats {
    const now = this.deps.now();
    const nowPerf = now; // timpii mostrelor sunt tot în ms epoch
    this.recent = this.recent.filter((t) => nowPerf - t < 5000);
    const problems = [...this.problems];
    if (!this.paused && this.lastFix && now - this.lastFix.t > 5000) problems.push('niciun semnal GPS de peste 5 s');
    const imu: LiveStats['imu'] = this.count === 0 ? (now - this.start > 3000 ? 'none' : 'waiting') : 'ok';
    if (!this.paused && imu === 'none') problems.push('senzorii de mișcare nu trimit date în acest browser');
    else if (!this.paused && this.count > 0 && nowPerf - this.lastMotionT > 1500) problems.push('senzorii de mișcare s-au oprit');
    const pausedNow = this.pausedAt !== null ? now - this.pausedAt : 0;
    return {
      state: this.stopped ? 'stopped' : this.paused ? 'paused' : 'recording',
      elapsed_s: (now - this.start - this.pausedMs - pausedNow) / 1000,
      samples: this.count,
      fs: this.recent.length / 5,
      fixes: this.nFix,
      acc: this.lastFix?.acc ?? null,
      speed: this.lastFix?.speed ?? null,
      lastFixAge_s: this.lastFix ? (now - this.lastFix.t) / 1000 : null,
      wakeLock: this.wakeState,
      imu,
      problems,
      live: this.analyzer.summary(now),
      track: this.track,
      lastFix: this.lastFix,
    };
  }

  async stop(): Promise<Uint8Array> {
    if (this.paused) this.resume();
    this.ev('ride_stop');
    this.stopped = true;
    this.deps.removeMotion(this.onMotion);
    this.unVis?.();
    if (this.watchId !== null && this.deps.geo) this.deps.geo.clearWatch(this.watchId);
    if (this.timer !== null) this.deps.clearInterval(this.timer);
    try { await this.wake?.release(); } catch { /* ignorat */ }
    await this.flush();
    return buildZipFromSession(this.session, {
      ...this.meta,
      motion_clock: this.clockMode,
      observed_resolution: this.allTenth ? '0.1 m/s² (browserul rotunjește)' : 'fără rotunjire vizibilă',
      stop: new Date(this.deps.now()).toISOString(),
    }, await this.deps.load(this.session));
  }
}

export async function buildZipFromSession(session: string, metaOverride: Record<string, unknown> = {}, chunksIn?: RecChunk[]): Promise<Uint8Array> {
  const chunks = chunksIn ?? (await recGet(session));
  const motion: RecorderMotionRow[] = [];
  const gps: RecorderData['gps'] = [];
  const events: RideEvent[] = [];
  for (const c of [...chunks].sort((a, b) => (a.id ?? 0) - (b.id ?? 0))) {
    if (c.kind === 'motion') motion.push(...(c.data as RecorderMotionRow[]));
    else if (c.kind === 'gps') gps.push(...(c.data as RecorderData['gps']));
    else events.push(...(c.data as RideEvent[]));
  }
  const meta = {
    app_version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'test',
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'node',
    ride_uuid: session,
    start: motion.length ? new Date(motion[0].t).toISOString() : null,
    ...metaOverride,
  };
  return buildShockGridZip({ meta, motion, gps, events });
}

export { recDelete };
