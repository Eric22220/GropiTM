// Înregistratorul propriu (P1): devicemotion + watchPosition + Screen Wake Lock, loturi de ~1 s în IndexedDB.
import { buildShockGridZip, type RecorderData, type RecorderMotionRow } from '../core/io/shockgrid';
import type { RideEvent } from '../core/types';
import { recAppend, recDelete, recGet } from '../storage/idb';

type DME = typeof DeviceMotionEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };

/** Trebuie apelat PRIMUL, sincron, direct în handlerul click-ului (iOS), înainte de orice await. */
export function requestMotionPermission(): Promise<string> {
  const D = (typeof DeviceMotionEvent !== 'undefined' ? DeviceMotionEvent : undefined) as DME | undefined;
  if (D && typeof D.requestPermission === 'function') return D.requestPermission();
  return Promise.resolve(D ? 'granted' : 'unsupported');
}

const n = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? null : v);

export interface LiveStats {
  elapsed_s: number;
  samples: number;
  fs: number;
  fixes: number;
  acc: number | null;
  speed: number | null;
  lastFixAge_s: number | null;
  wakeLock: 'on' | 'off' | 'error' | 'unsupported';
  problems: string[];
  paused: boolean;
}

export class Recorder {
  readonly session = `rec-${Date.now()}`;
  private motion: RecorderMotionRow[] = [];
  private gps: RecorderData['gps'] = [];
  private events: RideEvent[] = [];
  private watchId: number | null = null;
  private flushTimer: number | null = null;
  private wake: WakeLockSentinel | null = null;
  private wakeState: LiveStats['wakeLock'] = 'off';
  private start = Date.now();
  private count = 0;
  private recent: number[] = [];
  private lastMotionT = 0;
  private lastFix: { t: number; acc: number | null; speed: number | null } | null = null;
  private nFix = 0;
  private problems = new Set<string>();
  private paused = false;
  private allTenth = true;
  private clockMode: 'event' | 'receive' = 'event';
  constructor(private meta: Record<string, unknown>) {}

  private ev(type: string, detail?: string) {
    this.events.push({ t: Date.now(), type, detail });
  }

  private onMotion = (e: DeviceMotionEvent) => {
    if (this.paused) return;
    let t = e.timeStamp ? performance.timeOrigin + e.timeStamp : 0;
    if (!e.timeStamp) { t = performance.timeOrigin + performance.now(); this.clockMode = 'receive'; }
    const g = e.accelerationIncludingGravity, a = e.acceleration, r = e.rotationRate;
    const row: RecorderMotionRow = {
      t, interval: n(e.interval),
      agx: n(g?.x), agy: n(g?.y), agz: n(g?.z),
      ax: n(a?.x), ay: n(a?.y), az: n(a?.z),
      ra: n(r?.alpha), rb: n(r?.beta), rg: n(r?.gamma),
    };
    if (this.lastMotionT && t - this.lastMotionT > 500) { this.ev('motion_gap', `${Math.round(t - this.lastMotionT)} ms`); this.problems.add('gol în fluxul de mișcare'); }
    this.lastMotionT = t;
    if (this.allTenth && row.agx !== null && Math.abs(row.agx * 10 - Math.round(row.agx * 10)) > 1e-6) this.allTenth = false;
    this.motion.push(row);
    this.count++;
    this.recent.push(t);
  };

  private onVis = async () => {
    if (document.visibilityState === 'hidden') { this.ev('visibility_hidden'); this.problems.add('pagina a fost ascunsă: datele lipsesc în acel interval'); }
    else { this.ev('visibility_visible'); await this.lockScreen(); }
  };

  private async lockScreen() {
    const wl = (navigator as Navigator & { wakeLock?: WakeLock }).wakeLock;
    if (!wl) { this.wakeState = 'unsupported'; return; }
    try {
      this.wake = await wl.request('screen');
      this.wakeState = 'on';
      this.ev('wakelock_acquired');
      this.wake.addEventListener('release', () => { this.wakeState = 'off'; this.ev('wakelock_released'); });
    } catch (e) {
      this.wakeState = 'error';
      this.ev('wakelock_error', (e as Error).message);
    }
  }

