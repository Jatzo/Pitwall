import { referenceRaceLaps } from '../engine/race.ts';
import type { TrackDef } from '../engine/track.ts';

/**
 * Ten fictional circuits. Control points are listed clockwise and the first
 * point sits in the middle of the start/finish straight. The pit lane is
 * sized so a stop costs roughly 22 seconds, as in real life. New circuits are
 * added at the end so existing ids and indexes stay put; the season order is
 * set by SEASON_CALENDAR below.
 */
const PIT_LANE = { entryM: 200, exitM: 270 } as const;

export const TRACKS: readonly TrackDef[] = [
  {
    id: 'silverwood',
    name: 'Silverwood Circuit',
    location: 'Wexmoor',
    summary: 'An all-rounder: one long straight, a tight infield and nowhere to hide a weak car.',
    controlPoints: [
      [30, 80], [52, 80], [72, 80], [86, 76], [92, 64], [88, 52], [76, 46], [64, 50],
      [56, 58], [48, 56], [46, 46], [54, 38], [66, 32], [70, 22], [60, 14], [44, 14],
      [32, 22], [26, 34], [14, 40], [8, 52], [10, 66], [16, 78],
    ],
    lengthM: 5300,
    refLapS: 84,
    rainChance: 0.35,
    tyreSeverity: 1.0,
    overtakingDifficulty: 1.0,
    weights: { power: 0.36, aero: 0.34, chassis: 0.3 },
    pitLane: PIT_LANE,
  },
  {
    id: 'costa-alta',
    name: 'Costa Alta Street Circuit',
    location: 'Vellmar',
    summary: 'A street circuit with the walls close by. Passing is hard, so the grid matters.',
    controlPoints: [
      [36, 20], [60, 20], [84, 20], [92, 30], [86, 40], [70, 42], [60, 50], [70, 58],
      [88, 62], [92, 74], [80, 84], [60, 82], [50, 72], [38, 78], [26, 88], [12, 82],
      [8, 68], [18, 58], [14, 46], [8, 34], [12, 22],
    ],
    lengthM: 4900,
    refLapS: 90,
    rainChance: 0.15,
    tyreSeverity: 0.85,
    overtakingDifficulty: 1.5,
    weights: { power: 0.25, aero: 0.35, chassis: 0.4 },
    pitLane: PIT_LANE,
  },
  {
    id: 'monte-alba',
    name: 'Monte Alba Autodrome',
    location: 'Alba Valley',
    summary: 'Fast, with two DRS zones and plenty of passing.',
    controlPoints: [
      [12, 56], [12, 40], [16, 24], [30, 13], [52, 10], [74, 11], [88, 16], [94, 28],
      [90, 40], [80, 46], [84, 56], [90, 64], [86, 76], [72, 84], [60, 78], [56, 66],
      [46, 62], [38, 70], [34, 82], [22, 88], [12, 80], [12, 70],
    ],
    lengthM: 5600,
    refLapS: 86,
    rainChance: 0.3,
    tyreSeverity: 1.15,
    overtakingDifficulty: 0.85,
    weights: { power: 0.45, aero: 0.3, chassis: 0.25 },
    pitLane: PIT_LANE,
  },
  {
    id: 'kestrel-ring',
    name: 'Kestrel Ring',
    location: 'Hallow Heights',
    summary: 'Short and twisty. Passing is hard and two stops are common.',
    controlPoints: [
      [30, 86], [54, 86], [74, 82], [88, 70], [90, 54], [80, 44], [66, 46], [58, 36],
      [66, 24], [52, 14], [34, 16], [22, 26], [26, 38], [14, 46], [8, 60], [14, 76],
      [24, 84],
    ],
    lengthM: 4400,
    refLapS: 76,
    rainChance: 0.4,
    tyreSeverity: 1.05,
    overtakingDifficulty: 1.25,
    weights: { power: 0.28, aero: 0.38, chassis: 0.34 },
    pitLane: PIT_LANE,
  },
  {
    id: 'hartwell-park',
    name: 'Hartwell Park',
    location: 'Hartwell',
    summary: 'The fastest lap of the year. Long straights reward engine power.',
    controlPoints: [
      [30, 88], [50, 88], [70, 88], [86, 87], [93, 80], [94, 64], [94, 46], [93, 30], [90, 22], [84, 20],
      [80, 16], [82, 10], [76, 6], [60, 6], [44, 6], [30, 8], [22, 14], [26, 24], [18, 32], [10, 40],
      [8, 52], [14, 62], [22, 66], [24, 74], [16, 80], [18, 86],
    ],
    lengthM: 6300,
    refLapS: 96,
    rainChance: 0.2,
    tyreSeverity: 0.95,
    overtakingDifficulty: 0.85,
    weights: { power: 0.5, aero: 0.25, chassis: 0.25 },
    pitLane: PIT_LANE,
  },
  {
    id: 'port-calder',
    name: 'Port Calder Street Circuit',
    location: 'Calder Bay',
    summary: 'Slow right-angle corners between the walls. The hardest place to pass, light on tyres, and the chassis counts most.',
    controlPoints: [
      [40, 88], [62, 88], [78, 88], [84, 86], [86, 80], [86, 66], [84, 62], [78, 60], [64, 60], [60, 58],
      [58, 54], [58, 40], [60, 36], [64, 34], [80, 34], [84, 32], [86, 28], [86, 16], [84, 12], [80, 10],
      [50, 10], [46, 12], [44, 16], [44, 30], [42, 34], [38, 36], [22, 36], [18, 38], [16, 42], [16, 82],
      [18, 86], [22, 88],
    ],
    lengthM: 4800,
    refLapS: 100,
    // Bumpy streets and close walls: less grip than a purpose-built circuit.
    cornerAccel: 15,
    rainChance: 0.25,
    tyreSeverity: 0.8,
    // Stuck cars keep trying every second, so a street circuit needs a high value to stay processional.
    overtakingDifficulty: 6.0,
    weights: { power: 0.2, aero: 0.3, chassis: 0.5 },
    pitLane: PIT_LANE,
  },
  {
    id: 'ridgeback',
    name: 'Ridgeback Raceway',
    location: 'Ridgeback Moor',
    summary: 'Long, loaded corners on an abrasive surface. Tyres wear faster here than anywhere else.',
    controlPoints: [
      [40, 88], [56, 88], [72, 87], [86, 80], [93, 66], [92, 50], [84, 40], [72, 38], [62, 44], [56, 54],
      [46, 58], [36, 52], [34, 40], [42, 28], [56, 20], [66, 10], [50, 6], [30, 8], [16, 18], [8, 34],
      [8, 54], [12, 74], [24, 87],
    ],
    lengthM: 5500,
    refLapS: 85,
    rainChance: 0.4,
    tyreSeverity: 1.5,
    overtakingDifficulty: 1.0,
    weights: { power: 0.25, aero: 0.45, chassis: 0.3 },
    pitLane: PIT_LANE,
  },
  {
    id: 'dunmore',
    name: 'Dunmore Circuit',
    location: 'Dunmore',
    summary: 'The shortest lap. Backmarkers arrive early and the field stays close.',
    controlPoints: [
      [40, 80], [60, 80], [76, 76], [84, 64], [80, 52], [68, 48], [60, 40], [66, 28], [60, 18], [44, 16],
      [30, 22], [24, 36], [30, 48], [22, 58], [20, 70], [28, 78],
    ],
    lengthM: 3900,
    refLapS: 66,
    rainChance: 0.3,
    tyreSeverity: 0.85,
    overtakingDifficulty: 1.2,
    weights: { power: 0.33, aero: 0.33, chassis: 0.34 },
    pitLane: PIT_LANE,
  },
  {
    id: 'sable-coast',
    name: 'Sable Coast Autodrome',
    location: 'Sable Coast',
    summary: 'A long back straight and the easiest passing on the calendar.',
    controlPoints: [
      [30, 80], [50, 80], [70, 80], [86, 76], [92, 66], [86, 56], [74, 54], [66, 46], [70, 36], [84, 30],
      [92, 20], [86, 10], [70, 8], [50, 8], [30, 8], [14, 12], [8, 24], [14, 36], [24, 42], [22, 54],
      [12, 62], [12, 74], [20, 80],
    ],
    lengthM: 5400,
    refLapS: 86,
    rainChance: 0.2,
    tyreSeverity: 1.0,
    overtakingDifficulty: 0.75,
    weights: { power: 0.42, aero: 0.3, chassis: 0.28 },
    pitLane: PIT_LANE,
  },
  {
    id: 'vennholt',
    name: 'Vennholt Ring',
    location: 'Vennholt',
    summary: 'Tight and technical, one corner after another. Aero and chassis matter more than power.',
    controlPoints: [
      [36, 86], [56, 86], [72, 84], [80, 74], [74, 64], [82, 54], [92, 46], [88, 34], [76, 30], [70, 20],
      [58, 12], [44, 16], [40, 28], [30, 32], [20, 24], [10, 32], [12, 46], [24, 52], [28, 62], [18, 70],
      [16, 80], [24, 86],
    ],
    lengthM: 4700,
    refLapS: 86,
    rainChance: 0.35,
    tyreSeverity: 1.1,
    overtakingDifficulty: 1.3,
    weights: { power: 0.25, aero: 0.4, chassis: 0.35 },
    pitLane: PIT_LANE,
  },
];

/** Race order for a new season. Saved seasons keep the calendar they started with. */
export const SEASON_CALENDAR: readonly string[] = [
  'silverwood',
  'dunmore',
  'costa-alta',
  'hartwell-park',
  'ridgeback',
  'port-calder',
  'monte-alba',
  'vennholt',
  'sable-coast',
  'kestrel-ring',
];

export function trackById(id: string): TrackDef {
  const found = TRACKS.find((t) => t.id === id);
  if (!found) throw new Error(`Unknown track: ${id}`);
  return found;
}

/** Race distance: about 305 km, as in real grands prix. */
export function fullRaceLaps(track: TrackDef): number {
  return referenceRaceLaps(track);
}
