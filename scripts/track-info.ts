import { Track } from '../src/engine/track.ts';
import { TRACKS, fullRaceLaps } from '../src/data/tracks.ts';
import { writeFileSync } from 'node:fs';

const out: Record<string, unknown> = {};
for (const def of TRACKS) {
  const t = new Track(def);
  const vmin = Math.min(...t.speed) * 3.6;
  const vmax = Math.max(...t.speed) * 3.6;
  console.log(
    `${def.id.padEnd(12)} len=${t.length.toFixed(0)}m n=${t.n} avg=${t.refAvgKph.toFixed(0)}kph v=[${vmin.toFixed(0)}..${vmax.toFixed(0)}]kph laps=${fullRaceLaps(def)} corners=${t.corners.length} drs=${t.drsZones.map((z) => `${z.start.toFixed(0)}-${z.end.toFixed(0)}`).join(',')}`,
  );
  out[def.id] = {
    x: Array.from(t.x).filter((_, i) => i % 2 === 0),
    y: Array.from(t.y).filter((_, i) => i % 2 === 0),
    corners: t.corners.map((c) => ({ ...c, ...t.pointAt(c.s) })),
    drs: t.drsZones.map((z) => ({ a: t.pointAt(z.start), b: t.pointAt(z.end) })),
    start: t.pointAt(0),
  };
}
writeFileSync(process.argv[2] ?? '/tmp/tracks.json', JSON.stringify(out));
