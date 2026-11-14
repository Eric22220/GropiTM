// Compatibilitatea cu GitHub Pages: subcalea /ShockGrid/, manifest PWA, rutare cu hash (fără 404 la refresh).
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

describe('GitHub Pages', () => {
  const cfg = readFileSync('vite.config.ts', 'utf8');
  it('base, scope și start_url pe subcalea repo-ului', () => {
    expect(cfg).toContain("const BASE = '/ShockGrid/'");
    expect(cfg).toMatch(/scope: BASE/);
    expect(cfg).toMatch(/start_url: BASE/);
  });
  it('rutarea folosește hash (#/...), nu History API', () => {
    const app = readFileSync('src/ui/App.tsx', 'utf8');
    expect(app).toContain('location.hash');
    expect(app).not.toMatch(/pushState|BrowserRouter/);
  });
  it('datele se încarcă relativ la BASE_URL, nu de la rădăcina domeniului', () => {
    const st = readFileSync('src/state/store.ts', 'utf8');
    expect(st).toMatch(/\$\{BASE\}data\/graph-timisoara\.json/);
    expect(st).not.toMatch(/fetch\(['"]\/data/);
  });
  it('nicio dată privată în public/ (fără exporturi brute Sensor Logger)', () => {
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
    const files = walk('public');
    expect(files.some((f) => /\.zip$|Location\.csv|AccelerometerUncalibrated/i.test(f))).toBe(false);
    const snap = JSON.parse(readFileSync('public/data/comfort-layer.json', 'utf8'));
    expect(JSON.stringify(snap)).not.toMatch(/device id|recording epoch/i);
  });
  it.skipIf(!existsSync('dist/index.html'))('build-ul referă resursele sub /ShockGrid/', () => {
    const html = readFileSync('dist/index.html', 'utf8');
    const srcs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !u.startsWith('http') && !u.startsWith('data:'));
    expect(srcs.length).toBeGreaterThan(0);
    for (const u of srcs) expect(u.startsWith('/ShockGrid/') || !u.startsWith('/')).toBe(true);
    const man = JSON.parse(readFileSync('dist/manifest.webmanifest', 'utf8'));
    expect(man.scope).toBe('/ShockGrid/');
    expect(man.start_url).toBe('/ShockGrid/');
  });
});
