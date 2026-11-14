import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/core/config';
import { HighPassBiquad } from '../src/core/filters';
import { GpsTrack, computeDistance } from '../src/core/gpstrack';
import { processRide } from '../src/core/process';
import { computeSignal, computeWindows, detectShocks, vdvOf } from '../src/core/vibration';
import type { GpsFix } from '../src/core/types';
import { syntheticRide } from './helpers';

describe('biquad trece-sus Butterworth', () => {
  for (const fs of [100, 58.5, 40]) {
    it(`fs = ${fs} Hz: -3 dB la 4 Hz, atenuare la pedalare, trece la 15 Hz`, () => {
      const f = new HighPassBiquad(4, fs);
      expect(f.gainAt(4)).toBeCloseTo(Math.SQRT1_2, 2);
      expect(f.gainAt(1)).toBeLessThan(0.08);
      expect(f.gainAt(15)).toBeGreaterThan(0.95);
    });
  }
  it('răspunsul simulat la o sinusoidă de 1 Hz e mic', () => {
    const f = new HighPassBiquad(4, 100);
    let m = 0;
    for (let i = 0; i < 1000; i++) { const y = f.step(Math.sin((2 * Math.PI * i) / 100)); if (i > 300) m = Math.max(m, Math.abs(y)); }
    expect(m).toBeLessThan(0.08);
  });
});

describe('proiecția verticală invariantă la rotirea telefonului', () => {
  it('același semnal rotit cu 90° dă același a_v', () => {
    const a = syntheticRide({ seconds: 20, fs: 100, vibAmp: 1.5, gravityDir: [0, 0, 1] });
    const b = syntheticRide({ seconds: 20, fs: 100, vibAmp: 1.5, gravityDir: [1, 0, 0] });
    const c = syntheticRide({ seconds: 20, fs: 100, vibAmp: 1.5, gravityDir: [0.3, -0.8, 0.5] });
    const sa = computeSignal(a, DEFAULT_CONFIG), sb = computeSignal(b, DEFAULT_CONFIG), sc = computeSignal(c, DEFAULT_CONFIG);
    let maxd = 0;
    for (let i = 500; i < sa.bp.length; i++) maxd = Math.max(maxd, Math.abs(sa.bp[i] - sb.bp[i]), Math.abs(sa.bp[i] - sc.bp[i]));
    expect(maxd).toBeLessThan(1e-3);
    expect(sa.gravityMedian!).toBeCloseTo(9.81, 1);
  });
});

describe('ferestre și indicele', () => {
  it('RMS-ul unei sinusoide de amplitudine RMS cunoscută la 12 Hz', () => {
    const r = syntheticRide({ seconds: 30, fs: 100, vibAmp: 2.0, vibHz: 12 });
    const p = processRide(r);
    const valid = p.windows.filter((w) => w.valid);
    expect(valid.length).toBeGreaterThan(20);
    for (const w of valid) expect(w.rms).toBeGreaterThan(1.8), expect(w.rms).toBeLessThan(2.15);
  });
  it('excluderi: viteză mică, viteză necunoscută, gol, rotație', () => {
    const slow = processRide(syntheticRide({ seconds: 15, fs: 100, vibAmp: 1, speed: 1 }));
    expect(slow.windows.filter((w) => w.valid).length).toBe(0);
    expect(slow.summary.reasons['speed_low']).toBeGreaterThan(5);
    const unk = processRide(syntheticRide({ seconds: 15, fs: 100, vibAmp: 1, speed: null }));
    expect(unk.summary.reasons['speed_unknown']).toBeGreaterThan(5);
    const gap = processRide(syntheticRide({ seconds: 20, fs: 100, vibAmp: 1, gapAt: [10, 10.5] }));
    expect(gap.summary.reasons['gap']).toBeGreaterThanOrEqual(2);
    const gyro = processRide(syntheticRide({ seconds: 20, fs: 100, vibAmp: 1, gyroDeg: (s) => (s > 10 && s < 11 ? 400 : 5) }));
    expect(gyro.summary.reasons['gyro']).toBeGreaterThanOrEqual(2);
  });
  it('fs < 40 Hz exclus', () => {
    const p = processRide(syntheticRide({ seconds: 15, fs: 30, vibAmp: 1 }));
    expect(p.summary.reasons['low_fs']).toBeGreaterThan(5);
  });
});

