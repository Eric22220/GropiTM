/**
 * Sensor Logger scrie `time` în nanosecunde epoch (ex. 1794612229287261400), peste 2^53:
 * conversia prin Number() pierde precizie. Separăm partea de milisecunde din șir.
 */
export function nsStringToMs(s: string | undefined): number {
  if (s === undefined) return NaN;
  const v = s.trim();
  if (v === '') return NaN;
  if (/[.eE]/.test(v)) return Number(v) / 1e6;
  const neg = v[0] === '-';
  const digits = neg ? v.slice(1) : v;
  if (!/^\d+$/.test(digits)) return NaN;
  let ms: number;
  if (digits.length <= 6) ms = Number(digits) / 1e6;
  else ms = Number(digits.slice(0, -6)) + Number(digits.slice(-6)) / 1e6;
  return neg ? -ms : ms;
}
