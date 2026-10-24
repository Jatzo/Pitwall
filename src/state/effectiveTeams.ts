/**
 * The grid as it races: the teams from the editor, with the player's signed
 * drivers in their seats. The editor's teams are never changed, so its
 * customisation always comes first.
 */

import type { TeamDef } from '../engine/types.ts';
import type { Career } from './season.ts';

export function effectiveTeams(teams: readonly TeamDef[], career: Career): TeamDef[] {
  return teams.map((team) => {
    if (team.id !== career.playerTeamId) return team;
    // A contract for a driver the editor no longer has leaves that seat as the editor set it.
    const signed = career.drivers.map((c, seat) => team.drivers.find((d) => d.id === c.driverId) ?? team.drivers[seat]);
    return { ...team, drivers: [signed[0], signed[1]] as TeamDef['drivers'] };
  });
}
