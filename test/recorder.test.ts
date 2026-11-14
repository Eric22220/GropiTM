// Înregistratorul web cu dependențe simulate (fără telefon real): pornire, pauză, oprire, captare IMU,
// analiza live și șocurile candidate. NU înlocuiește testul pe iPhone/Samsung.
import { describe, expect, it } from 'vitest';
import { LiveAnalyzer } from '../src/capture/live';
import { GPS_WAIT_MS, Recorder, buildZipFromSession, classifySources, type MotionLike, type RecorderDeps } from '../src/capture/recorder';
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
});

describe('sursele de date ale turei: GPS + IMU, doar GPS, doar IMU, nimic', () => {
  const T0 = 1_800_000_000_000;
  const imuBurst = (f: ReturnType<typeof fakeDeps>, clock: Clock, fromS: number, seconds: number) => {
    for (let i = 0; i < seconds * 100; i++) {
      const s = fromS + i / 100;
      clock.t = T0 + s * 1000;
      f.motion({ timeStamp: s * 1000 + 0.001, interval: 10, accelerationIncludingGravity: { x: 0.1, y: 0.2, z: 9.81 + 0.5 * Math.sin(2 * Math.PI * 12 * s) }, acceleration: null, rotationRate: { alpha: 1, beta: 1, gamma: 1 } });
    }
  };
  it('clasificarea e completă și fără ambiguități', () => {
    expect(classifySources('ok', 'ok')).toBe('both');
    expect(classifySources('ok', 'stale')).toBe('both');
    expect(classifySources('none', 'ok')).toBe('gps_only');
    expect(classifySources('ok', 'denied')).toBe('imu_only');
    expect(classifySources('ok', 'unavailable')).toBe('imu_only');
    expect(classifySources('none', 'denied')).toBe('none');
    expect(classifySources('none', 'unavailable')).toBe('none');
    expect(classifySources('waiting', 'searching')).toBe('waiting');
    expect(classifySources('ok', 'searching')).toBe('waiting');
  });
  it('la pornire: „waiting”, nu „se înregistrează”', async () => {
    const clock = new Clock();
    const f = fakeDeps(clock);
    const rec = new Recorder({}, f.deps);
    await rec.begin();
    expect(rec.stats().sources).toBe('waiting');
    await rec.stop();
  });
  it('GPS + IMU: „both”', async () => {
    const clock = new Clock();
    const f = fakeDeps(clock);
    const rec = new Recorder({}, f.deps);
    await rec.begin();
    ride(f, clock, 6);
    const st = rec.stats();
    expect(st.gps).toBe('ok');
    expect(st.imu).toBe('ok');
    expect(st.sources).toBe('both');
    expect(rec.isEmpty()).toBe(false);
    await rec.stop();
  });
  it('doar GPS (senzori refuzați): „gps_only”, tura se salvează ca traseu fără confort', async () => {
    const clock = new Clock();
    const f = fakeDeps(clock);
    const rec = new Recorder({}, f.deps);
    await rec.begin();
    for (let s = 0; s < 20; s++) { clock.t = T0 + s * 1000; f.fix(45.75 + (s * 5) / 111195, 21.22, 5); f.tick(); }
    const st = rec.stats();
    expect(st.imu).toBe('none');
    expect(st.sources).toBe('gps_only');
    const raw = parseRideFile('g.zip', await rec.stop());
    expect(raw.gps.length).toBe(20);
    expect(raw.motion.t.length).toBe(0);
    expect(raw.meta.warnings.join(' ')).toMatch(/doar traseul GPS/);
  });
  it('doar IMU (locație refuzată): „imu_only”, vibrațiile se păstrează, fără poziții', async () => {
    const clock = new Clock();
    const f = fakeDeps(clock);
    const rec = new Recorder({}, f.deps);
    await rec.begin();
    f.gpsFail(1);
    imuBurst(f, clock, 0, 30);
    f.tick();
    const st = rec.stats();
    expect(st.gps).toBe('denied');
    expect(st.sources).toBe('imu_only');
    const raw = parseRideFile('i.zip', await rec.stop());
    expect(raw.gps.length).toBe(0);
    expect(raw.motion.t.length).toBe(3000);
    const p = processRide(raw);
    expect(p.windows.every((w) => w.edge < 0)).toBe(true); // nimic pe hartă
  });
  it('nimic (locație refuzată, senzori muți): „none” după câteva secunde, tura e goală', async () => {
    const clock = new Clock();
    const f = fakeDeps(clock);
    const rec = new Recorder({}, f.deps);
    await rec.begin();
    f.gpsFail(1);
    clock.t = T0 + 1000;
    expect(rec.stats().sources).toBe('waiting');
    clock.t = T0 + 5000;
    // evenimente goale (ex. Chrome pe desktop) nu contează ca date
    f.motion({ timeStamp: 5000, accelerationIncludingGravity: { x: null, y: null, z: null }, acceleration: null, rotationRate: null });
    const st = rec.stats();
    expect(st.sources).toBe('none');
    expect(st.samples).toBe(0);
    expect(rec.isEmpty()).toBe(true);
    await rec.stop();
  });
  it('GPS care tace (fără eroare) devine „unavailable” după GPS_WAIT_MS', async () => {
    const clock = new Clock();
    const f = fakeDeps(clock);
    const rec = new Recorder({}, f.deps);
    await rec.begin();
    clock.t = T0 + GPS_WAIT_MS - 1000;
    expect(rec.stats().gps).toBe('searching');
    clock.t = T0 + GPS_WAIT_MS + 1000;
    expect(rec.stats().gps).toBe('unavailable');
    expect(rec.stats().sources).toBe('none');
    await rec.stop();
  });
  it('„Reîncearcă” repornește GPS-ul după ce permisiunea a fost dată', async () => {
    const clock = new Clock();
    const f = fakeDeps(clock);
    const rec = new Recorder({}, f.deps);
    await rec.begin();
    f.gpsFail(1);
    clock.t = T0 + 4000;
    expect(rec.stats().gps).toBe('denied');
    rec.watchGps();
    expect(rec.stats().gps).toBe('searching');
    expect(f.watches.size).toBe(1);
    f.fix(45.75, 21.22, 3);
    expect(rec.stats().gps).toBe('ok');
    expect(rec.stats().sources).toBe('gps_only');
    await rec.stop();
    expect(f.watches.size).toBe(0);
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
