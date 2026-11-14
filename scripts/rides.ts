import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { DEFAULT_CONFIG } from '../src/core/config';
import type { Graph } from '../src/core/graph';
import { parseRideFile } from '../src/core/io';
import { processRide } from '../src/core/process';
import type { ProcessedRide } from '../src/core/types';

/** Argumente: fișiere, foldere sau tipare simple (rides/*.zip — PowerShell nu expandează globurile). */
export function expandArgs(args: string[]): string[] {
  const out: string[] = [];
  for (const a of args) {
    if (a.includes('*')) {
      const dir = a.slice(0, a.lastIndexOf('/') + 1) || '.';
      const pat = new RegExp('^' + basename(a).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');
      if (existsSync(dir)) for (const f of readdirSync(dir)) if (pat.test(f)) out.push(join(dir, f));
    } else if (existsSync(a) && statSync(a).isDirectory()) {
      for (const f of readdirSync(a)) if (/\.(zip|csv)$/i.test(f)) out.push(join(a, f));
    } else out.push(a);
  }
  return [...new Set(out)].sort();
}

export interface LoadedRide {
  file: string;
  name: string;
  p: ProcessedRide;
}

export function loadRides(files: string[], graph: Graph | null): LoadedRide[] {
  const out: LoadedRide[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    try {
      const raw = parseRideFile(basename(f), new Uint8Array(readFileSync(f)));
      const name = basename(f).replace(/\.(zip|csv)$/i, '');
      raw.meta.label = raw.meta.label || name;
      const p = processRide(raw, { graph, cfg: DEFAULT_CONFIG });
      if (seen.has(p.ride_id)) { console.warn(`Duplicat ignorat: ${f}`); continue; }
      seen.add(p.ride_id);
      out.push({ file: f, name, p });
    } catch (e) {
      console.error(`EROARE ${f}: ${(e as Error).message}`);
    }
  }
  return out;
}