describe('VDV', () => {
  it('sinusoidă de amplitudine a pe T secunde: (3T/8)^(1/4)·a', () => {
    const a = 2, fs = 1000, T = 10;
    const parts: number[] = [];
    for (let i = 0; i < T * fs; i++) parts.push(Math.pow(a * Math.sin((2 * Math.PI * 10 * i) / fs), 4) / fs);
    expect(vdvOf(parts)).toBeCloseTo(a * Math.pow((3 * T) / 8, 0.25), 2);
  });
});

describe('distanța (6.6)', () => {
  it('staționar cu jitter GPS și viteză < 0,15 m/s → < 5 m', () => {
    const fixes: GpsFix[] = [];
    let s = 1;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5);
    for (let i = 0; i < 74; i++) fixes.push({ t: i * 500, lat: 45.75 + rnd() * 4e-5, lon: 21.22 + rnd() * 5e-5, acc: 5, alt: null, speed: Math.abs(rnd()) * 0.14, heading: null, speedAcc: null });
    expect(computeDistance(fixes).total).toBeLessThan(5);
  });
  it('sintetic 5 m/s cu zgomot GPS corelat ~4 m: ±10% (ambele metode)', () => {
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
    let nx = 0, ny = 0;
    const fixes: GpsFix[] = [];
    const N = 400;
    for (let i = 0; i <= N; i++) {
      nx = 0.9 * nx + rnd() * 1.8; ny = 0.9 * ny + rnd() * 1.8; // AR(1), σ ≈ 4 m
      const d = 5 * i;
      fixes.push({ t: i * 1000, lat: 45.75 + (d + ny) / 111195, lon: 21.22 + nx / 77600, acc: 4, alt: null, speed: 5 + rnd() * 0.3, heading: 0, speedAcc: null });
    }
    const truth = 5 * N;
    const bySpeed = computeDistance(fixes);
    expect(bySpeed.method).toBe('speed');
    expect(Math.abs(bySpeed.total - truth) / truth).toBeLessThan(0.1);
    const byPos = computeDistance(fixes.map((f) => ({ ...f, speed: null })));
    expect(byPos.method).toBe('positions');
    expect(Math.abs(byPos.total - truth) / truth).toBeLessThan(0.1);
  });
});

describe('șocuri punctuale (6.10)', () => {
  it('un impuls puternic peste vibrația de fond e detectat o singură dată, cu dublă lovitură', () => {
    const r = syntheticRide({ seconds: 40, fs: 100, vibAmp: 0.4 });
    // două impulsuri: roata din față la 25 s, spate la 1,05 m / 5 m/s = 0,21 s după
    const t0 = r.motion.t[0];
    for (let i = 0; i < r.motion.t.length; i++) {
      const s = (r.motion.t[i] - t0) / 1000;
      for (const at of [25, 25.21]) {
        const d = s - at;
        if (d >= 0 && d < 0.05) r.motion.z[i] += 15 * Math.sin((2 * Math.PI * d) / 0.05) * Math.exp(-d * 40);
      }
    }
    const sig = computeSignal(r, DEFAULT_CONFIG);
    const shocks = detectShocks(r, sig, DEFAULT_CONFIG, new GpsTrack(r.gps));
    expect(shocks.length).toBe(1);
    expect(shocks[0].peak).toBeGreaterThan(4);
    expect(Math.abs(shocks[0].t - (t0 + 25000))).toBeLessThan(300);
    expect(shocks[0].double_hit).toBe(true);
    expect(shocks[0].needs_review).toBe(false);
    expect(shocks[0].located).toBe(true);
    expect(shocks[0].snippet.v.length).toBe(300);
  });
  it('fără impulsuri: niciun șoc', () => {
    const r = syntheticRide({ seconds: 40, fs: 100, vibAmp: 0.8 });
    const sig = computeSignal(r, DEFAULT_CONFIG);
    expect(detectShocks(r, sig, DEFAULT_CONFIG, new GpsTrack(r.gps)).length).toBe(0);
    void computeWindows;
  });
});
