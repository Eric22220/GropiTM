// Înregistratorul web cu dependențe simulate (fără telefon real): pornire, pauză, oprire, captare IMU,
// analiza live și șocurile candidate. NU înlocuiește testul pe iPhone/Samsung.
import { describe, expect, it } from 'vitest';
import { LiveAnalyzer } from '../src/capture/live';
import { Recorder, buildZipFromSession, type MotionLike, type RecorderDeps } from '../src/capture/recorder';
import { parseRideFile } from '../src/core/io';
import { processRide } from '../src/core/process';
import type { RecChunk } from '../src/storage/idb';
import type { GeoLike } from '../src/services/location';

class Clock { t = 1_800_000_000_000; }

function fakeDeps(clock: Clock) {
  const chunks: RecChunk[] = [];
  let motionL: ((e: MotionLike) => void) | null = null;
  let tick: (() => void) | null = null;
  let gpsOk: ((p: GeolocationPosition) => void) | null = null;
  let gpsErr: ((e: GeolocationPositionError) => void) | null = null;
  const watches = new Set<number>();
  const geo: GeoLike = {
    watchPosition: (ok, err) => { gpsOk = ok; gpsErr = err; watches.add(1); return 1; },
    clearWatch: (id) => { watches.delete(id); },
  };
  let wakeReleased = false;
  const deps: RecorderDeps = {
    addMotion: (l) => { motionL = l; },
    removeMotion: () => { motionL = null; },
    geo,
    append: async (c) => { chunks.push({ ...c, id: chunks.length + 1 }); },
    load: async (session) => chunks.filter((c) => c.session === session),
    requestWakeLock: async () => ({ release: async () => { wakeReleased = true; }, addEventListener: () => {} }),
    now: () => clock.t,
    timeOrigin: 1_800_000_000_000,
    setInterval: (f) => { tick = f; return 1; },
    clearInterval: () => { tick = null; },
  };
  return {
    deps, chunks, watches, get wakeReleased() { return wakeReleased; }, get listening() { return motionL !== null; },
    motion(e: MotionLike) { motionL?.(e); },
    fix(lat: number, lon: number, speed: number) {
      gpsOk?.({ timestamp: clock.t, coords: { latitude: lat, longitude: lon, accuracy: 5, speed, heading: 0, altitude: null, altitudeAccuracy: null } } as unknown as GeolocationPosition);
    },
    gpsFail(code: number) { gpsErr?.({ code, message: 'x' } as GeolocationPositionError); },
    tick() { tick?.(); },
  };
}

/** simulează `seconds` de mers la 100 Hz și 5 m/s, cu vibrație de fond și un impuls la `impulseAt` */
function ride(f: ReturnType<typeof fakeDeps>, clock: Clock, seconds: number, startS = 0, impulseAt: number | null = null) {
  for (let i = 0; i < seconds * 100; i++) {
    const s = startS + i / 100;
    clock.t = 1_800_000_000_000 + s * 1000;
    let z = 9.81 + 0.6 * Math.sin(2 * Math.PI * 12 * s);
    if (impulseAt !== null) { const d = s - impulseAt; if (d >= 0 && d < 0.05) z += 16 * Math.sin((2 * Math.PI * d) / 0.05); }
    f.motion({ timeStamp: s * 1000 + 0.001, interval: 10, accelerationIncludingGravity: { x: 0.1, y: 0.2, z }, acceleration: null, rotationRate: { alpha: 2, beta: 1, gamma: 1 } });
    if (i % 100 === 0) { f.fix(45.75 + (s * 5) / 111195, 21.22, 5); f.tick(); }
  }
}

