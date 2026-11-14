import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDB } from 'idb';
import { aggregate, type RideContribution } from '../src/core/aggregate';
import type { Shock } from '../src/core/types';
import { createReport, quickMark, reportVisibility, reportsGeoJSON, sesizareText, shockKey, updateReport, VISIBILITY_LABEL } from '../src/services/reports';
import * as idb from '../src/storage/idb';
import * as store from '../src/state/store';

async function freshDb() {
  await idb._resetDb();
  await new Promise<void>((res) => { const r = indexedDB.deleteDatabase('shockgrid'); r.onsuccess = () => res(); r.onerror = () => res(); r.onblocked = () => res(); });
}

describe('rapoarte: logica', () => {
  it('creare, marcaj rapid (draft), editare, text pentru Sesizări', () => {
    const r = createReport({ lat: 45.75, lon: 21.22, acc: 6, type: 'groapa', description: '  adâncă  ', now: Date.UTC(2026, 10, 14) });
    expect(r.status).toBe('local');
    expect(r.description).toBe('adâncă');
    const q = quickMark(45.75, 21.22, 5);
    expect(q.status).toBe('draft');
    expect(q.type).toBe('nespecificat');
    const done = updateReport(q, { type: 'capac', description: 'capac lăsat' });
    expect(done.status).toBe('local');
    expect(updateReport(done, { type: 'nespecificat' }).status).toBe('draft');
    const txt = sesizareText(r, 'Strada Mărășești');
    expect(txt).toContain('Strada Mărășești');
    expect(txt).toContain('groapă');
    expect(() => createReport({ lat: NaN, lon: 1, acc: null, type: 'alta' })).toThrow();
  });
  it('raport local ≠ public: niciun raport nu e marcat ca publicat', () => {
    const r = createReport({ lat: 45.75, lon: 21.22, acc: 6, type: 'groapa' });
    expect(reportVisibility(r)).toBe('device');
    expect(VISIBILITY_LABEL[reportVisibility(r)]).toMatch(/doar pe acest telefon/i);
    const gj = reportsGeoJSON([{ ...r, photo: new Blob(['x']) }]);
    expect(gj.properties.note).toMatch(/Nepublicate/);
    expect(JSON.stringify(gj)).not.toContain('Blob');
    expect(gj.features[0].properties.has_photo).toBe(true);
  });
});

describe('IndexedDB: persistență și migrare', () => {
  beforeEach(freshDb);
  it('migrarea de la v1 păstrează turele și adaugă rapoartele', async () => {
    const v1 = await openDB('shockgrid', 1, { upgrade(d) { d.createObjectStore('rides', { keyPath: 'ride_id' }); d.createObjectStore('kv'); const r = d.createObjectStore('rec', { keyPath: 'id', autoIncrement: true }); r.createIndex('session', 'session'); } });
    await v1.put('rides', { ride_id: 'r1', processed: {}, file_name: 'a.zip', file: null, included: true, imported_at: 1 });
    v1.close();
    const rides = await idb.listRides();
    expect(rides.map((r) => r.ride_id)).toEqual(['r1']);
    const rep = createReport({ lat: 45.75, lon: 21.22, acc: 5, type: 'rost' });
    await idb.putReport(rep);
    expect((await idb.listReports())[0].type).toBe('rost');
  });
  it('salvare, editare, ștergere raport (prin store), plus ștergerea tuturor datelor', async () => {
    const r = createReport({ lat: 45.75, lon: 21.22, acc: 5, type: 'groapa', photo: new Blob(['jpeg'], { type: 'image/jpeg' }) });
    await store.saveReport(r);
    expect(store.getState().reports).toHaveLength(1);
    await store.saveReport(updateReport(r, { description: 'mare' }));
    expect(store.getState().reports).toHaveLength(1);
    const stored = await idb.listReports();
    expect(stored[0].description).toBe('mare');
    expect(stored[0].photo).toBeTruthy();
    await store.removeReport(r.id);
    expect(await idb.listReports()).toHaveLength(0);
    await store.saveReport(quickMark(45.7, 21.2, 3));
    await idb.putRide({ ride_id: 'rx', processed: {} as never, file_name: 'x', file: null, included: true, imported_at: 0 });
    await store.wipeAll();
    expect(await idb.listReports()).toHaveLength(0);
    expect(await idb.listRides()).toHaveLength(0);
  });
});

const shock = (id: string, lat: number, lon: number): Shock => ({ id, t: Date.UTC(2026, 10, 14, 10), peak: 9, z: 8, double_hit: false, speed: 5, lat, lon, r: 6, flags: [], located: true, needs_review: false, edge: 3, pass: 0, snippet: { dt: 20, v: [] } });

describe('confirmarea / respingerea unei denivelări după tură', () => {
  beforeEach(freshDb);
  it('Da + tip → raport local legat de șoc; Nu → detectarea respinsă; Nu sunt sigur → rămâne neverificată', async () => {
    const s1 = shock('s1', 45.75, 21.22), s2 = shock('s2', 45.76, 21.23), s3 = shock('s3', 45.77, 21.24);
    await store.reviewShock('rideA', s1, 'yes', 'groapa');
    let st = store.getState();
    expect(st.reviews[shockKey('rideA', 's1')].answer).toBe('yes');
    const rep = st.reports.find((r) => r.shock_ref === shockKey('rideA', 's1'))!;
    expect(rep.type).toBe('groapa');
    expect(rep.source).toBe('shock');
    expect(rep.status).toBe('local');
    await store.reviewShock('rideA', s2, 'no');
    st = store.getState();
    expect(st.rejected).toContain(shockKey('rideA', 's2'));
    await store.reviewShock('rideA', s3, 'unsure');
    st = store.getState();
    expect(st.reviews[shockKey('rideA', 's3')].answer).toBe('unsure');
    expect(st.rejected).not.toContain(shockKey('rideA', 's3'));
    // răzgândire: Da → Nu șterge raportul creat
    await store.reviewShock('rideA', s1, 'no');
    expect(store.getState().reports.some((r) => r.shock_ref === shockKey('rideA', 's1'))).toBe(false);
    expect((await idb.kvGet<Record<string, unknown>>('shock-reviews'))![shockKey('rideA', 's1')]).toMatchObject({ answer: 'no' });
  });
  it('agregarea: respins → REJECTED; confirmat → numărat; costul rutei nu se schimbă (șocurile nu intră în cost)', () => {
    const c: RideContribution = { ride_id: 'rideA', source: 'shockgrid', processing_version: 'x', date: 0, windows: [], shocks: [shock('s1', 45.75, 21.22)], included_in_layer: true };
    const base = aggregate({ rides: [c] });
    expect(base.zones[0].status).toBe('CANDIDATE');
    const conf = aggregate({ rides: [c], confirmed: new Set([shockKey('rideA', 's1')]) });
    expect(conf.zones[0].confirmed).toBe(1);
    expect(conf.zones[0].status).toBe('CANDIDATE');
    expect([...conf.edges.entries()]).toEqual([...base.edges.entries()]);
    const rej = aggregate({ rides: [c], rejected: new Set([shockKey('rideA', 's1')]) });
    expect(rej.zones[0].status).toBe('REJECTED');
  });
});
