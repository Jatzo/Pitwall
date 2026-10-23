/**
 * Browser persistence. Team customisation (names, colours, logos, driver
 * names) is stored separately from the season so you can restyle the grid at
 * any time without losing your progress.
 */

import { defaultTeams } from '../data/teams.ts';
import type { LogoSpec, TeamDef } from '../engine/types.ts';
import type { Career } from './season.ts';

const TEAMS_KEY = 'pitwall.teams.v1';
const CAREER_KEY = 'pitwall.career.v1';

interface DriverCustomisation {
  name: string;
  code: string;
  number: number;
}

export interface TeamCustomisation {
  name: string;
  shortName: string;
  colors: { primary: string; secondary: string };
  logo: LogoSpec;
  drivers: [DriverCustomisation, DriverCustomisation];
}

export type CustomisationMap = Record<string, TeamCustomisation>;

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Storage full or unavailable (private mode). The game still works.
    return false;
  }
}

/** Apply saved customisation on top of a base roster. Unknown ids are ignored. */
export function applyCustomisation(base: TeamDef[], map: CustomisationMap | null): TeamDef[] {
  if (!map) return base;
  return base.map((team) => {
    const c = map[team.id];
    if (!c || !c.drivers || c.drivers.length !== 2) return team;
    return {
      ...team,
      name: c.name || team.name,
      shortName: c.shortName || team.shortName,
      colors: { primary: c.colors?.primary ?? team.colors.primary, secondary: c.colors?.secondary ?? team.colors.secondary },
      logo: c.logo ?? team.logo,
      drivers: [
        { ...team.drivers[0], ...c.drivers[0] },
        { ...team.drivers[1], ...c.drivers[1] },
      ],
    };
  });
}

export function toCustomisation(teams: TeamDef[]): CustomisationMap {
  const map: CustomisationMap = {};
  for (const t of teams) {
    map[t.id] = {
      name: t.name,
      shortName: t.shortName,
      colors: t.colors,
      logo: t.logo,
      drivers: [
        { name: t.drivers[0].name, code: t.drivers[0].code, number: t.drivers[0].number },
        { name: t.drivers[1].name, code: t.drivers[1].code, number: t.drivers[1].number },
      ],
    };
  }
  return map;
}

export function loadTeams(): TeamDef[] {
  return applyCustomisation(defaultTeams(), read<CustomisationMap>(TEAMS_KEY));
}

export function saveTeams(teams: TeamDef[]): boolean {
  return write(TEAMS_KEY, toCustomisation(teams));
}

export function resetTeams(): TeamDef[] {
  try {
    window.localStorage.removeItem(TEAMS_KEY);
  } catch {
    // ignore
  }
  return defaultTeams();
}

export function loadCareer(): Career | null {
  const c = read<Career>(CAREER_KEY);
  if (!c || c.version !== 1 || typeof c.seed !== 'number' || !Array.isArray(c.results) || !c.playerTeamId) {
    return null;
  }
  return c;
}

export function saveCareer(career: Career): void {
  write(CAREER_KEY, career);
}

export function clearCareer(): void {
  try {
    window.localStorage.removeItem(CAREER_KEY);
  } catch {
    // ignore
  }
}
