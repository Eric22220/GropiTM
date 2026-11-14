import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Graph, type GraphJson } from '../src/core/graph';

export const GRAPH_PATH = resolve('public/data/graph-timisoara.json');

export function loadGraphIfExists(): Graph | null {
  if (!existsSync(GRAPH_PATH)) return null;
  return new Graph(JSON.parse(readFileSync(GRAPH_PATH, 'utf8')) as GraphJson);
}
