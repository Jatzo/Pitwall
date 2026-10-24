/**
 * Car development. The player pays for projects that take one to three rounds
 * to build and may deliver only half their gain. Rivals spend a budget each
 * round on their weakest area through the same cost curve, drawn from the
 * career seed alone, so nothing the player does can change a rival's car and
 * rival progress needs no stored state. At each season start every team's
 * gains drift part of the way back, so the field does not close up over time.
 */

import { carOverall } from '../data/teams.ts';
import { Rng, mixSeed } from '../engine/rng.ts';
import type { CarRatings, TeamDef } from '../engine/types.ts';
import type { Career, Delivery, Development, Project, ProjectKind } from './season.ts';

export type Area = keyof CarRatings;

export const AREAS: readonly Area[] = ['power', 'aero', 'chassis', 'reliability', 'pitCrew'];

export const AREA_NAMES: Record<Area, string> = {
  power: 'Power unit',
  aero: 'Aero',
  chassis: 'Chassis',
  reliability: 'Reliability',
  pitCrew: 'Pit crew',
};

/** Every number development uses, in one place so the season script can tune them. */
export const DEVELOPMENT = {
  kinds: [
    // A quick fix costs more per point but always works.
    { kind: 'quick', label: 'Quick fix', rounds: 1, gain: 1, risk: 0, price: 1.3 },
    { kind: 'upgrade', label: 'Upgrade', rounds: 2, gain: 2, risk: 0.2, price: 1 },
    { kind: 'major', label: 'Major package', rounds: 3, gain: 4, risk: 0.35, price: 0.85 },
  ] as const satisfies readonly { kind: ProjectKind; label: string; rounds: number; gain: number; risk: number; price: number }[],
  cap: 99,
  maxProjects: 2,
  /**
   * £m for one point at a rating of 60, rising with the fourth power of the
   * rating's distance towards the cap: a point at 84 costs about half what
   * one at 92 does, so the front of the grid cannot buy its way clear.
   */
  pointCost: 0.45,
  curve: 8,
  /**
   * £m per round for a rival whose car costs what a rating of 80 costs. Each
   * budget is scaled by what the rival's own level costs, so every rival
   * gains about the same points a round and the field does not close up;
   * the strongest gets 10% more and the weakest 10% less on top.
   */
  rivalBudget: 0.27,
  /** Share of every gain lost at the start of each season. */
  drift: 0.25,
  deliveredKeep: 20,
};

const money = (n: number): number => Math.round(n * 100) / 100;

export const kindLabel = (kind: ProjectKind): string => DEVELOPMENT.kinds.find((k) => k.kind === kind)?.label ?? kind;

export function emptyDevelopment(): Development {
  return { gains: {}, projects: [], delivered: [] };
}

export function costPerPoint(rating: number): number {
  const k = Math.max(0, (rating - 60) / (DEVELOPMENT.cap - 60));
  return DEVELOPMENT.pointCost * (1 + DEVELOPMENT.curve * k ** 4);
}

/** Rounds raced in the whole career so far. */
const completed = (career: Career): number => career.roundsBefore + career.results.length;

/** A car with its gains on top. Gains may be fractions; ratings stay whole numbers, so progress shows once it adds up to a point. */
export function developed(car: CarRatings, gains: Partial<CarRatings>): CarRatings {
  const out = { ...car };
  for (const a of AREAS) out[a] = Math.min(DEVELOPMENT.cap, Math.round(car[a] + (gains[a] ?? 0)));
  return out;
}

const playerCar = (career: Career, teams: readonly TeamDef[]): CarRatings | null => {
  const team = teams.find((t) => t.id === career.playerTeamId);
  return team ? developed(team.car, career.development.gains) : null;
};

export interface ProjectOption {
  area: Area;
  kind: ProjectKind;
  label: string;
  rounds: number;
  /** Points the project adds if it goes well; a bad result gives half. */
  gain: number;
  risk: number;
  cost: number;
  /** Why it cannot start now, or null. */
  blocked: string | null;
}

/** Every project the player could start, with its price for the car as it stands. */
export function projectOptions(career: Career, teams: readonly TeamDef[]): ProjectOption[] {
  const car = playerCar(career, teams);
  if (!car) return [];
  const { balance } = career.finance;
  const running = career.development.projects;
  return AREAS.flatMap((area) =>
    DEVELOPMENT.kinds.map((k) => {
      const gain = Math.min(k.gain, DEVELOPMENT.cap - car[area]);
      let cost = 0;
      for (let i = 0; i < gain; i++) cost += costPerPoint(car[area] + i) * k.price;
      cost = money(cost);
      const blocked =
        gain <= 0 ? 'Already at the limit'
        : running.some((p) => p.area === area) ? 'Already being worked on'
        : running.length >= DEVELOPMENT.maxProjects ? `${DEVELOPMENT.maxProjects} projects already running`
        : balance < 0 ? 'Not while the team is in debt'
        : cost > balance ? 'Not enough money'
        : null;
      return { area, kind: k.kind, label: k.label, rounds: k.rounds, gain, risk: k.risk, cost, blocked };
    }),
  );
}

