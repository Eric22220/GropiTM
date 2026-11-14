// npm run build-layer -- rides/*.zip [--note "iPhone 14 · bicicletă oraș · suport X"]
// Produce stratul publicat (snapshot) în public/data/: comfort-layer.json/.geojson, shock-zones.json/.geojson.
// Fără timpi individuali, fără ID-uri de dispozitiv, fără primii/ultimii 200 m ai fiecărei ture. Licență ODbL.
import { writeFileSync, mkdirSync } from 'node:fs';
import { aggregate, buildSnapshot, diffLayers, toContribution, type Thresholds } from '../src/core/aggregate';
import { DEFAULT_CONFIG } from '../src/core/config';
import { comfortGeoJSON, zoneRows, zonesGeoJSON } from '../src/core/export';
import { percentileSorted } from '../src/core/stats';
import { loadGraphIfExists } from './lib';
import { expandArgs, loadRides } from './rides';

const args = process.argv.slice(2);
const noteIdx = args.indexOf('--note');
const note = noteIdx >= 0 ? args[noteIdx + 1] : '';
const files = expandArgs(args.filter((a, i) => !a.startsWith('--') && (noteIdx < 0 || i !== noteIdx + 1)));
const graph = loadGraphIfExists();
if (!graph) { console.error('Lipsește public/data/graph-timisoara.json (rulează build-graph).'); process.exit(1); }
const rides = loadRides(files.length ? files : expandArgs(['rides']), graph);
if (!rides.length) { console.error('Nicio tură. Copiază exporturile în rides/ și rulează: npm run build-layer -- rides/*.zip'); process.exit(1); }

// pragurile = percentilele 20/40/60/80 ale ferestrelor valide ale echipei (calibrare) [EXPERIMENTAL]
const all = rides.flatMap((r) => r.p.windows.filter((w) => w.valid).map((w) => w.rms)).sort((a, b) => a - b);
const thresholds: Thresholds | null = all.length >= 30 ? ([20, 40, 60, 80].map((q) => Math.round(percentileSorted(all, q) * 1000) / 1000) as Thresholds) : null;
const thSrc = thresholds ? `percentilele 20/40/60/80 din ${all.length} ferestre valide (${rides.length} ture)` : 'implicite (prea puține ferestre)';
const devices = [...new Set(rides.map((r) => r.p.meta.device).filter(Boolean))].join(', ');
const snap = buildSnapshot(rides.map((r) => r.p), DEFAULT_CONFIG, note || `telefoane: ${devices || 'necunoscut'}`, thresholds, thSrc);

// diferența înainte/după pentru fiecare tură (pentru PROGRESS.md)
const kind = (e: number) => graph.kind[e] ?? null;
let prev = aggregate({ rides: [], fixedThresholds: thresholds, surfaceKindOf: kind, version: 0 });
const contribs = rides.map((r) => toContribution(r.p));
console.log('\nDiferența înainte/după, pe ture (ordinea fișierelor):');
contribs.forEach((c, i) => {
  const next = aggregate({ rides: contribs.slice(0, i + 1), fixedThresholds: thresholds, surfaceKindOf: kind, version: i + 1 });
  const d = diffLayers(prev, next, (e) => graph.length[e]);
  console.log(`- ${rides[i].name}: km ${d.km_before.toFixed(2)} → ${d.km_after.toFixed(2)}, muchii noi acoperite ${d.new_covered}, MEASURED noi ${d.new_measured}, stare schimbată ${d.status_changed.length}, clasă schimbată ${d.class_changed.length}, treceri +${d.passes_added}, zone ${d.zones_before} → ${d.zones_after}`);
  prev = next;
});

const layer = aggregate({ snapshot: snap, rides: [], surfaceKindOf: kind, version: 1 });
mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/comfort-layer.json', JSON.stringify(snap));
writeFileSync('public/data/comfort-layer.geojson', JSON.stringify(comfortGeoJSON(layer, graph)));
writeFileSync('public/data/shock-zones.json', JSON.stringify({ meta: { license: 'ODbL-1.0', attribution: '© OpenStreetMap contributors', processing_version: DEFAULT_CONFIG.processing_version }, zones: zoneRows(layer) }));
writeFileSync('public/data/shock-zones.geojson', JSON.stringify(zonesGeoJSON(layer)));
const st = [...layer.edges.values()];
console.log(`\nSnapshot: ${rides.length} ture, ${snap.edges.length} muchii (${st.filter((e) => e.status === 'MEASURED').length} MEASURED, ${st.filter((e) => e.status === 'LOW_CONFIDENCE').length} LOW_CONFIDENCE), ${layer.zones.length} zone cu șoc.`);
console.log(`Praguri: ${JSON.stringify(thresholds)} (${thSrc})`);
console.log('Scris: public/data/comfort-layer.json, comfort-layer.geojson, shock-zones.json, shock-zones.geojson');
