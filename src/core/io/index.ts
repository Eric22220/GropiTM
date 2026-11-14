import type { RawRide } from '../types';
import { parseLegacy } from './legacy';
import { ImportError, looksLikeSensorLogger, parseSensorLogger } from './sensorlogger';
import { looksLikeShockGrid, parseShockGrid } from './shockgrid';
import { isXlsx, isZip, unzipFlat } from './zip';

export { ImportError };

/** Detectează formatul și parsează: ZIP Sensor Logger, ZIP ShockGrid, CSV vechi. .xlsx se refuză. */
export function parseRideFile(name: string, bytes: Uint8Array): RawRide {
  const lower = name.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    throw new ImportError('Fișierele Excel (.xlsx) nu se acceptă: CSV-ul salvat prin Excel își pierde structura. Folosește exportul ZIP original din Sensor Logger.');
  }
  if (isZip(bytes)) {
    const files = unzipFlat(bytes);
    if (isXlsx(files)) throw new ImportError('Fișierul e un document Excel (.xlsx), nu un export ZIP. Folosește exportul ZIP original din Sensor Logger.');
    if (looksLikeShockGrid(files)) return parseShockGrid(files);
    if (looksLikeSensorLogger(files)) return parseSensorLogger(files);
    const csvs = Object.entries(files).filter(([k]) => k.toLowerCase().endsWith('.csv')).map(([, v]) => v);
    if (csvs.length) return parseLegacy(csvs);
    throw new ImportError('ZIP-ul nu conține un export Sensor Logger (Metadata.csv, Location.csv, AccelerometerUncalibrated.csv / TotalAcceleration.csv) sau ShockGrid.');
  }
  if (lower.endsWith('.csv')) return parseLegacy([bytes]);
  throw new ImportError('Format necunoscut. Alege ZIP-ul exportat din Sensor Logger (Export → ZIP, CSV).');
}
