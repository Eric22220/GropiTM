// Rapoartele personale și verificarea denivelărilor după tură.
// IMPORTANT: GitHub Pages + IndexedDB NU sunt o bază comună. Un raport e salvat doar pe acest dispozitiv;
// nimic din aplicație nu îl publică. Singurele date publice sunt stratul agregat aprobat de echipă (snapshot).
import type { LocalReport, ReportType } from '../storage/idb';

export const REPORT_TYPES: { id: ReportType; label: string; hint: string }[] = [
  { id: 'groapa', label: 'Groapă', hint: 'gol în asfalt' },
  { id: 'denivelare', label: 'Denivelare', hint: 'speed bump, val de asfalt' },
  { id: 'capac', label: 'Capac de canal', hint: 'denivelat sau lipsă' },
  { id: 'rost', label: 'Rost / șine', hint: 'rost de pod, șine de tramvai' },
  { id: 'asfalt', label: 'Asfalt deteriorat', hint: 'crăpat, peticit, pavaj' },
  { id: 'obstacol', label: 'Obstacol', hint: 'bordură, obiect pe pistă' },
  { id: 'alta', label: 'Altă problemă', hint: '' },
];

export const typeLabel = (t: ReportType) => REPORT_TYPES.find((x) => x.id === t)?.label ?? 'Nespecificat';

/** Unde există informația. Nu există „publicat pentru comunitate” în această versiune. */
export type Visibility = 'device' | 'published-aggregate';
export function reportVisibility(_r: LocalReport): Visibility { return 'device'; }
export const VISIBILITY_LABEL: Record<Visibility, string> = {
  device: 'Salvat doar pe acest telefon',
  'published-aggregate': 'Date agregate publicate de echipă',
};

let seq = 0;
export function newId(prefix = 'rep') { return `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`; }

export interface ReportInput {
  lat: number; lon: number; acc: number | null; type: ReportType; description?: string; photo?: Blob | null;
  source?: LocalReport['source']; shock_ref?: string; now?: number;
}

export function createReport(i: ReportInput): LocalReport {
  if (!Number.isFinite(i.lat) || !Number.isFinite(i.lon)) throw new Error('Raportul are nevoie de o poziție.');
  const now = i.now ?? Date.now();
  return {
    id: newId(), created_at: now, updated_at: now, lat: i.lat, lon: i.lon, acc: i.acc, type: i.type,
    description: (i.description ?? '').trim().slice(0, 1000), photo: i.photo ?? null, status: 'local',
    source: i.source ?? 'manual', shock_ref: i.shock_ref,
  };
}

/** „Marchează pentru mai târziu”: doar poziția și momentul, fără formular în mers */
export function quickMark(lat: number, lon: number, acc: number | null, now = Date.now()): LocalReport {
  return { ...createReport({ lat, lon, acc, type: 'nespecificat', source: 'quick', now }), status: 'draft' };
}

export function updateReport(r: LocalReport, patch: Partial<Pick<LocalReport, 'type' | 'description' | 'photo' | 'lat' | 'lon' | 'acc'>>, now = Date.now()): LocalReport {
  const next = { ...r, ...patch, updated_at: now };
  next.description = (next.description ?? '').trim().slice(0, 1000);
  next.status = next.type === 'nespecificat' ? 'draft' : 'local';
  return next;
}

export function sesizareText(r: LocalReport, street: string | null): string {
  const when = new Date(r.created_at).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
  const where = street ? `pe ${street}` : 'în Timișoara';
  return [
    `Bună ziua. Semnalez o problemă a suprafeței de rulare ${where}, la coordonatele ${r.lat.toFixed(5)}, ${r.lon.toFixed(5)} (precizie GPS ~${r.acc ? Math.round(r.acc) : '?'} m).`,
    `Tip: ${typeLabel(r.type).toLowerCase()}. Observat pe ${when}, pe bicicletă.`,
    r.description ? `Detalii: ${r.description}` : '',
    'Vă rog să verificați. Mulțumesc.',
  ].filter(Boolean).join('\n');
}

/** export local (fără fotografii) */
export function reportsGeoJSON(rs: LocalReport[]) {
  return {
    type: 'FeatureCollection',
    properties: { note: 'Rapoarte personale exportate de pe un dispozitiv. Nepublicate, neverificate.' },
    features: rs.map((r) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
      properties: { id: r.id, type: r.type, status: r.status, description: r.description, created_at: new Date(r.created_at).toISOString(), acc_m: r.acc, source: r.source, has_photo: !!r.photo },
    })),
  };
}

// ---- verificarea denivelărilor după tură ----
export type ReviewAnswer = 'yes' | 'no' | 'unsure';
export interface ShockReview { answer: ReviewAnswer; type?: ReportType; report_id?: string; at: number }

export const shockKey = (rideId: string, shockId: string) => `${rideId}:${shockId}`;

/** intensitatea relativă, pentru utilizator (fără promisiuni despre tipul obstacolului) */
export function intensity(peak: number): { level: 'mică' | 'medie' | 'mare'; pct: number } {
  const pct = Math.max(0.1, Math.min(1, (peak - 4) / 12));
  return { level: peak < 7 ? 'mică' : peak < 12 ? 'medie' : 'mare', pct };
}