describe('înregistratorul web (dependențe simulate)', () => {
  it('pornire → captare IMU + GPS → pauză (ignoră datele) → reluare → oprire → ZIP procesabil', async () => {
    const clock = new Clock();
    const f = fakeDeps(clock);
    const rec = new Recorder({ label: 'test' }, f.deps);
    await rec.begin();
    expect(f.listening).toBe(true);
    expect(f.watches.size).toBe(1);
    expect(rec.stats().state).toBe('recording');
    expect(rec.stats().wakeLock).toBe('on');
    ride(f, clock, 40, 0, 30);
    let st = rec.stats();
    expect(st.imu).toBe('ok');
    expect(st.samples).toBe(4000);
    expect(st.fixes).toBe(40);
    expect(st.live.distance).toBeGreaterThan(150);
    expect(st.live.validWindows).toBeGreaterThan(10);
    // analiza live a găsit șocul candidat de la 30 s, fără a deranja utilizatorul
    expect(st.live.candidates.length).toBe(1);
    expect(Math.abs(st.live.candidates[0].t - (1_800_000_000_000 + 30000))).toBeLessThan(300);
    rec.pause();
    expect(rec.stats().state).toBe('paused');
    ride(f, clock, 5, 40);
    expect(rec.stats().samples).toBe(4000); // în pauză nu se înregistrează nimic
    rec.resume();
    ride(f, clock, 10, 45);
    st = rec.stats();
    expect(st.samples).toBe(5000);
    expect(st.elapsed_s).toBeCloseTo(50, -1);
    const zip = await rec.stop();
    expect(f.listening).toBe(false);
    expect(f.watches.size).toBe(0);
    expect(f.wakeReleased).toBe(true);
    expect(rec.stats().state).toBe('stopped');
    // aceleași bucăți salvate „în IndexedDB” reconstruiesc tura
    const again = await buildZipFromSession(rec.session, {}, f.chunks);
    for (const z of [zip, again].slice(1)) expect(z.length).toBeGreaterThan(1000);
    const raw = parseRideFile('rec.zip', again);
    expect(raw.meta.source).toBe('shockgrid');
    expect(raw.motion.t.length).toBe(5000);
    expect(raw.events.map((e) => e.type)).toEqual(expect.arrayContaining(['ride_start', 'pause', 'resume', 'ride_stop', 'wakelock_acquired']));
    const p = processRide(raw);
    expect(p.shocks.length).toBeGreaterThanOrEqual(1);
  });
  it('fără senzori de mișcare: doar GPS, cu avertisment; refuzul GPS e raportat', async () => {
    const clock = new Clock();
    const f = fakeDeps(clock);
    const rec = new Recorder({}, f.deps);
    await rec.begin();
    clock.t += 5000;
    f.fix(45.75, 21.22, 4);
    const st = rec.stats();
    expect(st.imu).toBe('none');
    expect(st.problems.join(' ')).toMatch(/senzorii de mișcare nu trimit date/);
    f.gpsFail(1);
    expect(rec.stats().problems.join(' ')).toMatch(/refuzat/);
    await rec.stop();
  });
});

describe('analiza live = același nucleu ca procesarea completă', () => {
  it('RMS-ul ferestrelor live coincide cu cel al procesării complete', async () => {
    const clock = new Clock();
    const f = fakeDeps(clock);
    const rec = new Recorder({}, f.deps);
    await rec.begin();
    ride(f, clock, 60);
    const zip = await rec.stop();
    const full = processRide(parseRideFile('a.zip', zip));
    const live = new LiveAnalyzer();
    const raw = parseRideFile('a.zip', zip);
    for (let i = 0; i < raw.motion.t.length; i++) live.addMotion({ t: raw.motion.t[i], x: raw.motion.x[i], y: raw.motion.y[i], z: raw.motion.z[i], withGravity: true, gyro: 3 });
    for (const g of raw.gps) live.addFix(g);
    live.run();
    const s = live.summary(raw.motion.t[raw.motion.t.length - 1]);
    const fullValid = full.windows.filter((w) => w.valid);
    expect(s.validWindows).toBeGreaterThan(0.8 * fullValid.length);
    expect(s.lastRms!).toBeCloseTo(fullValid[fullValid.length - 1].rms, 1);
  });
});
