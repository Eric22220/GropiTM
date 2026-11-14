import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { colIndex, num, numOrNull, parseCsv } from '../src/core/io/csv';
import { parseRideFile } from '../src/core/io';
import { parseLegacy, LEGACY_LABEL } from '../src/core/io/legacy';
import { detectUnit, parseSensorLogger } from '../src/core/io/sensorlogger';
import { unzipFlat } from '../src/core/io/zip';
import { buildShockGridZip, parseShockGrid } from '../src/core/io/shockgrid';
import { nsStringToMs } from '../src/core/time';
import { processRide } from '../src/core/process';
import { SAMPLE_ANDROID, SAMPLE_IOS, hasFile, readBytes } from './helpers';

describe('CSV', () => {
  it('elimină BOM, citește după nume, gol → null', () => {
    const t = parseCsv('﻿time,b,a\n1,,3\n2,5,\n');
    expect(t.header).toEqual(['time', 'b', 'a']);
    expect(num(t.rows[0], colIndex(t, 'a'))).toBe(3);
    expect(numOrNull(t.rows[0], colIndex(t, 'b'))).toBeNull();
    expect(numOrNull(t.rows[1], colIndex(t, 'a'))).toBeNull();
    expect(colIndex(t, 'lipsă')).toBe(-1);
    expect(Number.isNaN(num(t.rows[0], -1))).toBe(true);
  });
  it('câmpuri între ghilimele', () => {
    const t = parseCsv('a,b\n"x, y","z ""q"""\n');
    expect(t.rows[0]).toEqual(['x, y', 'z "q"']);
  });
});

describe('timp ns epoch', () => {
  it('nu pierde precizia peste 2^53', () => {
    expect(nsStringToMs('1794612229287261400')).toBeCloseTo(1794612229287.2614, 3);
    expect(nsStringToMs('1794612229297245400') - nsStringToMs('1794612229287261400')).toBeCloseTo(9.984, 3);
    expect(Number.isNaN(nsStringToMs(''))).toBe(true);
  });
});

describe('detecția unității', () => {
  it('g, m/s² și eroare explicită', () => {
    expect(detectUnit(1.0)).toBe('g');
    expect(detectUnit(9.85)).toBe('m/s2');
    expect(() => detectUnit(3.2)).toThrow(/Unitatea/);
  });
});

describe('Sensor Logger sintetic: fișiere goale, -1 → null, coloane în altă ordine', () => {
  it('parsează', () => {
    const acc = ['time,seconds_elapsed,z,y,x'];
    for (let i = 0; i < 300; i++) acc.push(`${1800000000000000000n + BigInt(i) * 10000000n},${i / 100},1.0,0.01,0.0`);
    const loc = 'time,seconds_elapsed,longitude,latitude,speed,bearing,horizontalAccuracy,speedAccuracy,bearingAccuracy,altitude\n1800000000000000000,0,21.22,45.75,-1,-1,5,-1,-1,90\n';
    const zip = zipSync({
      'rec/AccelerometerUncalibrated.csv': strToU8(acc.join('\n')),
      'rec/Accelerometer.csv': new Uint8Array(0),
      'rec/Gyroscope.csv': new Uint8Array(0),
      'rec/Location.csv': strToU8(loc),
      'rec/Metadata.csv': strToU8('version,device name,recording epoch time,platform,device id\n3,Test,1800000000000,ios,abc\n'),
    });
    const r = parseSensorLogger(unzipFlat(zip));
    expect(r.meta.unit_detected).toBe('g');
    expect(r.motion.z[0]).toBeCloseTo(9.80665, 3);
    expect(r.gps[0].speed).toBeNull();
    expect(r.gps[0].heading).toBeNull();
    expect(r.gps[0].acc).toBe(5);
    expect(r.gyro).toBeNull();
    expect(r.meta.ride_key).toContain('abc');
  });
});

describe.skipIf(!hasFile(SAMPLE_IOS))('ZIP64 din Sensor Logger', () => {
  it('dimensiunile vin din câmpul extra ZIP64, nu din 0xFFFFFFFF', async () => {
    const { listZip } = await import('../src/core/io/zip');
    const entries = listZip(readBytes(SAMPLE_IOS));
    const meta = entries.find((e) => e.name.endsWith('Metadata.csv'))!;
    expect(meta.usize).toBe(400);
    expect(entries.every((e) => e.usize < 1e8 && e.csize < 1e8)).toBe(true);
    const files = unzipFlat(readBytes(SAMPLE_IOS));
    expect(files['Metadata.csv'].length).toBe(400);
    expect(files['Accelerometer.csv'].length).toBe(0);
  });
});

