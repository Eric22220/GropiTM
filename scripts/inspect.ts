// npm run inspect -- <ride.zip> [alt.zip ...]
// Rezumatul unei ture: durată, mostre, frecvență, goluri, GPS, distanță (acceptă Sensor Logger, ShockGrid, format vechi).
import { readFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { parseRideFile } from '../src/core/io';
import { processRide } from '../src/core/process';
import { loadGraphIfExists } from './lib';

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!files.length) {
  console.error('Utilizare: npm run inspect -- <tura.zip> [...]');
  process.exit(1);
}
const graph = loadGraphIfExists();
for (const f of files) {
  if (!existsSync(f)) { console.error(`Nu există: ${f}`); continue; }
  try {
    const raw = parseRideFile(basename(f), new Uint8Array(readFileSync(f)));
    const p = processRide(raw, { graph });
    const s = p.summary;
    const fmt = (v: number | null, d = 1) => (v === null || !Number.isFinite(v) ? 'necunoscut' : v.toFixed(d));
    console.log(`\n=== ${basename(f)} ===`);
    console.log(`sursă: ${raw.meta.source}  platformă: ${s.platform ?? '?'}  dispozitiv: ${raw.meta.device ?? '?'}  unitate detectată: ${s.unit ?? '?'}`);
    console.log(`fișier accelerație: ${s.accel_file ?? '?'}  giroscop: ${s.gyro_file ?? 'absent'}`);
    console.log(`durată: ${fmt(s.duration_s)} s   mostre: ${s.n_motion}   frecvență mediană: ${fmt(s.fs_median)} Hz`);
    console.log(`goluri > 100 ms: ${s.gaps_100ms}   golul maxim: ${fmt(s.max_gap_ms, 0)} ms   mostre giroscop: ${s.n_gyro}`);
    console.log(`fixuri GPS: ${s.n_fix}   (${fmt(s.gps_rate_hz, 2)} Hz)   precizie mediană: ${fmt(s.acc_median)} m   fixuri cu precizie ≤ 20 m: ${s.n_fix_le20}`);
    console.log(`distanță: ${fmt(s.distance_m)} m (metoda: ${s.distance_method})   viteză mediană (≥0,5 m/s): ${fmt(s.speed_median, 2)} m/s`);
    console.log(`gravitație estimată (mediana |g|): ${fmt(s.gravity_median, 3)} m/s²`);
    console.log(`ferestre: ${s.n_windows}, valide: ${s.n_windows_valid}; motive: ${JSON.stringify(s.reasons)}`);
    console.log(`șocuri candidate: ${s.n_shocks}  (de verificat: ${p.shocks.filter((x) => x.needs_review).length})`);
    console.log(`map-matching: ${p.match.graph_available ? `${p.match.fixes_matched}/${p.match.fixes_used} fixuri, ${p.match.windows_matched}/${p.match.windows_with_pos} ferestre, ambigue ${p.match.windows_ambiguous}` : 'graful nu e disponibil'}`);
    if (raw.meta.warnings.length) console.log(`avertismente: ${raw.meta.warnings.join(' | ')}`);
  } catch (e) {
    console.error(`EROARE ${basename(f)}: ${(e as Error).message}`);
    process.exitCode = 1;
  }
}
