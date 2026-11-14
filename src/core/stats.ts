export function median(values: ArrayLike<number>): number {
  const n = values.length;
  if (n === 0) return NaN;
  const a = Float64Array.from(values as ArrayLike<number>).sort();
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
}

export function medianOrNull(values: ArrayLike<number>): number | null {
  const m = median(values);
  return Number.isFinite(m) ? m : null;
}

/** percentila p (0..100), interpolare liniară, pe valori deja sortate */
export function percentileSorted(a: ArrayLike<number>, p: number): number {
  const n = a.length;
  if (n === 0) return NaN;
  const pos = (p / 100) * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(n - 1, lo + 1);
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}

export function percentile(values: ArrayLike<number>, p: number): number {
  return percentileSorted(Float64Array.from(values as ArrayLike<number>).sort(), p);
}

/** median absolute deviation */
export function mad(values: ArrayLike<number>, med?: number): number {
  const m = med ?? median(values);
  const d = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) d[i] = Math.abs(values[i] - m);
  return median(d);
}

/** Corelația de rang Spearman */
export function spearman(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3) return NaN;
  const rank = (v: number[]) => {
    const idx = v.map((val, i) => [val, i] as [number, number]).sort((a, b) => a[0] - b[0]);
    const r = new Array<number>(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(x);
  const ry = rank(y);
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}

/** PRNG determinist (mulberry32), ca bootstrap-ul să fie reproductibil */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** hash stabil (cyrb53) → hex */
export function hashString(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}
