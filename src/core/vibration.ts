// Indicele de vibrație (6.1–6.4) și șocurile punctuale (6.10). TS pur, fără DOM.
import type { VibrationConfig } from './config';
import { HighPassBiquad } from './filters';
import { GpsTrack, distanceAt } from './gpstrack';
import { mad, median } from './stats';
import type { GyroData, RawRide, Shock, ShockFlag, VibWindow, WindowReason } from './types';

export interface Signal {
  t: Float64Array;
  av: Float32Array; // componenta verticală, nefiltrată
  bp: Float32Array; // a_v filtrat trece-sus
  /** 0 = ok, 1 = gol/mostră invalidă, 2 = stabilizare după start/gol */
  bad: Uint8Array;
  gaps: [number, number][];
  mountShifts: number[];
  gravityMedian: number | null;
  dtMedian: number;
}

/** 6.2 + 6.3: gravitația estimată, proiecția verticală, filtrarea trece-sus */
export function computeSignal(raw: RawRide, cfg: VibrationConfig): Signal {
  const { t, x, y, z, withGravity } = raw.motion;
  const n = t.length;
  const av = new Float32Array(n);
  const bp = new Float32Array(n);
  const bad = new Uint8Array(n);
  const gaps: [number, number][] = [];
  const mountShifts: number[] = [];
  const gmag: number[] = [];

  const dts = new Float64Array(Math.max(0, n - 1));
  for (let i = 1; i < n; i++) dts[i - 1] = t[i] - t[i - 1];
  const dtMedian = n > 1 ? median(dts) : 10;
  const fs0 = 1000 / (dtMedian || 10);
  const hp = new HighPassBiquad(cfg.hp_hz, fs0);
  const tau = cfg.gravity_tau_s;

  let gx = 0, gy = 0, gz = 0;
  let needReset = true;
  let settleUntil = -Infinity;
  let fsCur = fs0;
  // istoric de direcție a gravitației, pentru mount_shift
  const uHist: { t: number; ux: number; uy: number; uz: number }[] = [];
  let lastShift = -Infinity;
  let jStart = 0; // fereastra de 2 s pentru fs local

  const invalid = (i: number) =>
    !Number.isFinite(x[i]) || !Number.isFinite(y[i]) || !Number.isFinite(z[i]) ||
    Math.abs(x[i]) > cfg.max_abs || Math.abs(y[i]) > cfg.max_abs || Math.abs(z[i]) > cfg.max_abs;

  for (let i = 0; i < n; i++) {
    if (invalid(i)) {
      bad[i] = 1;
      needReset = true;
      continue;
    }
    const dt = i > 0 ? t[i] - t[i - 1] : 0;
    if (i > 0 && dt > cfg.gap_ms) {
      gaps.push([t[i - 1], t[i]]);
      needReset = true;
    }
    // fs local: mediana intervalelor din ultimele 2 s, recalculată periodic
    if (i % 32 === 0 && i > 1) {
      while (jStart < i && t[i] - t[jStart] > 2000) jStart++;
      if (i - jStart > 8) {
        const loc = median(dts.subarray(jStart, i - 1));
        const fsNew = 1000 / loc;
        if (Number.isFinite(fsNew) && Math.abs(fsNew - fsCur) / fsCur > 0.1) {
          fsCur = fsNew;
          hp.setFs(fsCur);
        }
      }
    }
    if (needReset) {
      // inițializare cu media următoarei jumătăți de secundă de mostre valide
      let sx = 0, sy = 0, sz = 0, k = 0;
      for (let j = i; j < n && t[j] - t[i] < 500; j++) {
        if (j > i && t[j] - t[j - 1] > cfg.gap_ms) break;
        if (invalid(j)) break;
        sx += x[j]; sy += y[j]; sz += z[j]; k++;
      }
      gx = sx / k; gy = sy / k; gz = sz / k;
      settleUntil = t[i] + cfg.settle_s * 1000;
      uHist.length = 0;
      needReset = false;
      let v0: number;
      if (withGravity) {
        const gm = Math.hypot(gx, gy, gz) || 1;
        v0 = ((x[i] - gx) * gx + (y[i] - gy) * gy + (z[i] - gz) * gz) / gm;
      } else v0 = Math.hypot(x[i], y[i], z[i]);
      hp.reset(withGravity ? 0 : v0);
    } else if (withGravity) {
      const a = (dt / 1000) / (tau + dt / 1000);
      gx += a * (x[i] - gx);
      gy += a * (y[i] - gy);
      gz += a * (z[i] - gz);
    }
    let v: number;
    if (withGravity) {
      const gm = Math.hypot(gx, gy, gz) || 1;
      const ux = gx / gm, uy = gy / gm, uz = gz / gm;
      v = (x[i] - gx) * ux + (y[i] - gy) * uy + (z[i] - gz) * uz;
      if (i % 25 === 0) gmag.push(gm);
      // mount_shift: schimbarea direcției gravitației > prag într-o secundă
      if (t[i] >= settleUntil) {
        const last = uHist[uHist.length - 1];
        if (!last || t[i] - last.t >= 100) {
          uHist.push({ t: t[i], ux, uy, uz });
          while (uHist.length && t[i] - uHist[0].t > 1050) uHist.shift();
          const old = uHist[0];
          if (old && t[i] - old.t >= 900) {
            const dot = Math.max(-1, Math.min(1, old.ux * ux + old.uy * uy + old.uz * uz));
            const ang = (Math.acos(dot) * 180) / Math.PI;
            if (ang > cfg.mount_shift_deg && t[i] - lastShift > 1000) {
              mountShifts.push(t[i]);
              lastShift = t[i];
            }
          }
        }
      }
    } else {
      v = Math.hypot(x[i], y[i], z[i]); // 6.2.4: fișiere vechi fără gravitație
    }
    av[i] = v;
    bp[i] = hp.step(v);
    if (t[i] < settleUntil) bad[i] = 2;
  }
  return { t, av, bp, bad, gaps, mountShifts, gravityMedian: gmag.length ? median(gmag) : null, dtMedian };
}