describe.skipIf(!hasFile(SAMPLE_IOS))('export real Sensor Logger iPhone 14', () => {
  it('100 Hz, 0 goluri, 237 fixuri, unitate g, gravitație ~9,81', () => {
    const raw = parseRideFile('iphone.zip', readBytes(SAMPLE_IOS));
    expect(raw.meta.platform).toBe('ios');
    expect(raw.meta.unit_detected).toBe('g');
    expect(raw.meta.accel_file).toBe('AccelerometerUncalibrated.csv');
    expect(raw.meta.gyro_file).toBe('GyroscopeUncalibrated.csv');
    const p = processRide(raw);
    expect(p.summary.fs_median).toBeGreaterThan(98);
    expect(p.summary.fs_median).toBeLessThan(102);
    expect(p.summary.gaps_100ms).toBe(0);
    expect(p.summary.n_fix).toBe(237);
    expect(p.summary.gravity_median!).toBeGreaterThan(9.7);
    expect(p.summary.gravity_median!).toBeLessThan(9.9);
    // test staționar: nicio fereastră validă pentru RVI
    expect(p.summary.n_windows_valid).toBe(0);
  });
});

describe.skipIf(!hasFile(SAMPLE_ANDROID))('export real Sensor Logger Samsung', () => {
  it('Android, m/s², ~58,5 Hz, TotalAcceleration, gravitație ~9,8', () => {
    const raw = parseRideFile('samsung.zip', readBytes(SAMPLE_ANDROID));
    expect(raw.meta.platform).toBe('android');
    expect(raw.meta.unit_detected).toBe('m/s2');
    expect(raw.meta.accel_file).toBe('TotalAcceleration.csv');
    expect(raw.meta.gyro_file).toBe('Gyroscope.csv');
    const p = processRide(raw);
    expect(p.summary.fs_median).toBeGreaterThan(55);
    expect(p.summary.fs_median).toBeLessThan(62);
    expect(p.summary.n_fix).toBeGreaterThan(60);
    expect(p.summary.gravity_median!).toBeGreaterThan(9.6);
    expect(p.summary.gravity_median!).toBeLessThan(10);
    expect(p.summary.distance_m).toBeLessThan(20);
  });
});

describe('format vechi și refuzuri', () => {
  it('BikeGuard: orientation_aware=false și eticheta de test', () => {
    const rows = ['﻿type,utc,elapsed_ms,x,y,z,method,magnitude,shock_signal,rot_alpha,rot_beta,rot_gamma,latitude,longitude,accuracy_m,gps_age_ms'];
    for (let i = 0; i < 100; i++) rows.push(`motion,${new Date(1.8e12 + i * 17).toISOString()},${i * 17},0.1,0.2,0.3,m,0.4,0,1,2,3,,,,`);
    const r = parseLegacy([strToU8(rows.join('\n'))]);
    expect(r.meta.orientation_aware).toBe(false);
    expect(r.meta.label).toBe(LEGACY_LABEL);
    expect(r.motion.t.length).toBe(100);
  });
  it('.xlsx refuzat cu mesaj clar', () => {
    expect(() => parseRideFile('tura.xlsx', new Uint8Array([1, 2, 3]))).toThrow(/Excel/);
    const fakeXlsx = zipSync({ '[Content_Types].xml': strToU8('<x/>'), 'xl/workbook.xml': strToU8('<x/>') });
    expect(() => parseRideFile('tura.zip', fakeXlsx)).toThrow(/Excel/);
  });
});

describe('export ShockGrid (7.1)', () => {
  it('dus-întors ZIP', () => {
    const motion = Array.from({ length: 200 }, (_, i) => ({ t: 1.8e12 + i * 16.7, interval: 16, agx: 0.1, agy: 9.8, agz: 0.2, ax: null, ay: null, az: null, ra: 1, rb: 2, rg: null }));
    const zip = buildShockGridZip({ meta: { ride_uuid: 'x1', label: 'test' }, motion, gps: [{ fix_t: 1.8e12, recv_t: 1.8e12, lat: 45.75, lon: 21.22, acc: 4, alt: null, alt_acc: null, speed: null, heading: null }], events: [{ t: 1.8e12, type: 'ride_start' }] });
    const r = parseShockGrid(unzipFlat(zip));
    expect(r.meta.source).toBe('shockgrid');
    expect(r.motion.t.length).toBe(200);
    expect(r.gps[0].speed).toBeNull();
    expect(r.gyro).toBeNull(); // rg lipsă
    expect(r.events[0].type).toBe('ride_start');
  });
  it('tură doar cu GPS (fără senzori de mișcare): se importă, fără confort', () => {
    const gps = Array.from({ length: 60 }, (_, i) => ({ fix_t: 1.8e12 + i * 1000, recv_t: 1.8e12 + i * 1000, lat: 45.75 + i * 4.5e-5, lon: 21.22, acc: 5, alt: null, alt_acc: null, speed: 5, heading: 0 }));
    const zip = buildShockGridZip({ meta: { ride_uuid: 'gps-only' }, motion: [], gps, events: [] });
    const r = parseShockGrid(unzipFlat(zip));
    expect(r.motion.t.length).toBe(0);
    expect(r.meta.warnings[0]).toMatch(/doar traseul GPS/);
    const p = processRide(r);
    expect(p.windows).toHaveLength(0);
    expect(p.summary.distance_m).toBeGreaterThan(250);
    expect(p.track.length).toBe(60);
    expect(() => parseShockGrid(unzipFlat(buildShockGridZip({ meta: {}, motion: [], gps: [], events: [] })))).toThrow(/nici date de mișcare, nici GPS/);
  });
});
