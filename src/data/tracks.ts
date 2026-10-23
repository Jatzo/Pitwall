import { referenceRaceLaps } from '../engine/race.ts';
import type { TrackDef } from '../engine/track.ts';

/**
 * Ten fictional circuits. Each layout is a list of key points in metres with
 * the radius of the corner at that point; the lap starts halfway between the
 * first two points, on the start/finish straight. Corner counts, radii and
 * straight lengths follow docs/research/circuit-design.md. The pit lane is
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
    layout: [
      [0, 0, 45], [1074, 0, 20], [1074, -269, 60], [1260, -425, 120], [1260, -663, 130], [1432, -834, 110],
      [1432, -1229, 15], [1377, -1219, 18], [1182, -881, 50], [781, -846, 14], [763, -803, 14], [362, -768, 25],
      [339, -1035, 40], [29, -1009, 160], [-137, -653, 220], [-105, -290, 200],
    ],
    lengthM: 5299,
    refLapS: 101,
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
    layout: [
      [118, 1064, 45], [1064, 1064, 16], [1064, 922, 18], [1359, 922, 18], [1359, 662, 60], [1182, 496, 40],
      [1182, 295, 16], [969, 295, 22], [916, 254, 22], [650, 254, 16], [650, 496, 18], [449, 496, 15],
      [449, 709, 18], [260, 709, 45], [260, 213, 15], [118, 177, 16], [71, 591, 60],
    ],
    lengthM: 4901,
    refLapS: 119,
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
    layout: [
      [144, 1443, 50], [1371, 1443, 22], [1443, 1371, 22], [1948, 1227, 180], [2093, 866, 220], [2093, 649, 30],
      [1660, 433, 16], [1602, 491, 16], [1371, 433, 90], [1155, 361, 90], [1010, 649, 130], [722, 751, 120],
      [548, 433, 15], [476, 476, 18], [548, 938, 60], [375, 924, 25], [216, 1155, 110],
    ],
    lengthM: 5600,
    refLapS: 108,
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
    layout: [
      [143, 1143, 40], [1285, 1143, 20], [1357, 857, 50], [1571, 714, 130], [1571, 357, 16], [1500, 314, 18],
      [1214, 543, 45], [928, 471, 100], [785, 214, 30], [500, 286, 60], [571, 643, 140], [286, 743, 40],
      [114, 928, 50],
    ],
    lengthM: 4400,
    refLapS: 88,
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
    layout: [
      [211, 1547, 60], [1758, 1547, 18], [1815, 1491, 18], [2110, 1266, 140], [2194, 985, 200], [2391, 774, 90],
      [2391, 492, 16], [2321, 436, 16], [1899, 464, 90], [1618, 309, 130], [1266, 281, 40], [1224, 239, 40],
      [844, 211, 120], [633, 352, 30], [563, 281, 30], [422, 492, 70], [633, 774, 150], [352, 985, 110],
      [169, 1196, 70],
    ],
    lengthM: 6286,
    refLapS: 111,
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
    layout: [
      [125, 1123, 45], [998, 1123, 15], [998, 873, 18], [1247, 873, 16], [1247, 624, 15], [1060, 624, 18],
      [1060, 474, 20], [1247, 374, 15], [1247, 150, 15], [873, 150, 18], [873, 374, 15], [599, 374, 16],
      [549, 412, 16], [374, 412, 15], [374, 187, 20], [125, 187, 45], [125, 686, 40],
    ],
    lengthM: 4799,
    refLapS: 124,
    // Bumpy streets and close walls: less grip than a purpose-built circuit.
    grip: 0.85,
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
    layout: [
      [272, 1358, 60], [1494, 1358, 30], [1698, 1114, 200], [1630, 815, 260], [1834, 543, 200], [1698, 272, 45],
      [1290, 163, 150], [951, 340, 100], [1087, 679, 15], [1012, 720, 18], [815, 611, 25], [761, 652, 25],
      [543, 475, 160], [340, 407, 240], [204, 570, 20], [109, 516, 20], [136, 747, 120], [244, 1087, 150],
    ],
    lengthM: 5500,
    refLapS: 99,
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
    layout: [
      [187, 995, 40], [1206, 995, 18], [1206, 771, 60], [1393, 597, 140], [1393, 323, 15], [1324, 280, 16],
      [1094, 522, 45], [771, 522, 120], [597, 647, 30], [522, 373, 60], [249, 311, 50], [137, 647, 150],
    ],
    lengthM: 3901,
    refLapS: 79,
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
    layout: [
      [146, 1318, 40], [1391, 1318, 20], [1830, 1098, 80], [1830, 805, 120], [1976, 439, 15], [1903, 381, 18],
      [1684, 483, 16], [1625, 439, 16], [1244, 439, 140], [1025, 556, 25], [966, 512, 25], [586, 439, 90],
      [293, 439, 35], [176, 659, 140], [512, 878, 40], [556, 1025, 30], [293, 1098, 50],
    ],
    lengthM: 5399,
    refLapS: 109,
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
    layout: [
      [146, 1245, 35], [1245, 1245, 20], [1245, 1025, 45], [1435, 908, 110], [1435, 615, 25], [1201, 615, 30],
      [1113, 410, 110], [1318, 234, 60], [1289, 88, 16], [1215, 73, 18], [879, 322, 35], [659, 220, 50],
      [439, 381, 50], [556, 659, 120], [264, 820, 80], [117, 952, 35],
    ],
    lengthM: 4699,
    refLapS: 100,
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