function gyroMaxIn(g: GyroData | null, t0: number, t1: number, cursor: { j: number }): number | null {
  if (!g) return null;
  while (cursor.j < g.t.length && g.t[cursor.j] < t0) cursor.j++;
  let m = -Infinity;
  for (let j = cursor.j; j < g.t.length && g.t[j] <= t1; j++) if (g.mag[j] > m) m = g.mag[j];
  return Number.isFinite(m) ? m : null;
}

function gyroMaxAround(g: GyroData | null, t0: number, t1: number): number | null {
  if (!g) return null;
  let lo = 0, hi = g.t.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (g.t[m] < t0) lo = m + 1; else hi = m; }
  let mx = -Infinity;
  for (let j = lo; j < g.t.length && g.t[j] <= t1; j++) if (g.mag[j] > mx) mx = g.mag[j];
  return Number.isFinite(mx) ? mx : null;
}

function hiddenIntervals(raw: RawRide): [number, number][] {
  const out: [number, number][] = [];
  let start: number | null = null;
  for (const e of [...raw.events].sort((a, b) => a.t - b.t)) {
    if (e.type === 'visibility_hidden' && start === null) start = e.t;
    if (e.type === 'visibility_visible' && start !== null) { out.push([start, e.t]); start = null; }
  }
  if (start !== null) out.push([start, Infinity]);
  return out;
}

const overlaps = (iv: [number, number][], a: number, b: number) => iv.some(([s, e]) => s < b && e > a);

