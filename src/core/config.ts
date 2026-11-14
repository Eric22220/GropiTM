// Toți parametrii procesării. Valorile [EXPERIMENTAL] sunt puncte de plecare, nu constante dovedite.

export interface VibrationConfig {
  processing_version: string;
  max_abs: number; // m/s², mostră invalidă peste
  gap_ms: number; // interval > gap_ms = gol
  min_fs: number; // [EXPERIMENTAL]
  gravity_tau_s: number; // [EXPERIMENTAL]
  hp_hz: number; // [EXPERIMENTAL]
  settle_s: number; // stabilizarea filtrelor după start / gol
  window_s: number; // [EXPERIMENTAL]
  step_s: number;
  speed_min: number; // [EXPERIMENTAL]
  speed_max: number; // [EXPERIMENTAL]
  gyro_max: number; // °/s [EXPERIMENTAL]
  mount_shift_deg: number; // [EXPERIMENTAL]
  // șocuri (6.10)
  shock_z: number; // [EXPERIMENTAL]
  shock_abs: number; // m/s² [EXPERIMENTAL]
  shock_end_z: number;
  shock_end_ms: number;
  shock_sigma_min: number; // [EXPERIMENTAL]
  shock_baseline_s: number;
  shock_cooldown_s: number;
  wheelbase_m: number;
  // map-matching (8.2)
  mm_max_acc: number;
  mm_min_radius: number;
  mm_heading_penalty: number;
  mm_adjacent_penalty: number;
  // stări segment (6.9)
  measured_min_windows: number;
  measured_min_passes: number;
  measured_max_acc: number;
  pass_gap_s: number;
  /** procentul maxim de ferestre ambigue tolerat pentru MEASURED (spec: 0 = orice ambiguitate → LOW_CONFIDENCE) */
  measured_max_ambiguous: number;
  // confidențialitate
  publish_trim_m: number;
}

export const DEFAULT_CONFIG: VibrationConfig = {
  processing_version: 'sg-1.0.0',
  max_abs: 160,
  gap_ms: 100,
  min_fs: 40,
  gravity_tau_s: 1.0,
  hp_hz: 4,
  settle_s: 2,
  window_s: 2,
  step_s: 1,
  speed_min: 2.5,
  speed_max: 9,
  gyro_max: 300,
  mount_shift_deg: 15,
  shock_z: 6,
  shock_abs: 4,
  shock_end_z: 3,
  shock_end_ms: 150,
  shock_sigma_min: 0.15,
  shock_baseline_s: 20,
  shock_cooldown_s: 0.5,
  wheelbase_m: 1.05,
  mm_max_acc: 20,
  mm_min_radius: 15,
  mm_heading_penalty: 20,
  mm_adjacent_penalty: 8,
  measured_min_windows: 3,
  measured_min_passes: 2,
  measured_max_acc: 10,
  pass_gap_s: 30,
  measured_max_ambiguous: 0,
  publish_trim_m: 200,
};

/** Pragurile implicite ale claselor A|B|C|D|E pe rms_v (m/s²), folosite doar până există ≥ 30 de ferestre valide. [EXPERIMENTAL] */
export const DEFAULT_THRESHOLDS: [number, number, number, number] = [1.0, 1.6, 2.4, 3.6];

export const G = 9.80665;