  async begin() {
    this.ev('ride_start');
    addEventListener('devicemotion', this.onMotion);
    document.addEventListener('visibilitychange', this.onVis);
    if ('geolocation' in navigator) {
      this.watchId = navigator.geolocation.watchPosition(
        (p) => {
          if (this.paused) return;
          const c = p.coords;
          this.gps.push({
            fix_t: p.timestamp, recv_t: Date.now(), lat: c.latitude, lon: c.longitude, acc: n(c.accuracy), alt: n(c.altitude),
            alt_acc: n(c.altitudeAccuracy), speed: n(c.speed), heading: n(c.heading),
          });
          this.nFix++;
          this.lastFix = { t: Date.now(), acc: n(c.accuracy), speed: n(c.speed) };
        },
        (err) => { this.ev('gps_error', `${err.code} ${err.message}`); this.problems.add(`GPS: ${err.message || err.code}`); },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
      );
    } else this.problems.add('geolocația nu e disponibilă');
    await this.lockScreen();
    let lastStale = 0;
    this.flushTimer = window.setInterval(() => {
      if (!this.paused && this.lastFix && Date.now() - this.lastFix.t > 5000 && Date.now() - lastStale > 5000) { this.ev('gps_stale'); lastStale = Date.now(); }
      void this.flush();
    }, 1000);
  }

  private async flush() {
    const m = this.motion, g = this.gps, e = this.events;
    this.motion = []; this.gps = []; this.events = [];
    try {
      if (m.length) await recAppend({ session: this.session, kind: 'motion', data: m });
      if (g.length) await recAppend({ session: this.session, kind: 'gps', data: g });
      if (e.length) await recAppend({ session: this.session, kind: 'events', data: e });
    } catch (err) {
      this.problems.add('scrierea în IndexedDB a eșuat: ' + (err as Error).message);
    }
  }

  pause() { this.paused = true; this.ev('pause'); }
  resume() { this.paused = false; this.lastMotionT = 0; this.ev('resume'); }
  mark(detail = 'reper') { this.ev('marker', detail); }

  stats(): LiveStats {
    const now = performance.timeOrigin + performance.now();
    this.recent = this.recent.filter((t) => now - t < 5000);
    const problems = [...this.problems];
    if (this.lastFix && Date.now() - this.lastFix.t > 5000) problems.push('niciun fix GPS de peste 5 s');
    if (!this.paused && this.count > 0 && now - this.lastMotionT > 1000) problems.push('senzorul de mișcare nu mai trimite date');
    return {
      elapsed_s: (Date.now() - this.start) / 1000,
      samples: this.count,
      fs: this.recent.length / 5,
      fixes: this.nFix,
      acc: this.lastFix?.acc ?? null,
      speed: this.lastFix?.speed ?? null,
      lastFixAge_s: this.lastFix ? (Date.now() - this.lastFix.t) / 1000 : null,
      wakeLock: this.wakeState,
      problems,
      paused: this.paused,
    };
  }

  async stop(): Promise<Uint8Array> {
    this.ev('ride_stop');
    removeEventListener('devicemotion', this.onMotion);
    document.removeEventListener('visibilitychange', this.onVis);
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    if (this.flushTimer !== null) clearInterval(this.flushTimer);
    try { await this.wake?.release(); } catch { /* ignorat */ }
    await this.flush();
    return buildZipFromSession(this.session, {
      ...this.meta,
      motion_clock: this.clockMode,
      observed_resolution: this.allTenth ? '0.1 m/s² (browserul rotunjește)' : 'fără rotunjire vizibilă',
      stop: new Date().toISOString(),
    });
  }
}

export async function buildZipFromSession(session: string, metaOverride: Record<string, unknown> = {}): Promise<Uint8Array> {
  const chunks = await recGet(session);
  const motion: RecorderMotionRow[] = [];
  const gps: RecorderData['gps'] = [];
  const events: RideEvent[] = [];
  for (const c of chunks.sort((a, b) => (a.id ?? 0) - (b.id ?? 0))) {
    if (c.kind === 'motion') motion.push(...(c.data as RecorderMotionRow[]));
    else if (c.kind === 'gps') gps.push(...(c.data as RecorderData['gps']));
    else events.push(...(c.data as RideEvent[]));
  }
  const meta = {
    app_version: __APP_VERSION__,
    user_agent: navigator.userAgent,
    ride_uuid: session,
    start: motion.length ? new Date(motion[0].t).toISOString() : null,
    ...metaOverride,
  };
  return buildShockGridZip({ meta, motion, gps, events });
}

export { recDelete };