/** 6.4: ferestre de 2 s cu pas de 1 s */
export function computeWindows(raw: RawRide, sig: Signal, cfg: VibrationConfig, track: GpsTrack, cum: Float64Array): VibWindow[] {
  const { t } = sig;
  const n = t.length;
  const out: VibWindow[] = [];
  if (n < 2) return out;
  const W = cfg.window_s * 1000, S = cfg.step_s * 1000;
  const hidden = hiddenIntervals(raw);
  const gc = { j: 0 };
  let i0 = 0;
  for (let ws = t[0]; ws + W <= t[n - 1]; ws += S) {
    const we = ws + W;
    while (i0 < n && t[i0] < ws) i0++;
    let i1 = i0;
    while (i1 < n && t[i1] < we) i1++;
    const cnt = i1 - i0;
    let reason: WindowReason = 'ok';
    let sum2 = 0, sum4 = 0, anyBad = 0, anySettle = 0;
    const abs: number[] = [];
    const dtl: number[] = [];
    for (let i = i0; i < i1; i++) {
      if (i > i0) dtl.push(t[i] - t[i - 1]);
      if (sig.bad[i] === 1) { anyBad++; continue; }
      if (sig.bad[i] === 2) anySettle++;
      const v = sig.bp[i];
      const dt = i > 0 ? Math.min(t[i] - t[i - 1], cfg.gap_ms) / 1000 : 0;
      sum2 += v * v;
      sum4 += v * v * v * v * dt;
      abs.push(Math.abs(v));
    }
    const fs = dtl.length ? 1000 / median(dtl) : 0;
    const good = abs.length;
    const rms = good ? Math.sqrt(sum2 / good) : 0;
    abs.sort((a, b) => a - b);
    const p95 = good ? abs[Math.min(good - 1, Math.floor(0.95 * (good - 1)))] : 0;
    const hasGap = anyBad > 0 || cnt < 2 || sig.gaps.some(([a, b]) => a < we && b > ws) ||
      (i0 > 0 && t[i0] - t[i0 - 1] > cfg.gap_ms && t[i0] - ws > cfg.gap_ms) || (i1 < n && t[i1] - t[i1 - 1] > cfg.gap_ms);
    const gyro = gyroMaxIn(raw.gyro, ws, we, gc);
    const tc = (ws + we) / 2;
    const pos = track.at(tc, 3000);
    const speed = pos?.speed ?? null;
    const r = pos ? (pos.acc ?? 0) + (speed ?? 0) * 0.3 : null;
    const mount = sig.mountShifts.some((m) => m >= ws - 500 && m <= we + 500);

    if (hasGap) reason = 'gap';
    else if (anySettle > 0) reason = 'settling';
    else if (overlaps(hidden, ws, we)) reason = 'hidden';
    else if (fs < cfg.min_fs) reason = 'low_fs';
    else if (!pos) reason = 'no_gps';
    else if (speed === null) reason = 'speed_unknown';
    else if (speed < cfg.speed_min) reason = 'speed_low';
    else if (speed > cfg.speed_max) reason = 'speed_high';
    else if (gyro !== null && gyro > cfg.gyro_max) reason = 'gyro';
    else if (mount) reason = 'mount_shift';

    out.push({
      t0: ws, t1: we,
      lat: pos?.lat ?? null, lon: pos?.lon ?? null, r, acc: pos?.acc ?? null, speed,
      rms, vdv: sum4, p95, gyro, fs, valid: reason === 'ok', reason,
      dist: distanceAt(track, cum, tc), edge: -1, amb: false, pass: -1,
    });
  }
  return out;
}

