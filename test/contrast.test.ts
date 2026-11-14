// WCAG 2.1 AA verificabil: contrastul perechilor text/fundal din tokenii de design (≥ 4,5:1).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/ui/styles.css', 'utf8');
function tokens(block: string) {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2];
  return out;
}
const light = tokens(css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-color-scheme: dark)')));
const darkStart = css.indexOf('@media (prefers-color-scheme: dark)');
const dark = { ...light, ...tokens(css.slice(darkStart, css.indexOf('.leaflet-tile-pane', darkStart))) };
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const pairs: [string, string, string][] = [
  ['fg', 'bg', 'text principal'], ['fg', 'surface', 'text pe card'], ['fg-2', 'surface', 'text secundar'], ['muted', 'surface', 'text estompat'],
  ['muted', 'bg', 'text estompat pe fundal'], ['muted', 'surface-2', 'text estompat pe câmp'], ['primary', 'surface', 'link / acțiune'], ['primary', 'primary-soft', 'tab activ'],
  ['on-primary', 'primary', 'buton principal'], ['danger', 'danger-soft', 'buton pericol'], ['fg', 'warn-soft', 'banner atenționare'], ['fg', 'comfort-soft', 'banner confirmare'],
  ['warn', 'surface', 'text atenționare'], ['comfort', 'comfort-soft', 'icon/text confort'],
];

describe('contrast WCAG AA', () => {
  for (const [name, t] of [['luminos', light], ['întunecat', dark]] as const)
    for (const [f, b, what] of pairs)
      it(`${name}: ${what} (${f} pe ${b}) ≥ 4,5:1`, () => {
        expect(t[f], f).toBeTruthy();
        expect(t[b], b).toBeTruthy();
        expect(contrast(t[f], t[b])).toBeGreaterThanOrEqual(4.5);
      });
  it('butoane cu text alb: confort și raportare (luminos)', () => {
    expect(contrast('#ffffff', light.comfort)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ffffff', light.danger)).toBeGreaterThanOrEqual(4.5);
  });
});
