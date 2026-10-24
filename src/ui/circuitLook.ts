/**
 * What each circuit's surroundings look like on the race map. This is drawing
 * only, so it lives with the UI and the engine's TrackDef stays untouched.
 */
export const SETTINGS = ['countryside', 'parkland', 'moorland', 'forest', 'mountain', 'coastal', 'street'] as const;
export type Setting = (typeof SETTINGS)[number];

const BY_CIRCUIT: Record<string, Setting> = {
  silverwood: 'countryside',
  dunmore: 'countryside',
  'hartwell-park': 'parkland',
  ridgeback: 'moorland',
  vennholt: 'forest',
  'monte-alba': 'mountain',
  'kestrel-ring': 'mountain',
  'sable-coast': 'coastal',
  'costa-alta': 'street',
  'port-calder': 'street',
};

/** A circuit added later without a setting gets the countryside. */
export function settingFor(trackId: string): Setting {
  return BY_CIRCUIT[trackId] ?? 'countryside';
}

export interface Look {
  ground: string;
  /** Mown stripes across the ground, where there is grass to mow. */
  stripe?: string;
  patch?: string;
  water?: string;
  shore?: string;
  trees: readonly string[];
  rocks: readonly string[];
  blocks: readonly string[];
}

/**
 * Muted, dark ground colours, so the team colours of the cars stay the
 * brightest thing on the map.
 */
export const LOOKS: Record<Setting, Look> = {
  countryside: { ground: '#14231a', stripe: '#172a1e', trees: ['#2a4d33', '#244430', '#30573a'], rocks: [], blocks: [] },
  parkland: { ground: '#16271b', stripe: '#1a2e20', trees: ['#2e5638', '#33603d', '#284c32'], rocks: [], blocks: [] },
  moorland: { ground: '#201e17', patch: '#2a2129', trees: ['#2c3522'], rocks: ['#4a4a45', '#3b3c38'], blocks: [] },
  forest: { ground: '#0f1d14', trees: ['#1f4029', '#24482e', '#1a3a25', '#2a5234'], rocks: [], blocks: [] },
  mountain: { ground: '#1b201c', patch: '#272c2a', trees: ['#2a4a33', '#24432e'], rocks: ['#55585a', '#45494c', '#3c4043'], blocks: [] },
  coastal: { ground: '#1a281c', water: '#0d2236', shore: '#8f8162', trees: ['#305736', '#36603b'], rocks: [], blocks: [] },
  street: { ground: '#15171c', water: '#0c1f33', shore: '#3a3f4a', trees: ['#1d3324'], rocks: [], blocks: ['#22252d', '#262a33', '#1e2128'] },
};

/** Colours shared by every setting: the circuit itself and what is built around it. */
export const CIRCUIT = {
  edge: '#e6e9ef',
  asphalt: '#30353f',
  racingLine: '#282c35',
  pitAsphalt: '#3a404c',
  gravel: '#7a6c52',
  runoff: '#262b34',
  barrier: '#c8ccd4',
  kerbRed: '#d6262b',
  kerbWhite: '#e8e8e8',
  stand: '#6f7c96',
  standRow: '#56627a',
  building: '#bfc5d0',
  drs: '#2fd27a',
  sectorLine: '#ffd75e',
  tag: '#0b0d12',
  tagText: '#e6e9f0',
} as const;