/** 6.10: șocuri punctuale cu prag adaptiv local */
export function detectShocks(raw: RawRide, sig: Signal, cfg: VibrationConfig, track: GpsTrack): Shock[] {
  const { t, bp, bad } = sig;
  const n = t.length;
  interface Ep { tPeak: number; peak: number; z: number; tEnd: number; iPeak: number }
  const eps: Ep[] = [];
  // tampon pentru baseline (subeșantionat la ~40 ms)
  const bufT: number[] = [], bufV: number[] = [];
  let lastAdd = -Infinity, lastRecalc = -Infinity, lastSpeedCheck = -Infinity;
  let med = 0, sigma = cfg.shock_sigma_min, ready = false, moving = true;
  let inShock = false;
  let cur: Ep | null = null;
  let belowSince: number | null = null;
  for (let i = 0; i < n; i++) {
    if (bad[i]) { inShock = false; cur = null; belowSince = null; continue; }
    const v = Math.abs(bp[i]);
    const ti = t[i];
    if (ti - lastSpeedCheck > 500) {
      const p = track.at(ti, 3000);
      moving = !(p && p.speed !== null && p.speed < 1);
      lastSpeedCheck = ti;
    }
    if (!inShock) {
      if (moving && ti - lastAdd >= 40) { bufT.push(ti); bufV.push(v); lastAdd = ti; }
      if (ti - lastRecalc >= 500) {
        let k = 0;
        while (k < bufT.length && ti - bufT[k] > cfg.shock_baseline_s * 1000) k++;
        if (k) { bufT.splice(0, k); bufV.splice(0, k); }
        if (bufV.length >= 50) {
          med = median(bufV);
          sigma = Math.max(1.4826 * mad(bufV, med), cfg.shock_sigma_min);
          ready = true;
        }
        lastRecalc = ti;
      }
    }
    if (!ready) continue;
    const z = (v - med) / sigma;
    if (!inShock) {
      if (z > cfg.shock_z && v > cfg.shock_abs) {
        inShock = true;
        cur = { tPeak: ti, peak: v, z, tEnd: ti, iPeak: i };
        belowSince = null;
      }
    } else if (cur) {
      if (v > cur.peak) { cur.peak = v; cur.z = z; cur.tPeak = ti; cur.iPeak = i; }
      if (z < cfg.shock_end_z) {
        if (belowSince === null) belowSince = ti;
        if (ti - belowSince >= cfg.shock_end_ms) {
          cur.tEnd = ti;
          eps.push(cur);
          inShock = false; cur = null; belowSince = null;
          lastRecalc = -Infinity; // baseline-ul se reia după șoc
        }
      } else belowSince = null;
    }
  }
  if (cur) { cur.tEnd = t[n - 1]; eps.push(cur); }

  // grupare: roțile față/spate, cooldown
  const shocks: Shock[] = [];
  let g: { eps: Ep[]; end: number } | null = null;
  const flush = () => {
    if (!g) return;
    const main = g.eps.reduce((a, b) => (b.peak > a.peak ? b : a));
    const pos = track.at(main.tPeak, 3000);
    const speed = pos?.speed ?? null;
    let double_hit = false;
    if (speed && speed > 0.5 && g.eps.length > 1) {
      const expect = cfg.wheelbase_m / speed;
      for (let a = 0; a < g.eps.length; a++)
        for (let b = a + 1; b < g.eps.length; b++) {
          const d = Math.abs(g.eps[b].tPeak - g.eps[a].tPeak) / 1000;
          if (d >= expect * 0.7 && d <= expect * 1.3) double_hit = true;
        }
    }
    const flags: ShockFlag[] = [];
    if (speed === null) flags.push('speed_unknown');
    else if (speed < cfg.speed_min || speed > cfg.speed_max) flags.push('speed_band');
    const gm = gyroMaxAround(raw.gyro, main.tPeak - 500, main.tPeak + 500);
    if (gm !== null && gm > cfg.gyro_max) flags.push('gyro');
    if (sig.mountShifts.some((m) => Math.abs(m - main.tPeak) <= 1000)) flags.push('mount_shift');
    if (sig.gaps.some(([a, b]) => a < main.tPeak + 1000 && b > main.tPeak - 1000)) flags.push('gap');
    // fragment ±3 s, max-abs cu semn pe compartimente de 20 ms
    const binMs = 20;
    const vals: number[] = [];
    const tS = main.tPeak - 3000;
    let lo = 0, hi = n;
    while (lo < hi) { const m = (lo + hi) >> 1; if (t[m] < tS) lo = m + 1; else hi = m; }
    for (let b = 0; b < 300; b++) {
      const a0 = tS + b * binMs, a1 = a0 + binMs;
      let best = NaN;
      while (lo < n && t[lo] < a1) {
        if (t[lo] >= a0 && !bad[lo] && (Number.isNaN(best) || Math.abs(bp[lo]) > Math.abs(best))) best = bp[lo];
        lo++;
      }
      vals.push(Number.isNaN(best) ? NaN : Math.round(best * 100) / 100);
    }
    const r = pos ? (pos.acc ?? 0) + (speed ?? 0) * 0.3 : null;
    shocks.push({
      id: `s${Math.round(main.tPeak)}`,
      t: main.tPeak,
      peak: main.peak,
      z: main.z,
      double_hit,
      speed,
      lat: pos?.lat ?? null,
      lon: pos?.lon ?? null,
      r,
      flags,
      located: !!pos,
      needs_review: flags.length > 0,
      edge: -1,
      pass: -1,
      snippet: { dt: binMs, v: vals },
    });
    g = null;
  };
  for (const e of eps) {
    if (g) {
      const p = track.at(e.tPeak, 3000);
      const v = p?.speed ?? null;
      const mergeGap = Math.max(400, v && v > 0.3 ? (1.3 / v) * 1000 : 0);
      const lastPeak = g.eps[g.eps.length - 1].tPeak;
      if (e.tPeak - lastPeak < mergeGap || e.tPeak - g.end < cfg.shock_cooldown_s * 1000) {
        g.eps.push(e);
        g.end = e.tEnd;
        continue;
      }
      flush();
    }
    g = { eps: [e], end: e.tEnd };
  }
  flush();
  return shocks;
}

/** semnalul pentru replay: max-abs cu semn pe compartimente de 40 ms (25 Hz) */
export function downsampleSignal(sig: Signal, binMs = 40): { t0: number; dt: number; v: number[] } {
  const { t, bp, bad } = sig;
  const n = t.length;
  if (!n) return { t0: 0, dt: binMs, v: [] };
  const t0 = t[0];
  const nb = Math.ceil((t[n - 1] - t0) / binMs) + 1;
  const v = new Array<number>(nb).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (bad[i] === 1) continue;
    const b = Math.floor((t[i] - t0) / binMs);
    if (Number.isNaN(v[b]) || Math.abs(bp[i]) > Math.abs(v[b])) v[b] = bp[i];
  }
  return { t0, dt: binMs, v: v.map((x) => (Number.isNaN(x) ? NaN : Math.round(x * 100) / 100)) };
}

/** 6.7: VDV = (Σ a_v⁴·dt)^(1/4), neponderat */
export function vdvOf(parts: number[]): number {
  return Math.pow(parts.reduce((a, b) => a + b, 0), 0.25);
}
