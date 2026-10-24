/**
 * The grid as it races: the teams from the editor, with the player's signed
 * drivers in their seats and every car's development on top. The editor's
 * teams are never changed, so its customisation always comes first.
 */

import { FREE_AGENTS } from '../data/drivers.ts';
import type { DriverDef, TeamDef } from '../engine/types.ts';
import { developed, rivalGains } from './development.ts';
import type { Career } from './season.ts';

export function effectiveTeams(teams: readonly TeamDef[], career: Career): TeamDef[] {
  const rivals = rivalGains(teams, career);
  return teams.map((team) => {
    if (team.id !== career.playerTeamId) return rivals[team.id] ? { ...team, car: developed(team.car, rivals[team.id]) } : team;
    // A contract for a driver nobody has any more leaves that seat as the editor set it.
    const signed = career.drivers.map(
      (c, seat) => team.drivers.find((d) => d.id === c.driverId) ?? FREE_AGENTS.find((d) => d.id === c.driverId) ?? team.drivers[seat],
    );
    const taken = new Set(teams.filter((t) => t.id !== team.id).flatMap((t) => t.drivers.map((d) => d.number)));
    const seated = signed.map((d) => {
      const n = numberFor(d, taken);
      taken.add(n);
      return n === d.number ? d : { ...d, number: n };
    });
    return { ...team, drivers: [seated[0], seated[1]] as TeamDef['drivers'], car: developed(team.car, career.development.gains) };
  });
}

/** The driver's own number, or the lowest one free when the editor has given theirs to someone else. */
function numberFor(driver: DriverDef, taken: ReadonlySet<number>): number {
  if (!taken.has(driver.number)) return driver.number;
  for (let n = 1; n <= 99; n++) if (!taken.has(n)) return n;
  return driver.number;
}
