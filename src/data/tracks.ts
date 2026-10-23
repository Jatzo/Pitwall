import type { TrackDef } from '../engine/track.ts';

/**
 * Four fictional circuits. Control points are listed clockwise and the first
 * point sits in the middle of the start/finish straight. The pit lane is
 * sized so a stop costs roughly 22 seconds, as in real life.
 */
const PIT_LANE = { entryM: 200, exitM: 270 } as const;

export const TRACKS: readonly TrackDef[] = [
  {
    id: 'silverwood',
    name: 'Silverwood Circuit',
    location: 'Wexmoor',
    controlPoints: [
      [30, 80], [52, 80], [72, 80], [86, 76], [92, 64], [88, 52], [76, 46], [64, 50],
      [56, 58], [48, 56], [46, 46], [54, 38], [66, 32], [70, 22], [60, 14], [44, 14],
      [32, 22], [26, 34], [14, 40], [8, 52], [10, 66], [16, 78],
    ],
    lengthM: 5300,
    refLapS: 84,
    tyreSeverity: 1.0,
    overtakingDifficulty: 1.0,
    weights: { power: 0.36, aero: 0.34, chassis: 0.3 },
    pitLane: PIT_LANE,
  },
  {
    id: 'costa-alta',
    name: 'Costa Alta Street Circuit',
    location: 'Vellmar',
    controlPoints: [
      [36, 20], [60, 20], [84, 20], [92, 30], [86, 40], [70, 42], [60, 50], [70, 58],
      [88, 62], [92, 74], [80, 84], [60, 82], [50, 72], [38, 78], [26, 88], [12, 82],
      [8, 68], [18, 58], [14, 46], [8, 34], [12, 22],
    ],
    lengthM: 4900,
    refLapS: 90,
    tyreSeverity: 0.85,
    overtakingDifficulty: 1.5,
    weights: { power: 0.25, aero: 0.35, chassis: 0.4 },
    pitLane: PIT_LANE,
  },
  {
    id: 'monte-alba',
    name: 'Monte Alba Autodrome',
    location: 'Alba Valley',
    controlPoints: [
      [12, 56], [12, 40], [16, 24], [30, 13], [52, 10], [74, 11], [88, 16], [94, 28],
      [90, 40], [80, 46], [84, 56], [90, 64], [86, 76], [72, 84], [60, 78], [56, 66],
      [46, 62], [38, 70], [34, 82], [22, 88], [12, 80], [12, 70],
    ],
    lengthM: 5600,
    refLapS: 86,
    tyreSeverity: 1.15,
    overtakingDifficulty: 0.85,
    weights: { power: 0.45, aero: 0.3, chassis: 0.25 },
    pitLane: PIT_LANE,
  },
  {
    id: 'kestrel-ring',
    name: 'Kestrel Ring',
    location: 'Hallow Heights',
    controlPoints: [
      [30, 86], [54, 86], [74, 82], [88, 70], [90, 54], [80, 44], [66, 46], [58, 36],
      [66, 24], [52, 14], [34, 16], [22, 26], [26, 38], [14, 46], [8, 60], [14, 76],
      [24, 84],
    ],
    lengthM: 4400,
    refLapS: 76,
    tyreSeverity: 1.05,
    overtakingDifficulty: 1.25,
    weights: { power: 0.28, aero: 0.38, chassis: 0.34 },
    pitLane: PIT_LANE,
  },
];

export function trackById(id: string): TrackDef {
  const found = TRACKS.find((t) => t.id === id);
  if (!found) throw new Error(`Unknown track: ${id}`);
  return found;
}

/** Race distance: about 305 km, as in real grands prix. */
export function fullRaceLaps(track: TrackDef): number {
  return Math.ceil(305000 / track.lengthM);
}
