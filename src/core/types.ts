// Modelul intern comun pentru toate sursele (Sensor Logger, export ShockGrid, format vechi).
// Timpul e mereu în milisecunde epoch (number). Valorile necunoscute sunt null, nu 0.

export type RideSource = 'sensorlogger' | 'shockgrid' | 'legacy';
export type SurfaceKind = 'carosabil' | 'pista' | 'trotuar' | 'alee';
export type DeclaredSurface = SurfaceKind | 'mixt' | null;

export interface GpsFix {
  t: number; // ms epoch (timpul fixului)
  lat: number;
  lon: number;
  acc: number | null; // precizie orizontală, m
  alt: number | null;
  speed: number | null; // m/s; lipsă = necunoscut
  heading: number | null; // grade față de nord
  speedAcc: number | null;
}

export interface RideEvent {
  t: number;
  type: string;
  detail?: string;
}

export interface MotionData {
  t: Float64Array; // ms epoch
  x: Float32Array; // m/s²
  y: Float32Array;
  z: Float32Array;
  /** true = accelerație cu gravitație (orientation_aware); false = doar `acceleration` (format vechi) */
  withGravity: boolean;
}

export interface GyroData {
  t: Float64Array;
  mag: Float32Array; // modulul vitezei unghiulare, °/s
}

export interface RideMeta {
  source: RideSource;
  /** cheia din care se calculează ride_id (pentru Sensor Logger: device id + recording epoch time) */
  ride_key: string;
  label?: string;
  device?: string;
  platform?: string;
  app_version?: string;
  recording_time?: string;
  timezone?: string;
  start_ms: number;
  stop_ms: number;
  unit_detected?: 'g' | 'm/s2';
  accel_file?: string;
  gyro_file?: string;
  orientation_aware: boolean;
  motion_clock?: string;
  bike?: string;
  mount?: string;
  declared_surface?: DeclaredSurface;
  warnings: string[];
  extra: Record<string, string>;
}

export interface RawRide {
  meta: RideMeta;
  motion: MotionData;
  gyro: GyroData | null;
  gps: GpsFix[];
  events: RideEvent[];
}

export type WindowReason =
  | 'ok'
  | 'gap'
  | 'hidden'
  | 'low_fs'
  | 'settling'
  | 'no_gps'
  | 'speed_unknown'
  | 'speed_low'
  | 'speed_high'
  | 'gyro'
  | 'mount_shift';

export interface VibWindow {
  t0: number;
  t1: number;
  lat: number | null;
  lon: number | null;
  r: number | null; // raza de incertitudine, m
  acc: number | null; // precizia GPS la fereastră
  speed: number | null;
  rms: number; // rms_v, m/s²
  vdv: number; // Σ a_v⁴·dt
  p95: number;
  gyro: number | null;
  fs: number;
  valid: boolean;
  reason: WindowReason;
  dist: number; // distanța cumulată la centrul ferestrei, m
  edge: number; // -1 = nepotrivită
  amb: boolean; // ambiguitate carosabil/trotuar/pistă
  pass: number; // indexul trecerii pe muchie, în cadrul turei (-1 dacă nu are muchie)
}

export type ShockFlag = 'speed_unknown' | 'speed_band' | 'gyro' | 'mount_shift' | 'gap';

export interface Shock {
  id: string;
  t: number;
  peak: number; // m/s²
  z: number;
  double_hit: boolean;
  speed: number | null;
  lat: number | null;
  lon: number | null;
  r: number | null;
  flags: ShockFlag[];
  located: boolean;
  needs_review: boolean;
  edge: number;
  pass: number;
  /** ±3 s din semnalul filtrat, subeșantionat */
  snippet: { dt: number; v: number[] };
}

export interface RideSummary {
  duration_s: number;
  n_motion: number;
  fs_median: number;
  gaps_100ms: number;
  max_gap_ms: number;
  n_gyro: number;
  n_fix: number;
  gps_rate_hz: number;
  acc_median: number | null;
  n_fix_le20: number;
  distance_m: number;
  distance_method: 'speed' | 'positions' | 'none';
  gravity_median: number | null;
  platform: string | null;
  unit: string | null;
  accel_file: string | null;
  gyro_file: string | null;
  n_windows: number;
  n_windows_valid: number;
  reasons: Record<string, number>;
  n_shocks: number;
  speed_median: number | null;
}

export interface MatchStats {
  graph_available: boolean;
  fixes_total: number;
  fixes_used: number;
  fixes_matched: number;
  jumps: number;
  windows_with_pos: number;
  windows_matched: number;
  windows_ambiguous: number;
}

export interface ProcessedRide {
  ride_id: string;
  processing_version: string;
  processed_at: number;
  meta: RideMeta;
  summary: RideSummary;
  windows: VibWindow[];
  shocks: Shock[];
  track: [number, number, number][]; // [lat, lon, t]
  /** fixurile GPS complete (pentru re-potrivire când apare graful sau se schimbă suprafața declarată) */
  gps: GpsFix[];
  /** semnalul a_v filtrat, subeșantionat (max-abs cu semn), pentru replay */
  signal: { t0: number; dt: number; v: number[] };
  match: MatchStats;
  events: RideEvent[];
}
