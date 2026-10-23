/**
 * Circuit report: `npm run circuits`.
 * Prints the derived numbers for every circuit (average speed, speed range,
 * corners, DRS zones, how far the authored lap is from what the layout
 * allows) and draws docs/circuits.svg, a sheet of every layout in calendar
 * order with its pit lane, straight from the engine geometry.
 */

import { writeFileSync } from 'node:fs';
import { SEASON_CALENDAR, fullRaceLaps, trackById } from '../src/data/tracks.ts';
import { Track } from '../src/engine/track.ts';

const COLS = 5;
const CELL_W = 260;
const CELL_H = 270;
const DRAW = 190;

let body = '';
SEASON_CALENDAR.forEach((id, k) => {
  const def = trackById(id);
  const t = new Track(def);
  const physical = new Track({ ...def, refLapS: undefined }).refLap;
  const kph = Array.from(t.speed, (v) => v * 3.6);
  console.log(
    `${String(k + 1).padStart(2)} ${def.id.padEnd(14)} ${(t.length / 1000).toFixed(2)} km  avg ${t.refAvgKph.toFixed(0)} km/h  ` +
      `${Math.min(...kph).toFixed(0)}-${Math.max(...kph).toFixed(0)} km/h  corners ${t.corners.length}  DRS ${t.drsZones.length}  ` +
      `laps ${fullRaceLaps(def)}  speed scale ${(physical / t.refLap).toFixed(2)}`,
  );

  const b = t.bounds;
  const scale = DRAW / Math.max(b.maxX - b.minX, b.maxY - b.minY);
  const ox = (k % COLS) * CELL_W + 20 + (DRAW - (b.maxX - b.minX) * scale) / 2;
  const oy = Math.floor(k / COLS) * CELL_H + 46 + (DRAW - (b.maxY - b.minY) * scale) / 2;
  const at = (s: number) => {
    const p = t.pointAt(s);
    return [ox + (p.x - b.minX) * scale, oy + (p.y - b.minY) * scale] as const;
  };
  let d = '';
  for (let s = 0; s < t.length; s += 5) {
    const [x, y] = at(s);
    d += `${s === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }
  body += `<path d="${d}Z" fill="none" stroke="#05070b" stroke-width="9" stroke-linejoin="round"/>`;
  body += `<path d="${d}Z" fill="none" stroke="#4a5470" stroke-width="6" stroke-linejoin="round"/>`;
  for (const zone of t.drsZones) {
    const len = (zone.end - zone.start + t.length) % t.length;
    let z = '';
    for (let s = 0; s <= len; s += 15) {
      const [x, y] = at(zone.start + s);
      z += `${s === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }
    body += `<path d="${z}" fill="none" stroke="#2fd27a" stroke-width="2.5" stroke-linecap="round"/>`;
  }
  let pit = '';
  for (let u = -t.pitEntryM; u <= t.pitExitM; u += 10) {
    const p = t.pitLanePoint(u);
    pit += `${u === -t.pitEntryM ? 'M' : 'L'}${(ox + (p.x - b.minX) * scale).toFixed(1)},${(oy + (p.y - b.minY) * scale).toFixed(1)}`;
  }
  body += `<path d="${pit}" fill="none" stroke="#2c3345" stroke-width="3" stroke-linecap="round"/>`;
  const [sx, sy] = at(0);
  body += `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="5" fill="#e10600"/>`;
  const tx = (k % COLS) * CELL_W + 20;
  const ty = Math.floor(k / COLS) * CELL_H + 20;
  body += `<text x="${tx}" y="${ty}" fill="#e6e9f0" font-size="14" font-weight="700">${k + 1}. ${def.name}</text>`;
  body += `<text x="${tx}" y="${ty + 240}" fill="#8b93a7" font-size="11">${(t.length / 1000).toFixed(2)} km · ${t.refAvgKph.toFixed(0)} km/h average · ${t.corners.length} corners</text>`;
});

const width = COLS * CELL_W;
const height = Math.ceil(SEASON_CALENDAR.length / COLS) * CELL_H;
const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ` +
  `font-family="system-ui, sans-serif"><rect width="100%" height="100%" fill="#0b0d12"/>${body}</svg>\n`;
const out = process.argv[2] ?? 'docs/circuits.svg';
writeFileSync(out, svg);
console.log(`\nWrote ${out}`);
