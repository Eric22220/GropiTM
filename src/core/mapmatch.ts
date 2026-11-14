// Map-matching simplu și verificabil (8.2).
import type { VibrationConfig } from './config';
import { axialDiff, type Candidate, type Graph } from './graph';
import type { DeclaredSurface, GpsFix, VibWindow } from './types';

export interface FixMatch {
  edge: Int32Array; // −1 = nepotrivit
  amb: Uint8Array;
  used: number;
  matched: number;
  jumps: number;
}

export function matchFixes(fixes: GpsFix[], graph: Graph, cfg: VibrationConfig, declared: DeclaredSurface = null): FixMatch {
  const n = fixes.length;
  const edge = new Int32Array(n).fill(-1);
  const amb = new Uint8Array(n);
  let prev = -1, prevT = -Infinity;
  let used = 0, matched = 0, jumps = 0;
  let pendingJump: { edge: number; count: number } | null = null;
  for (let i = 0; i < n; i++) {
    const f = fixes[i];
    if (f.acc === null || f.acc > cfg.mm_max_acc) continue;
    used++;
    const r = Math.max(cfg.mm_min_radius, f.acc);
    const cands = graph.query(f.lat, f.lon, r);
    if (!cands.length) continue;
    const moving = f.speed !== null && f.speed > 1.5 && f.heading !== null;
    const cost = (c: Candidate) => {
      let k = c.dist;
      if (moving && axialDiff(f.heading!, c.bearing) > 45) k += cfg.mm_heading_penalty;
      if (prev >= 0 && !graph.adjacent(prev, c.edge)) k += cfg.mm_adjacent_penalty;
      return k;
    };
    let pool = cands;
    // ambiguitate carosabil / trotuar / pistă
    const nearest = cands[0];
    const ambThr = Math.max(3, f.acc / 2);
    const rivals = cands.filter(
      (c) => c.edge !== nearest.edge && graph.kind[c.edge] !== graph.kind[nearest.edge] &&
        axialDiff(c.bearing, nearest.bearing) < 20 && Math.abs(c.dist - nearest.dist) < ambThr,
    );
    let isAmb = rivals.length > 0;
    if (isAmb && declared && declared !== 'mixt') {
      const ofKind = [nearest, ...rivals].filter((c) => graph.kind[c.edge] === declared);
      if (ofKind.length) { pool = ofKind; isAmb = false; }
    }
    let best = pool[0], bc = Infinity;
    for (const c of pool) { const k = cost(c); if (k < bc) { bc = k; best = c; } }
    // salt imposibil: muchie îndepărtată la < 3 s după precedenta
    if (prev >= 0 && f.t - prevT < 3000 && !graph.near(prev, best.edge, 2)) {
      jumps++;
      if (pendingJump && pendingJump.edge === best.edge) pendingJump.count++;
      else if (pendingJump && graph.near(pendingJump.edge, best.edge, 2)) { pendingJump = { edge: best.edge, count: pendingJump.count + 1 }; }
      else pendingJump = { edge: best.edge, count: 1 };
      if (pendingJump.count < 3) continue; // ignorat, până se confirmă
    }
    pendingJump = null;
    edge[i] = best.edge;
    amb[i] = isAmb && (nearest.edge === best.edge || [nearest, ...rivals].some((c) => c.edge === best.edge)) ? 1 : 0;
    prev = best.edge;
    prevT = f.t;
    matched++;
  }
  return { edge, amb, used, matched, jumps };
}

/** Fiecare fereastră primește muchia pe care stă cea mai mare parte a ei (vot pe fixurile din fereastră ±0,5 s). */
export function assignWindows(windows: VibWindow[], fixes: GpsFix[], m: FixMatch): void {
  let j = 0;
  for (const w of windows) {
    const a = w.t0 - 500, b = w.t1 + 500;
    while (j < fixes.length && fixes[j].t < a) j++;
    const votes = new Map<number, { n: number; amb: number; d: number }>();
    const tc = (w.t0 + w.t1) / 2;
    for (let k = j; k < fixes.length && fixes[k].t <= b; k++) {
      const e = m.edge[k];
      if (e < 0) continue;
      const v = votes.get(e) ?? { n: 0, amb: 0, d: Infinity };
      v.n++;
      v.amb += m.amb[k];
      v.d = Math.min(v.d, Math.abs(fixes[k].t - tc));
      votes.set(e, v);
    }
    let best = -1, bv: { n: number; amb: number; d: number } | null = null;
    for (const [e, v] of votes) if (!bv || v.n > bv.n || (v.n === bv.n && v.d < bv.d)) { best = e; bv = v; }
    w.edge = best;
    w.amb = !!bv && bv.amb > 0;
  }
}

/** Trecerile distincte: intrări separate pe muchie la > pass_gap_s distanță */
export function assignPasses(windows: VibWindow[], gapS: number): void {
  const last = new Map<number, { t: number; pass: number }>();
  for (const w of [...windows].sort((a, b) => a.t0 - b.t0)) {
    if (w.edge < 0) { w.pass = -1; continue; }
    const l = last.get(w.edge);
    let p = 0;
    if (l) p = w.t0 - l.t > gapS * 1000 ? l.pass + 1 : l.pass;
    w.pass = p;
    last.set(w.edge, { t: w.t1, pass: p });
  }
}
