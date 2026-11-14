/** Butterworth trece-sus de ordin 2 (biquad RBJ, Q = 1/√2), formă directă II transpusă. */
export class HighPassBiquad {
  private b0 = 1; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0;
  private z1 = 0; private z2 = 0;
  fs = 0;
  constructor(readonly f0: number, fs: number) {
    this.setFs(fs);
  }
  setFs(fs: number) {
    this.fs = fs;
    const f = Math.min(this.f0, fs * 0.45);
    const w0 = (2 * Math.PI * f) / fs;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
    const a0 = 1 + alpha;
    this.b0 = (1 + cos) / 2 / a0;
    this.b1 = -(1 + cos) / a0;
    this.b2 = (1 + cos) / 2 / a0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
  }
  reset(x0 = 0) {
    // stare de regim pentru intrare constantă x0 cu ieșire 0 (b0 + b1 + b2 = 0 la trece-sus)
    this.z2 = this.b2 * x0;
    this.z1 = this.b1 * x0 + this.z2;
  }
  step(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
  /** câștigul teoretic la frecvența f (pentru teste) */
  gainAt(f: number): number {
    const w = (2 * Math.PI * f) / this.fs;
    const re = (k0: number, k1: number, k2: number) => k0 + k1 * Math.cos(-w) + k2 * Math.cos(-2 * w);
    const im = (k1: number, k2: number) => k1 * Math.sin(-w) + k2 * Math.sin(-2 * w);
    const nr = re(this.b0, this.b1, this.b2), ni = im(this.b1, this.b2);
    const dr = re(1, this.a1, this.a2), di = im(this.a1, this.a2);
    return Math.hypot(nr, ni) / Math.hypot(dr, di);
  }
}
