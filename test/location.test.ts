import { describe, expect, it } from 'vitest';
import { LocationTracker, reliableMotion, type GeoLike } from '../src/services/location';

class FakeGeo implements GeoLike {
  ok: ((p: GeolocationPosition) => void) | null = null;
  err: ((e: GeolocationPositionError) => void) | null = null;
  active = new Set<number>();
  private id = 0;
  watchPosition(ok: (p: GeolocationPosition) => void, err: (e: GeolocationPositionError) => void) {
    this.ok = ok; this.err = err;
    this.active.add(++this.id);
    return this.id;
  }
  clearWatch(id: number) { this.active.delete(id); }
  fix(lat: number, lon: number, acc = 5, speed: number | null = null, heading: number | null = null) {
    this.ok?.({ timestamp: Date.now(), coords: { latitude: lat, longitude: lon, accuracy: acc, speed, heading, altitude: null, altitudeAccuracy: null } } as unknown as GeolocationPosition);
  }
  fail(code: number) { this.err?.({ code, message: 'x' } as GeolocationPositionError); }
}

describe('urmărirea locației', () => {
  it('pornește la cerere, actualizează poziția și se oprește la ultima eliberare', () => {
    const geo = new FakeGeo();
    const tr = new LocationTracker(geo);
    const seen: string[] = [];
    tr.subscribe((s) => seen.push(s.status));
    const r1 = tr.acquire();
    const r2 = tr.acquire();
    expect(geo.active.size).toBe(1); // un singur watchPosition
    expect(tr.get().status).toBe('locating');
    geo.fix(45.75, 21.22, 8);
    expect(tr.get().status).toBe('active');
    expect(tr.get().fix).toMatchObject({ lat: 45.75, lon: 21.22, acc: 8 });
    geo.fix(45.751, 21.221, 6);
    expect(tr.get().fix!.lat).toBe(45.751);
    r1();
    expect(geo.active.size).toBe(1);
    r2();
    expect(geo.active.size).toBe(0);
    expect(tr.watching).toBe(false);
    expect(seen).toContain('active');
  });
  it('refuzul permisiunii: mesaj clar și watcher oprit', () => {
    const geo = new FakeGeo();
    const tr = new LocationTracker(geo);
    tr.acquire();
    geo.fail(1);
    expect(tr.get().status).toBe('denied');
    expect(tr.get().message).toMatch(/refuzat/);
    expect(geo.active.size).toBe(0);
  });
  it('expirare / fără semnal: păstrează ultima poziție cunoscută', () => {
    const geo = new FakeGeo();
    const tr = new LocationTracker(geo);
    tr.acquire();
    geo.fix(45.75, 21.22);
    geo.fail(3);
    expect(tr.get().status).toBe('timeout');
    expect(tr.get().fix).not.toBeNull();
    geo.fail(2);
    expect(tr.get().status).toBe('unavailable');
  });
  it('context nesecurizat și browser fără geolocație', () => {
    const a = new LocationTracker(new FakeGeo(), false);
    a.acquire();
    expect(a.get().status).toBe('insecure');
    const b = new LocationTracker(null);
    b.acquire();
    expect(b.get().status).toBe('unsupported');
  });
  it('viteza și direcția doar când sunt credibile', () => {
    expect(reliableMotion({ lat: 0, lon: 0, acc: 5, speed: 5, heading: 90, t: 0 })).toEqual({ speed: 5, heading: 90 });
    expect(reliableMotion({ lat: 0, lon: 0, acc: 40, speed: 5, heading: 90, t: 0 })).toEqual({ speed: null, heading: null });
    expect(reliableMotion({ lat: 0, lon: 0, acc: 5, speed: 0.2, heading: 90, t: 0 }).speed).toBeNull();
    expect(reliableMotion(null).speed).toBeNull();
  });
});
