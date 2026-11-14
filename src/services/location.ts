// Locația live (Geolocation API): un singur watchPosition, pornit doar cât timp cineva îl folosește.
// Nimic nu se trimite pe server.
export type LocStatus = 'idle' | 'locating' | 'active' | 'denied' | 'unavailable' | 'timeout' | 'unsupported' | 'insecure';

export interface Fix {
  lat: number;
  lon: number;
  acc: number;
  speed: number | null; // m/s
  heading: number | null; // grade
  t: number;
}

export interface LocState {
  status: LocStatus;
  fix: Fix | null;
  message: string | null;
}

export interface GeoLike {
  watchPosition(ok: (p: GeolocationPosition) => void, err: (e: GeolocationPositionError) => void, o?: PositionOptions): number;
  clearWatch(id: number): void;
}

export const LOC_MESSAGES: Record<LocStatus, string | null> = {
  idle: null,
  locating: 'Se caută semnalul GPS…',
  active: null,
  denied: 'Accesul la locație e refuzat. Îl poți permite din setările browserului (pe iPhone: Setări › Confidențialitate › Servicii de localizare › Site-uri Safari).',
  unavailable: 'Locația nu e disponibilă acum (fără semnal GPS?).',
  timeout: 'GPS-ul nu a răspuns la timp. Încearcă afară sau mai așteaptă.',
  unsupported: 'Browserul nu oferă locația.',
  insecure: 'Locația merge doar pe HTTPS.',
};

/** viteza și direcția se afișează doar când sunt credibile */
export function reliableMotion(f: Fix | null): { speed: number | null; heading: number | null } {
  if (!f || f.acc > 25 || f.speed === null || !Number.isFinite(f.speed) || f.speed < 0.8) return { speed: null, heading: null };
  return { speed: f.speed, heading: f.heading !== null && Number.isFinite(f.heading) ? f.heading : null };
}

export class LocationTracker {
  private state: LocState = { status: 'idle', fix: null, message: null };
  private listeners = new Set<(s: LocState) => void>();
  private users = 0;
  private watchId: number | null = null;
  constructor(private geo: GeoLike | null, private secure = true) {}

  get(): LocState { return this.state; }
  get watching(): boolean { return this.watchId !== null; }

  subscribe(l: (s: LocState) => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private set(p: Partial<LocState>) {
    this.state = { ...this.state, ...p };
    this.listeners.forEach((l) => l(this.state));
  }

  /** cere locația; întoarce o funcție care eliberează cererea (watcher-ul se oprește la ultima eliberare) */
  acquire(): () => void {
    this.users++;
    this.start();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.users = Math.max(0, this.users - 1);
      if (this.users === 0) this.stop();
    };
  }

  private start() {
    if (this.watchId !== null) return;
    if (!this.secure) return this.set({ status: 'insecure', message: LOC_MESSAGES.insecure });
    if (!this.geo) return this.set({ status: 'unsupported', message: LOC_MESSAGES.unsupported });
    if (this.state.status !== 'active') this.set({ status: 'locating', message: LOC_MESSAGES.locating });
    this.watchId = this.geo.watchPosition(
      (p) => {
        const c = p.coords;
        const n = (v: number | null) => (v === null || Number.isNaN(v) ? null : v);
        this.set({ status: 'active', message: null, fix: { lat: c.latitude, lon: c.longitude, acc: c.accuracy, speed: n(c.speed), heading: n(c.heading), t: p.timestamp } });
      },
      (e) => {
        const status: LocStatus = e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'unavailable';
        // la expirare/fără semnal păstrăm ultima poziție cunoscută
        this.set({ status, message: LOC_MESSAGES[status] });
        if (status === 'denied') this.stop();
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
  }

  stop() {
    if (this.watchId !== null && this.geo) this.geo.clearWatch(this.watchId);
    this.watchId = null;
    if (this.state.status === 'active' || this.state.status === 'locating') this.set({ status: 'idle', message: null });
  }
}

export const tracker = new LocationTracker(
  typeof navigator !== 'undefined' && 'geolocation' in navigator ? navigator.geolocation : null,
  typeof window === 'undefined' ? true : window.isSecureContext,
);

/** starea permisiunii, fără a o cere (unde browserul o expune) */
export async function locationPermission(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
  try {
    const s = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    return (s?.state as 'granted' | 'denied' | 'prompt') ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
