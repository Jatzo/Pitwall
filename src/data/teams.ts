import type { CarRatings, DriverRatings, LogoShape, TeamDef } from '../engine/types.ts';

/** All teams, drivers and logos are fictional. Everything here can be edited in-game. */

interface DriverSeed {
  name: string;
  code: string;
  number: number;
  r: [pace: number, racecraft: number, tyreMgmt: number, consistency: number, start: number];
}

interface TeamSeed {
  id: string;
  name: string;
  shortName: string;
  primary: string;
  secondary: string;
  shape: LogoShape;
  initials: string;
  /** power, aero, chassis, reliability, pitCrew */
  car: [number, number, number, number, number];
  drivers: [DriverSeed, DriverSeed];
}

const SEEDS: TeamSeed[] = [
  {
    id: 'aurora', name: 'Aurora Racing', shortName: 'Aurora', primary: '#2f8cff', secondary: '#e8f3ff',
    shape: 'shield', initials: 'AR', car: [92, 91, 89, 90, 88],
    drivers: [
      { name: 'Marco Veltri', code: 'VEL', number: 7, r: [94, 90, 82, 92, 88] },
      { name: 'Elias Norgaard', code: 'NOR', number: 21, r: [90, 86, 88, 90, 84] },
    ],
  },
  {
    id: 'velox', name: 'Velox Motorsport', shortName: 'Velox', primary: '#e0262e', secondary: '#ffffff',
    shape: 'chevron', initials: 'VX', car: [90, 89, 86, 82, 90],
    drivers: [
      { name: 'Luca Ferranti', code: 'FER', number: 5, r: [93, 92, 78, 86, 94] },
      { name: 'Dario Quintero', code: 'QUI', number: 14, r: [86, 84, 84, 84, 80] },
    ],
  },
  {
    id: 'ironclad', name: 'Ironclad GP', shortName: 'Ironclad', primary: '#ff8a1f', secondary: '#1b1b1f',
    shape: 'hex', initials: 'IG', car: [87, 86, 88, 85, 80],
    drivers: [
      { name: 'Tomas Brandt', code: 'BRA', number: 3, r: [89, 88, 86, 91, 82] },
      { name: 'Hiro Tanabe', code: 'TAN', number: 31, r: [85, 80, 90, 88, 86] },
    ],
  },
  {
    id: 'solstice', name: 'Solstice Racing', shortName: 'Solstice', primary: '#f4c20d', secondary: '#202020',
    shape: 'circle', initials: 'SR', car: [84, 86, 82, 88, 84],
    drivers: [
      { name: 'Callum Rhodes', code: 'RHO', number: 11, r: [87, 86, 80, 84, 90] },
      { name: 'Mateo Salvador', code: 'SAL', number: 29, r: [82, 84, 78, 80, 84] },
    ],
  },
  {
    id: 'nordlicht', name: 'Nordlicht Racing', shortName: 'Nordlicht', primary: '#17b26a', secondary: '#0b1d14',
    shape: 'diamond', initials: 'NL', car: [83, 80, 84, 90, 78],
    drivers: [
      { name: 'Jonas Eklund', code: 'EKL', number: 9, r: [85, 82, 86, 92, 78] },
      { name: 'Anja Kessler', code: 'KES', number: 44, r: [83, 85, 82, 86, 88] },
    ],
  },
  {
    id: 'cobalt', name: 'Cobalt Dynamics', shortName: 'Cobalt', primary: '#7b4dff', secondary: '#f0eaff',
    shape: 'stripe', initials: 'CD', car: [78, 82, 79, 75, 82],
    drivers: [
      { name: 'Yusuf Demir', code: 'DEM', number: 16, r: [84, 83, 76, 78, 86] },
      { name: 'Ravi Menon', code: 'MEN', number: 33, r: [79, 78, 82, 84, 80] },
    ],
  },
  {
    id: 'redwood', name: 'Redwood Racing', shortName: 'Redwood', primary: '#b3322a', secondary: '#f3e9dc',
    shape: 'shield', initials: 'RW', car: [80, 76, 77, 80, 72],
    drivers: [
      { name: 'Oscar Lindqvist', code: 'LIN', number: 18, r: [82, 80, 80, 86, 76] },
      { name: 'Pablo Aranda', code: 'ARA', number: 77, r: [78, 82, 74, 76, 84] },
    ],
  },
  {
    id: 'meridian', name: 'Meridian GP', shortName: 'Meridian', primary: '#12b5b0', secondary: '#042b2a',
    shape: 'circle', initials: 'MG', car: [74, 75, 78, 85, 76],
    drivers: [
      { name: 'Felix Hartmann', code: 'HAR', number: 24, r: [80, 78, 84, 88, 74] },
      { name: 'Nico Bellamy', code: 'BEL', number: 52, r: [75, 76, 78, 80, 80] },
    ],
  },
  {
    id: 'tempest', name: 'Tempest Racing', shortName: 'Tempest', primary: '#e83e8c', secondary: '#2a0a1a',
    shape: 'chevron', initials: 'TR', car: [70, 72, 70, 70, 70],
    drivers: [
      { name: 'Sasha Volkov', code: 'VOL', number: 8, r: [78, 80, 72, 74, 82] },
      { name: 'Ben Okafor', code: 'OKA', number: 63, r: [74, 74, 76, 78, 76] },
    ],
  },
  {
    id: 'halcyon', name: 'Halcyon Motorsport', shortName: 'Halcyon', primary: '#c9a227', secondary: '#111111',
    shape: 'diamond', initials: 'HM', car: [66, 68, 66, 78, 65],
    drivers: [
      { name: 'Theo Lambert', code: 'LAM', number: 27, r: [76, 74, 78, 80, 72] },
      { name: 'Idris Kamara', code: 'KAM', number: 99, r: [72, 72, 72, 74, 78] },
    ],
  },
];

function driverRatings(r: DriverSeed['r']): DriverRatings {
  return { pace: r[0], racecraft: r[1], tyreMgmt: r[2], consistency: r[3], start: r[4] };
}

function carRatings(c: TeamSeed['car']): CarRatings {
  return { power: c[0], aero: c[1], chassis: c[2], reliability: c[3], pitCrew: c[4] };
}

export function defaultTeams(): TeamDef[] {
  return SEEDS.map((s) => ({
    id: s.id,
    name: s.name,
    shortName: s.shortName,
    colors: { primary: s.primary, secondary: s.secondary },
    logo: { shape: s.shape, initials: s.initials },
    car: carRatings(s.car),
    drivers: [
      { id: `${s.id}-0`, name: s.drivers[0].name, code: s.drivers[0].code, number: s.drivers[0].number, ratings: driverRatings(s.drivers[0].r) },
      { id: `${s.id}-1`, name: s.drivers[1].name, code: s.drivers[1].code, number: s.drivers[1].number, ratings: driverRatings(s.drivers[1].r) },
    ],
  }));
}

/** Overall car rating shown in the UI (0-100). */
export function carOverall(car: CarRatings): number {
  return Math.round((car.power + car.aero + car.chassis) / 3);
}
