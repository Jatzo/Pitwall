/**
 * Sponsors. Each season brings three offers, drawn from the career seed and
 * set against the car's strength: a safe deal with a high base payment and an
 * easy objective, a balanced one, and an ambitious one with a low base and a
 * big bonus for a hard objective. The objective is judged from each race's
 * rows. All sponsor names are fictional.
 */

import { carOverall } from '../data/teams.ts';
import { Rng, mixSeed } from '../engine/rng.ts';
import type { TeamDef } from '../engine/types.ts';
import type { Career, Objective, RaceRecordRow, SponsorDeal, SponsorTier } from './season.ts';

/** Every number sponsors use, in one place so the season script can tune them. */
export const SPONSORS = {
  names: [
    'Halden Freight', 'Corvane Energy', 'Pellmark Insurance', 'Quillon Watches', 'Tidewell Water', 'Vantor Systems',
    'Glasswing Air', 'Marrow and Finch Tea', 'Lumenfold Cameras', 'Ashgrove Builders', 'Brightlake Telecom', 'Orrin Outdoor',
  ],
  /**
   * £m: base payment per race and bonus per objective met, before a 10% swing
   * either way from the seed. The base is 15% less for the strongest car and
   * 15% more for the weakest, since prize money already favours the front.
   */
  tiers: [
    { tier: 'safe', base: 0.8, bonus: 0.15 },
    { tier: 'balanced', base: 0.65, bonus: 0.4 },
    { tier: 'ambitious', base: 0.45, bonus: 1.3 },
  ] as const satisfies readonly { tier: SponsorTier; base: number; bonus: number }[],
};

const money = (n: number): number => Math.round(n * 100) / 100;

/** The objective for each tier, from where the team's car ranks on the grid (1 for the strongest). */
function objectiveFor(tier: SponsorTier, rank: number, ranked: readonly TeamDef[]): Objective {
  const half = ranked.length / 2;
  if (tier === 'safe') return rank <= half ? { kind: 'points' } : { kind: 'bothFinish' };
  // About the best car's usual finish, but never so low down that finishing at all would earn it.
  if (tier === 'balanced') return { kind: 'topN', n: Math.min(2 * ranked.length - 3, Math.max(2, 2 * rank - 1)) };
  return rank === 1 ? { kind: 'topN', n: 1 } : { kind: 'beat', teamId: ranked[rank - 2].id };
}

/** The season's three offers, safe first. `teams` is the grid as it races, so a stronger car gets harder targets. */
export function sponsorOffers(career: Career, teams: readonly TeamDef[]): SponsorDeal[] {
  const ranked = [...teams].sort((a, b) => carOverall(b.car) - carOverall(a.car) || a.id.localeCompare(b.id));
  const rank = ranked.findIndex((t) => t.id === career.playerTeamId) + 1;
  const k = (ranked.length - rank) / Math.max(1, ranked.length - 1);
  const rng = new Rng(mixSeed(career.seed, `sponsors:${career.season}`));
  const names = [...SPONSORS.names];
  return SPONSORS.tiers.map((t) => {
    const name = names.splice(Math.floor(rng.next() * names.length), 1)[0];
    const swing = rng.range(0.9, 1.1);
    return { name, tier: t.tier, base: money(t.base * (1.15 - 0.3 * k) * swing), bonus: money(t.bonus * swing), objective: objectiveFor(t.tier, rank, ranked), season: career.season, fromRound: 0 };
  });
}

/** Signs a deal for the season. Throws if one is already signed this season; the screen offers only one choice. */
export function chooseSponsor(career: Career, deal: SponsorDeal): Career {
  if (career.sponsor && career.sponsor.season === career.season) throw new Error(`Already sponsored by ${career.sponsor.name} this season`);
  return { ...career, sponsor: { ...deal, season: career.season, fromRound: career.results.length } };
}

/** This season's deal and how many of its races met the objective, or null with no deal this season. */
export function sponsorRecord(career: Career): { met: number; races: number } | null {
  const deal = career.sponsor;
  if (!deal || deal.season !== career.season) return null;
  const races = career.results.slice(deal.fromRound);
  return { met: races.filter((r) => objectiveMet(deal.objective, r.rows, career.playerTeamId)).length, races: races.length };
}

export function objectiveMet(objective: Objective, rows: readonly RaceRecordRow[], playerTeamId: string): boolean {
  const of = (teamId: string) => rows.filter((r) => r.carId.startsWith(`${teamId}:`));
  const mine = of(playerTeamId);
  const best = (rs: RaceRecordRow[]) => Math.min(Infinity, ...rs.map((r) => r.position));
  switch (objective.kind) {
    case 'points':
      return mine.some((r) => r.points > 0);
    case 'bothFinish':
      return mine.length === 2 && mine.every((r) => r.finished);
    case 'topN':
      return mine.some((r) => r.finished && r.position <= objective.n);
    case 'beat':
      return best(mine) < best(of(objective.teamId));
  }
}

export function describeObjective(objective: Objective, teams: readonly TeamDef[]): string {
  switch (objective.kind) {
    case 'points':
      return 'Score points';
    case 'bothFinish':
      return 'Both cars finish';
    case 'topN':
      return objective.n === 1 ? 'Win the race' : `A car in the top ${objective.n}`;
    case 'beat':
      return `Finish ahead of both ${teams.find((t) => t.id === objective.teamId)?.shortName ?? 'rival'} cars`;
  }
}