/** Pays for a project and starts building it. Throws if it cannot start; the screen offers only those that can. */
export function startProject(career: Career, teams: readonly TeamDef[], area: Area, kind: ProjectKind): Career {
  const o = projectOptions(career, teams).find((x) => x.area === area && x.kind === kind);
  if (!o || o.blocked) throw new Error(`Cannot start ${kind} on ${area}: ${o?.blocked ?? 'no such project'}`);
  const now = completed(career);
  const project: Project = { area, kind, cost: o.cost, gain: o.gain, startedAt: now, deliverAt: now + o.rounds };
  const line = { season: career.season, round: career.results.length, label: `${o.label}: ${AREA_NAMES[area]}`, amount: -o.cost };
  return {
    ...career,
    finance: { balance: money(career.finance.balance - o.cost), ledger: [line, ...career.finance.ledger] },
    development: { ...career.development, projects: [...career.development.projects, project] },
  };
}

/** After a race: every project whose build time is up arrives, at full gain or half, as the seed decides. */
export function deliverProjects(career: Career): { career: Career; delivered: Delivery[] } {
  const now = completed(career);
  const due = career.development.projects.filter((p) => p.deliverAt <= now);
  if (due.length === 0) return { career, delivered: [] };
  const gains = { ...career.development.gains };
  const delivered = due.map((p): Delivery => {
    const risk = DEVELOPMENT.kinds.find((k) => k.kind === p.kind)?.risk ?? 0;
    const full = !new Rng(mixSeed(career.seed, `project:${p.startedAt}:${p.area}`)).chance(risk);
    const gain = full ? p.gain : Math.ceil(p.gain / 2);
    gains[p.area] = (gains[p.area] ?? 0) + gain;
    return { season: career.season, round: career.results.length - 1, area: p.area, kind: p.kind, gain, full };
  });
  return {
    career: {
      ...career,
      development: {
        gains,
        projects: career.development.projects.filter((p) => p.deliverAt > now),
        delivered: [...delivered, ...career.development.delivered].slice(0, DEVELOPMENT.deliveredKeep),
      },
    },
    delivered,
  };
}

/** The player's development as a new season starts: projects carry on, gains drift back. */
export function carryOver(dev: Development): Development {
  const gains: Development['gains'] = {};
  for (const [area, v] of Object.entries(dev.gains) as [Area, number][]) gains[area] = v * (1 - DEVELOPMENT.drift);
  return { ...dev, gains };
}

/**
 * What every rival has gained so far this career, by team id. Each earlier
 * season is taken to be one full calendar long, as every season is.
 */
export function rivalGains(teams: readonly TeamDef[], career: Career): Record<string, Partial<CarRatings>> {
  const L = career.calendar.length;
  const strengths = teams.map((t) => carOverall(t.car));
  const lo = Math.min(...strengths);
  const hi = Math.max(...strengths);
  const out: Record<string, Partial<CarRatings>> = {};
  for (const team of teams) {
    if (team.id === career.playerTeamId) continue;
    const k = hi === lo ? 0.5 : (carOverall(team.car) - lo) / (hi - lo);
    const level = costPerPoint(carOverall(team.car));
    const gains: Record<Area, number> = { power: 0, aero: 0, chassis: 0, reliability: 0, pitCrew: 0 };
    for (let s = 1; s <= career.season; s++) {
      if (s > 1) for (const a of AREAS) gains[a] *= 1 - DEVELOPMENT.drift;
      const rounds = s < career.season ? L : career.results.length;
      const first = career.roundsBefore - (career.season - s) * L;
      for (let r = 0; r < rounds; r++) {
        const rng = new Rng(mixSeed(career.seed, `rival:${team.id}:${first + r}`));
        const budget = DEVELOPMENT.rivalBudget * (0.9 + 0.2 * k) * (level / costPerPoint(80)) * rng.range(0.75, 1.25);
        const rating = (a: Area) => team.car[a] + gains[a];
        const weakest = AREAS.reduce((a, b) => (rating(b) < rating(a) ? b : a));
        if (rating(weakest) >= DEVELOPMENT.cap) continue;
        gains[weakest] += budget / costPerPoint(rating(weakest));
      }
    }
    const kept: Partial<CarRatings> = {};
    for (const a of AREAS) if (gains[a] > 0) kept[a] = gains[a];
    if (Object.keys(kept).length > 0) out[team.id] = kept;
  }
  return out;
}
