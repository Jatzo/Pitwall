/**
 * Race simulation.
 *
 * A fixed-timestep simulation. Each car has a position along the lap (total
 * metres from the start line), a speed, tyres, fuel and a strategy. Every tick
 * a car works out how fast it *wants* to go (track speed profile scaled by its
 * current lap-time potential), is limited by the car in front, and moves.
 *
 * Everything is deterministic given the seed and the command log, and there
 * are no UI dependencies.
 */

import { formatLap } from './format.ts';
import { Rng, mixSeed } from './rng.ts';
import { jitterStops, planStrategy } from './strategy.ts';
import type { PlanContext, WearRates } from './strategy.ts';
import { Track } from './track.ts';
import type { TrackDef } from './track.ts';
import { TUNING } from './tuning.ts';
import { COMPOUNDS, bestClass, scaledWearRates, tyreClass, tyrePenalty, weatherPenalty, wetWearFactor } from './tyres.ts';
import type { TyreClass } from './tyres.ts';
import { DRY_WEATHER, RAIN_THRESHOLD, rainAt } from './weather.ts';
import type { WeatherTimeline } from './weather.ts';
import type {
  Compound,
  DriverDef,
  EngineMode,
  PaceMode,
  RaceCommand,
  StrategyPlan,
  TeamDef,
} from './types.ts';

export { TUNING };

export type CarStatus = 'running' | 'pitLane' | 'out' | 'finished';
export type RacePhase = 'grid' | 'racing' | 'finished';

export interface LapRecord {
  lap: number;
  time: number;
  sectors: [number, number, number];
  compound: Compound;
  tyreAge: number;
  pit: boolean;
  /** Counts for fastest-lap purposes (no pit stop, no safety car). */
  clean: boolean;
}

export interface StopRecord {
  lap: number;
  compound: Compound;
  /** Seconds stationary. */
  duration: number;
}

export interface PitState {
  phase: 'in' | 'stopped' | 'out';
  boxDist: number;
  exitDist: number;
  stopEnd: number;
  compound: Compound;
}

export interface CarState {
  readonly id: string;
  readonly team: TeamDef;
  readonly driver: DriverDef;
  readonly grid: number;
  readonly isPlayer: boolean;

  dist: number;
  prevDist: number;
  speed: number;
  lat: number;
  prevLat: number;
  /** Laps completed. */
  lap: number;
  status: CarStatus;

  paceMode: PaceMode;
  engineMode: EngineMode;
  /** When true, the AI race engineer manages this car's modes and unscheduled stops. */
  auto: boolean;
  tyre: { compound: Compound; wear: number; ageLaps: number };
  usedCompounds: Compound[];
  fuel: number;

  plan: StrategyPlan;
  pitRequest: Compound | null;
  pit: PitState | null;
  stops: StopRecord[];

  laps: LapRecord[];
  bestLap: number | null;
  lastLap: number | null;
  lapStartTime: number;
  sectorMarks: [number | null, number | null];
  currentLapPit: boolean;
  currentLapSC: boolean;

  /** Lap time this car could do right now (s). */
  paceNow: number;
  lapNoise: number;
  errorPenalty: number;
  damage: number;
  dirty: number;
  drsOn: boolean;
  drsElig: boolean[];
  passing: { targetId: string; until: number; side: 1 | -1 } | null;
  passCooldown: number;

  reaction: number;
  /** How readily this team gambles on a weather stop: the gain it needs, as a share of a pit stop's cost. */
  readonly weatherCaution: number;
  /** Lap of the last stop made for the conditions, so cars do not swap tyres back and forth. */
  weatherStopLap: number;
  finishTime: number | null;
  penaltySeconds: number;
  outReason: string | null;
  outLap: number | null;

  // Per-tick neighbour info (set before cars update).
  ahead: CarState | null;
  aheadGap: number;

  // Constants derived at creation.
  readonly carDelta: number;
  readonly driverDelta: number;
  readonly wearFactor: number;
  readonly failureRate: number;
  readonly rng: Rng;
  readonly cpTimes: Float64Array;
}

export type EventKind =
  | 'lights'
  | 'pit'
  | 'overtake'
  | 'fastest'
  | 'retire'
  | 'safetycar'
  | 'green'
  | 'finish'
  | 'incident'
  | 'penalty'
  | 'info';

export interface RaceEvent {
  id: number;
  t: number;
  lap: number;
  kind: EventKind;
  carId?: string;
  message: string;
}

export interface RaceConfig {
  track: TrackDef;
  teams: TeamDef[];
  /** Car ids in grid order, pole position first. Car id is `${team.id}:${0|1}`. */
  grid: string[];
  laps: number;
  seed: number;
  playerTeamId: string | null;
  /** Pre-set strategies, keyed by car id (used for player cars). */
  strategies?: Record<string, StrategyPlan>;
  /** The race's rain. Absent means a dry race. */
  weather?: WeatherTimeline;
}

export interface ResultRow {
  position: number;
  carId: string;
  grid: number;
  laps: number;
  finished: boolean;
  /** Total race time including penalties, if the car finished. */
  timeS: number | null;
  /** Gap to the winner in seconds (same lap) or null. */
  gapS: number | null;
  lapsDown: number;
  bestLap: number | null;
  pitStops: number;
  penaltyS: number;
  outReason: string | null;
}

const CP_LEN = 10; // checkpoint spacing for gap timing, metres
/** Laps ahead a team looks when weighing a stop for the conditions. */
const WEATHER_HORIZON_LAPS = 20;

export function carId(team: TeamDef, index: 0 | 1): string {
  return `${team.id}:${index}`;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Laps in a full-distance race at this circuit (about 305 km). */
export function referenceRaceLaps(track: TrackDef): number {
  return Math.ceil((TUNING.referenceRaceKm * 1000) / track.lengthM);
}

/**
 * Expected race incidents per second of racing. The total for a race grows
 * with the square root of its distance, so a short race keeps some of a full
 * race's drama without packing a full race's worth of crashes into a third of
 * the laps.
 */
export function incidentRatePerSecond(laps: number, fullLaps: number, refLapS: number): number {
  const incidents = TUNING.incidentsPerRace * Math.sqrt(laps / fullLaps);
  return incidents / (laps * refLapS);
}

export interface PaceSituation {
  safetyCar: boolean;
  lapsRemaining: number;
  /** Tyre wear, 0 (new) to 1 (finished). */
  wear: number;
  /** Laps until the next planned stop, or null if none is planned. */
  lapsToNextStop: number | null;
  /** Seconds to the car ahead and behind in the classification, or null if there is none. */
  gapAhead: number | null;
  gapBehind: number | null;
}

/**
 * The pace mode an AI driver picks at the start of a lap. A car with nobody to
 * race (no one close ahead, and a comfortable gap behind) saves its tyres, as
 * real leaders do, which keeps winning margins plausible.
 */
export function aiPaceMode(s: PaceSituation): PaceMode {
  if (s.safetyCar) return 'conserve';
  const threatBehind = s.gapBehind !== null && s.gapBehind <= TUNING.cruiseGap;
  if (s.lapsRemaining <= 3 && s.wear < 0.9) {
    // Push to the flag only with a place to win or defend.
    const chasing = s.gapAhead !== null && s.gapAhead <= TUNING.cruiseGap;
    return chasing || threatBehind ? 'push' : 'conserve';
  }
  if (s.wear > 0.8 && !(s.lapsToNextStop !== null && s.lapsToNextStop <= 1)) return 'conserve';
  if (s.gapAhead !== null && s.gapAhead < 1.2 && s.wear < 0.65) return 'push';
  const nothingAhead = s.gapAhead === null || s.gapAhead > 2.5;
  return nothingAhead && !threatBehind ? 'conserve' : 'standard';
}

/** Did a point moving from position a to b (both in [0,L)) cross `line`? */
function crossed(a: number, b: number, line: number): boolean {
  if (b >= a) return a < line && line <= b;
  return line > a || line <= b;
}

export class RaceSim {
  readonly cfg: RaceConfig;
  readonly track: Track;
  readonly totalLaps: number;
  readonly cars: CarState[];
  readonly events: RaceEvent[] = [];
  readonly commandLog: { t: number; cmd: RaceCommand }[] = [];

  phase: RacePhase = 'grid';
  time = 0;
  raceOver = false;
  sc = { active: false, lapsLeft: 0 };
  fastestLap: { carId: string; time: number; lap: number } | null = null;
  /** Number of safety car periods so far. */
  scCount = 0;
  overtakeCount = 0;
  readonly weather: WeatherTimeline;
  /** Rain falling now, 0 to 1. */
  rain = 0;
  /** Water on the racing line and off it, 0 (dry) to 1 (standing water). Cars dry the line. */
  wetness = 0;
  offlineWetness = 0;

  private readonly byId = new Map<string, CarState>();
  private readonly eventRng: Rng;
  private readonly boxFreeAt = new Map<string, number>();
  private standingsCache: CarState[] | null = null;
  private eventSeq = 0;
  private readonly burnPerLap: number;

  constructor(cfg: RaceConfig) {
    this.cfg = cfg;
    this.track = new Track(cfg.track);
    this.totalLaps = cfg.laps;
    this.eventRng = new Rng(mixSeed(cfg.seed, 'race-control'));
    this.weather = cfg.weather ?? DRY_WEATHER;
    // If it is already raining at the start, the track is wet from the first lap.
    this.rain = rainAt(this.weather, 0);
    if (this.rain > RAIN_THRESHOLD) {
      this.wetness = Math.min(1, this.rain * 1.2);
      this.offlineWetness = this.wetness;
    }
    this.burnPerLap = (TUNING.fuelPerLapRef * this.track.length) / 5300;

    const defs = new Map<string, { team: TeamDef; driver: DriverDef }>();
    for (const team of cfg.teams) {
      defs.set(carId(team, 0), { team, driver: team.drivers[0] });
      defs.set(carId(team, 1), { team, driver: team.drivers[1] });
    }
    if (cfg.grid.length !== defs.size) {
      throw new Error(`Grid has ${cfg.grid.length} cars but ${defs.size} are entered`);
    }
    this.cars = cfg.grid.map((id, slot) => {
      const def = defs.get(id);
      if (!def) throw new Error(`Unknown car on grid: ${id}`);
      return this.makeCar(id, def.team, def.driver, slot);
    });
    for (const car of this.cars) this.byId.set(car.id, car);
  }

  // ---------------------------------------------------------------- setup

  private makeCar(id: string, team: TeamDef, driver: DriverDef, slot: number): CarState {
    const { track, cfg } = this;
    const rng = new Rng(mixSeed(cfg.seed, id));
    const w = track.def.weights;
    const perf = team.car.power * w.power + team.car.aero * w.aero + team.car.chassis * w.chassis;
    const form = rng.normal(0, TUNING.formSigma);
    const wearFactor =
      (1.1 - (driver.ratings.tyreMgmt / 100) * 0.25) * (1.1 - (team.car.chassis / 100) * 0.2);
    // Failure risk is per second of a full-distance race, so it does not rise in short races.
    const referenceSeconds = referenceRaceLaps(track.def) * track.refLap;
    const failureRate =
      (((100 - team.car.reliability) / 100) * TUNING.failureAtZeroReliability) / referenceSeconds;
    const isPlayer = team.id === cfg.playerTeamId;

    const car: CarState = {
      id,
      team,
      driver,
      grid: slot + 1,
      isPlayer,
      dist: -(10 + 8 * slot),
      prevDist: -(10 + 8 * slot),
      speed: 0,
      lat: slot % 2 === 0 ? -0.45 : 0.45,
      prevLat: slot % 2 === 0 ? -0.45 : 0.45,
      lap: 0,
      status: 'running',
      paceMode: 'standard',
      engineMode: 'standard',
      auto: false,
      tyre: { compound: 'M', wear: 0, ageLaps: 0 },
      usedCompounds: [],
      fuel: this.totalLaps * this.burnPerLap + TUNING.fuelMarginKg,
      plan: { startCompound: 'M', stops: [] },
      pitRequest: null,
      pit: null,
      stops: [],
      laps: [],
      bestLap: null,
      lastLap: null,
      lapStartTime: 0,
      sectorMarks: [null, null],
      currentLapPit: false,
      currentLapSC: false,
      paceNow: track.refLap,
      lapNoise: 0,
      errorPenalty: 0,
      damage: 0,
      dirty: 0,
      drsOn: false,
      drsElig: track.drsZones.map(() => false),
      passing: null,
      passCooldown: 0,
      reaction: 0.3,
      // A separate stream, so dry races draw exactly what they always drew.
      weatherCaution: new Rng(mixSeed(cfg.seed, `${id}:weather`)).range(0.5, 1.3),
      weatherStopLap: -99,
      finishTime: null,
      penaltySeconds: 0,
      outReason: null,
      outLap: null,
      ahead: null,
      aheadGap: Infinity,
      carDelta: (100 - perf) * TUNING.carSecPerPoint + form,
      driverDelta: (100 - driver.ratings.pace) * TUNING.driverSecPerPoint,
      wearFactor,
      failureRate,
      rng,
      cpTimes: new Float64Array(Math.ceil(((this.totalLaps + 3) * track.length) / CP_LEN)).fill(NaN),
    };

    // Strategy: pre-set (player) or planned (AI, with some variety).
    const preset = cfg.strategies?.[id];
    let plan: StrategyPlan;
    if (preset) {
      plan = preset;
    } else {
      const ctx = this.planContext(car, null, 0);
      plan = planStrategy(isPlayer ? ctx : { ...ctx, jitter: { rng, seconds: TUNING.aiStrategyJitter } });
      if (!isPlayer) plan = jitterStops(plan, rng, 3, 4, this.totalLaps - 3);
      const startClass = this.wetness > 0 ? bestClass(this.wetness) : 'slick';
      if (startClass !== 'slick') plan = { startCompound: startClass === 'inter' ? 'I' : 'W', stops: [] };
    }
    car.plan = { startCompound: plan.startCompound, stops: plan.stops.map((s) => ({ ...s })) };
    car.tyre = { compound: plan.startCompound, wear: 0, ageLaps: 0 };
    car.usedCompounds = [plan.startCompound];
    return car;
  }

  private wearRates(car: CarState): WearRates {
    return scaledWearRates(this.track.def.tyreSeverity * car.wearFactor);
  }

  private planContext(car: CarState, current: Compound | null, wear: number): PlanContext {
    return {
      lapsRemaining: this.totalLaps - car.lap,
      lapsCompleted: car.lap,
      wearRates: this.wearRates(car),
      pitLoss: TUNING.pitLossPlan,
      currentCompound: current,
      currentWear: wear,
      used: car.usedCompounds,
    };
  }

  /** Plan strategy for a driver before the race, for UI suggestions. */
  static suggestPlan(
    track: TrackDef,
    team: TeamDef,
    driver: DriverDef,
    laps: number,
    startCompound: Compound | null,
  ): StrategyPlan {
    const k =
      track.tyreSeverity *
      (1.1 - (driver.ratings.tyreMgmt / 100) * 0.25) *
      (1.1 - (team.car.chassis / 100) * 0.2);
    return planStrategy({
      lapsRemaining: laps,
      lapsCompleted: 0,
      wearRates: scaledWearRates(k),
      pitLoss: TUNING.pitLossPlan,
      currentCompound: startCompound,
      currentWear: 0,
      used: startCompound ? [startCompound] : [],
    });
  }

  carById(id: string): CarState | undefined {
    return this.byId.get(id);
  }

  /** Begin the race (lights out). */
  start(): void {
    if (this.phase !== 'grid') return;
    this.phase = 'racing';
    this.time = 0;
    for (const car of this.cars) {
      const startSkill = car.driver.ratings.start;
      car.reaction = Math.max(0.15, car.rng.normal(0.3 - (startSkill - 80) * 0.003, 0.05));
      car.lapNoise = car.rng.normal(0, this.lapSigma(car));
    }
    this.addEvent('lights', 'Lights out and away we go!');
  }

  // ------------------------------------------------------------- commands

  command(cmd: RaceCommand): void {
    const car = this.byId.get(cmd.carId);
    if (!car || car.status === 'out' || car.status === 'finished') return;
    this.commandLog.push({ t: this.time, cmd });
    switch (cmd.type) {
      case 'pace':
        car.paceMode = cmd.mode;
        break;
      case 'engine':
        car.engineMode = cmd.mode;
        break;
      case 'pit':
        if (!this.raceOver) car.pitRequest = cmd.compound;
        break;
      case 'plan':
        car.plan = { startCompound: cmd.plan.startCompound, stops: cmd.plan.stops.map((s) => ({ ...s })) };
        break;
      case 'auto':
        car.auto = cmd.enabled;
        break;
    }
  }

  // ----------------------------------------------------------------- step

  step(dt: number): void {
    if (this.phase !== 'racing') return;
    this.time += dt;
    this.standingsCache = null;
    this.computeNeighbours();
    this.updateTrack(dt);
    this.updateRaceControl(dt);
    for (const car of this.cars) this.updateCar(car, dt);
    const done = this.cars.every((c) => c.status === 'out' || c.status === 'finished');
    if (done || this.time > 4 * 3600) this.finishRace();
  }

  private computeNeighbours(): void {
    const L = this.track.length;
    const ring = this.cars
      .filter((c) => c.status === 'running')
      .map((c) => ({ c, pos: this.track.wrap(c.dist) }))
      .sort((a, b) => a.pos - b.pos);
    for (const car of this.cars) {
      car.ahead = null;
      car.aheadGap = Infinity;
    }
    const m = ring.length;
    if (m < 2) return;
    for (let i = 0; i < m; i++) {
      const me = ring[i];
      const next = ring[(i + 1) % m];
      const gap = (next.pos - me.pos + L) % L;
      if (gap < 150) {
        me.c.ahead = next.c;
        me.c.aheadGap = gap;
      }
    }
  }

  // --------------------------------------------------------- race control

  private leaderLap(): number {
    let lap = 0;
    for (const c of this.cars) if (c.status !== 'out') lap = Math.max(lap, c.lap);
    return lap;
  }

  private leader(): CarState | null {
    return this.standings().find((c) => c.status !== 'out') ?? null;
  }

  /**
   * Rain wets the track towards a level set by its strength; without rain it
   * dries. Running cars clear the racing line, so the line dries several
   * times faster than the rest of the track (the drying line).
   */
  private updateTrack(dt: number): void {
    const rain = rainAt(this.weather, this.time);
    this.rain = rain;
    if (rain === 0 && this.wetness === 0 && this.offlineWetness === 0) return;
    const target = rain > RAIN_THRESHOLD ? Math.min(1, rain * 1.2) : 0;
    const running = this.cars.filter((c) => c.status === 'running').length / this.cars.length;
    const lineDrying = TUNING.dryingSeconds / (0.3 + 0.7 * running);
    const approach = (value: number, dryingSeconds: number): number => {
      const tau = target > value ? TUNING.wettingSeconds / Math.max(rain, 0.05) : dryingSeconds;
      const next = value + ((target - value) * dt) / tau;
      // Snap back to exactly dry, so a dried-out track behaves like one that never got wet.
      return target === 0 && next < 0.002 ? 0 : next;
    };
    this.wetness = approach(this.wetness, lineDrying);
    this.offlineWetness = approach(this.offlineWetness, TUNING.offlineDryingSeconds);
  }

  private updateRaceControl(dt: number): void {
    if (this.raceOver || this.sc.active) return;
    if (this.leaderLap() >= this.totalLaps - 2) return;
    const perSecond = incidentRatePerSecond(this.totalLaps, referenceRaceLaps(this.track.def), this.track.refLap);
    const startMultiplier = this.time < 30 ? 25 : 1;
    const wetMultiplier = 1 + TUNING.wetIncidentFactor * this.wetness;
    if (!this.eventRng.chance(perSecond * startMultiplier * wetMultiplier * dt)) return;

    const candidates = this.cars.filter((c) => c.status === 'running' && this.time > c.reaction);
    if (candidates.length === 0) return;
    const victim = this.wetness > 0 ? this.pickWetVictim(candidates) : this.eventRng.pick(candidates);
    if (this.eventRng.chance(0.5)) {
      this.addEvent('incident', `${victim.driver.code} is out after contact!`, victim.id);
      this.retire(victim, 'Collision', 0.85);
    } else {
      victim.damage += this.eventRng.range(0.8, 2.2);
      this.addEvent('incident', `${victim.driver.code} has damage after a collision`, victim.id);
      if (this.eventRng.chance(0.4)) this.deploySafetyCar('Debris on track');
      if (victim.isPlayer) {
        this.addEvent('info', `${victim.driver.code}: "I've got damage, we should pit."`, victim.id);
      }
    }
  }

  /** On a wet track, cars on the wrong tyres are far more likely to be the ones that crash. */
  private pickWetVictim(candidates: CarState[]): CarState {
    const weights = candidates.map((c) => 1 + 3 * Math.max(0, weatherPenalty(c.tyre.compound, this.wetness) - 1));
    let roll = this.eventRng.next() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < candidates.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
  }

  private deploySafetyCar(reason: string): void {
    if (this.sc.active || this.raceOver || this.leaderLap() >= this.totalLaps - 2) return;
    this.sc.active = true;
    this.sc.lapsLeft = this.eventRng.int(3, 5);
    this.scCount++;
    for (const car of this.cars) {
      car.passing = null;
      car.drsOn = false;
    }
    this.addEvent('safetycar', `Safety car deployed: ${reason}`);
  }

  private endSafetyCar(): void {
    this.sc.active = false;
    this.sc.lapsLeft = 0;
    this.addEvent('green', 'Green flag - racing resumes');
  }

  /** Where to draw the safety car, if it is out. */
  safetyCarDist(): number | null {
    if (!this.sc.active) return null;
    const lead = this.leader();
    return lead ? lead.dist + 60 : null;
  }

  private retire(car: CarState, reason: string, scChance = 0.6): void {
    const onTrack = car.status === 'running';
    car.status = 'out';
    car.speed = 0;
    car.pit = null;
    car.pitRequest = null;
    car.passing = null;
    car.outReason = reason;
    car.outLap = car.lap + 1;
    this.standingsCache = null;
    this.addEvent('retire', `${car.driver.code} retires: ${reason}`, car.id);
    if (onTrack && this.eventRng.chance(scChance)) {
      this.deploySafetyCar(`${car.driver.code} stopped on track`);
    }
  }

  // ------------------------------------------------------------- per car

  private lapSigma(car: CarState): number {
    return 0.08 + (100 - car.driver.ratings.consistency) * 0.01;
  }

  private paceOf(car: CarState): number {
    const { track } = this;
    if (this.sc.active) return track.refLap * TUNING.scFactor;
    const spec = COMPOUNDS[car.tyre.compound];
    const mode = TUNING.paceMode[car.paceMode];
    const engine = TUNING.engineMode[car.engineMode];
    const warmup = Math.max(0, 1 - car.tyre.ageLaps) * TUNING.warmupPenalty;
    const rubber = Math.min(0.5, (this.time / 3600) * 0.5);
    return (
      track.refLap +
      car.carDelta +
      car.driverDelta +
      spec.paceDelta +
      tyrePenalty(car.tyre.compound, car.tyre.wear) +
      warmup +
      car.fuel * TUNING.fuelSecPerKg +
      mode.pace +
      engine.pace +
      car.lapNoise +
      car.damage +
      car.errorPenalty +
      car.dirty * TUNING.dirtyAirSeconds -
      rubber +
      weatherPenalty(car.tyre.compound, this.wetness) +
      TUNING.wetTrackSeconds * this.wetness
    );
  }

  private relDist(a: CarState, b: CarState): number {
    const L = this.track.length;
    const diff = a.dist - b.dist;
    return ((((diff + L / 2) % L) + L) % L) - L / 2;
  }

  private rollHazards(car: CarState, dt: number): void {
    const engine = TUNING.engineMode[car.engineMode];
    const push = car.paceMode === 'push' ? 1.2 : 1;
    if (car.rng.next() < car.failureRate * engine.hazard * push * dt) {
      this.retire(car, 'Mechanical failure');
      return;
    }
    if (car.fuel <= 0) {
      this.retire(car, 'Out of fuel', 0.7);
      return;
    }
    if (car.tyre.wear > 1.02 && car.rng.next() < 0.2 * (car.tyre.wear - 1) * dt) {
      car.damage += 3;
      car.tyre.wear = 1.02;
      if (car.pitRequest === null) car.pitRequest = this.chooseNextCompound(car);
      this.addEvent('incident', `${car.driver.code} has a puncture!`, car.id);
      if (this.eventRng.chance(0.3)) this.deploySafetyCar('Debris on track');
    }
  }

  private updateCar(car: CarState, dt: number): void {
    if (car.status === 'out') return;
    car.prevDist = car.dist;
    car.prevLat = car.lat;
    if (this.time < car.reaction) return;

    const { track } = this;
    const L = track.length;
    const oldDist = car.dist;
    const oldPos = track.wrap(oldDist);

    if (car.status === 'running') {
      this.rollHazards(car, dt);
      if (car.status !== 'running') return;
    }

    const pace = this.paceOf(car);
    car.paceNow = pace;
    let target = (track.speedAt(oldPos) * track.refLap) / pace;
    if (this.sc.active) car.currentLapSC = true;

    if (car.status === 'finished') {
      target *= 0.55;
    } else if (car.status === 'pitLane') {
      target = this.pitLaneTarget(car, target);
    } else {
      target = this.racingTarget(car, target, oldPos, dt);
    }

    // Accelerate / brake towards the target speed.
    const dv = target - car.speed;
    car.speed += dv > 0 ? Math.min(dv, TUNING.maxAccel * dt) : Math.max(dv, -TUNING.maxBrake * dt);
    if (car.speed < 0) car.speed = 0;

    let newDist = oldDist + car.speed * dt;
    if (car.status === 'pitLane' && car.pit && car.pit.phase === 'in') {
      newDist = Math.min(newDist, car.pit.boxDist);
    }
    car.dist = newDist;
    const ds = newDist - oldDist;
    const tPrev = this.time - dt;

    // Lateral position (cosmetic: drives side-by-side overtakes on the map).
    const latTarget = car.passing ? car.passing.side * 0.9 : 0;
    car.lat += clamp(latTarget - car.lat, -0.8 * dt, 0.8 * dt);

    if (ds <= 0) return;

    // Tyres and fuel.
    if (car.status !== 'finished') {
      const spec = COMPOUNDS[car.tyre.compound];
      const wearMul =
        TUNING.paceMode[car.paceMode].wear *
        (1 + 0.2 * car.dirty) *
        (this.sc.active ? 0.45 : 1) *
        (car.status === 'pitLane' ? 0.2 : 1) *
        wetWearFactor(car.tyre.compound, this.wetness);
      car.tyre.wear += (spec.wearPerLap * track.def.tyreSeverity * car.wearFactor * wearMul * ds) / L;
      car.tyre.ageLaps += ds / L;
      const burn =
        this.burnPerLap *
        TUNING.engineMode[car.engineMode].fuel *
        TUNING.paceMode[car.paceMode].fuel *
        (this.sc.active ? 0.55 : 1);
      car.fuel = Math.max(0, car.fuel - (burn * ds) / L);
    }

    // Checkpoint times for accurate gap calculation.
    let idx = Math.floor(oldDist / CP_LEN) + 1;
    const lastIdx = Math.floor(newDist / CP_LEN);
    for (; idx <= lastIdx; idx++) {
      if (idx >= 0 && idx < car.cpTimes.length) {
        car.cpTimes[idx] = tPrev + (dt * (idx * CP_LEN - oldDist)) / ds;
      }
    }

    const newPos = track.wrap(newDist);
    const timeAt = (line: number): number => {
      const offset = (line - oldPos + L) % L;
      return tPrev + (dt * offset) / ds;
    };

    // Sector lines.
    if (crossed(oldPos, newPos, track.sectorLines[0])) {
      car.sectorMarks[0] = timeAt(track.sectorLines[0]) - car.lapStartTime;
    }
    if (crossed(oldPos, newPos, track.sectorLines[1])) {
      car.sectorMarks[1] = timeAt(track.sectorLines[1]) - car.lapStartTime;
    }

    if (car.status === 'running') {
      // DRS detection points.
      track.drsZones.forEach((zone, zi) => {
        if (crossed(oldPos, newPos, zone.detect)) {
          const a = car.ahead;
          car.drsElig[zi] =
            a !== null && a.status === 'running' && car.aheadGap / Math.max(a.speed, 15) < 1.0;
        }
      });
      // Pit entry.
      if (crossed(oldPos, newPos, track.pitEntryS)) this.atPitEntry(car);
    }

    // Start / finish line (or the pit box, which sits on the line).
    if (newDist >= (car.lap + 1) * L - 1e-6) {
      this.onLapComplete(car, tPrev + (dt * ((car.lap + 1) * L - oldDist)) / ds);
    }
  }

  private racingTarget(car: CarState, free: number, pos: number, dt: number): number {
    const { track } = this;
    const L = track.length;
    let target = free;

    // Safety car bunching: non-leaders may close up when there is a gap.
    const ahead = car.ahead;
    if (this.sc.active && ahead && car.aheadGap > 30) target *= 1.15;

    // Passing state.
    if (car.passing) {
      const victim = this.byId.get(car.passing.targetId);
      if (this.sc.active || !victim || victim.status !== 'running') {
        car.passing = null;
        car.passCooldown = 4;
      } else if (this.relDist(car, victim) > 6) {
        this.logOvertake(car, victim);
        car.passing = null;
        car.passCooldown = 8;
      } else if (this.time > car.passing.until) {
        car.passing = null;
        car.passCooldown = 6;
      }
    }

    // DRS.
    const zone = track.drsAt(pos);
    // Race control disables DRS once the track is properly wet.
    car.drsOn = !this.sc.active && this.wetness < 0.3 && car.lap >= 2 && zone >= 0 && car.drsElig[zone];
    if (car.drsOn) target *= TUNING.drsSpeedBoost;
    if (car.passing) target *= TUNING.passBoostFactor;

    // Traffic.
    car.dirty = 0;
    car.passCooldown = Math.max(0, car.passCooldown - dt);
    if (ahead && car.aheadGap < 90) {
      const gapT = car.aheadGap / Math.max(ahead.speed, 15);
      const ignoring = car.passing !== null && car.passing.targetId === ahead.id;
      if (!this.sc.active && gapT < TUNING.dirtyAirRange) car.dirty = 1 - gapT / TUNING.dirtyAirRange;

      let blocked = false;
      if (!ignoring) {
        const hard = this.sc.active ? 12 : 7;
        const cap = ahead.speed + (car.aheadGap - hard) * 0.9;
        if (target > cap) {
          target = Math.max(0, cap);
          blocked = true;
        }
      }

      if (blocked && !this.sc.active && !car.passing && car.passCooldown <= 0 && gapT < 1.1) {
        const lapped = car.dist - ahead.dist > L * 0.5;
        let p: number;
        if (lapped) {
          p = 0.9;
        } else {
          const advantage =
            ahead.paceNow -
            car.paceNow +
            (car.drsOn ? TUNING.drsAdvantage : 0) +
            (car.driver.ratings.racecraft - ahead.driver.ratings.racecraft) * 0.004;
          // Off the racing line the track stays wet for longer, so passing gets harder.
          const ease = (track.overtakeAt(pos) / track.def.overtakingDifficulty) * (1 - 0.6 * this.offlineWetness);
          p = Math.max(0, advantage + 0.15) * TUNING.passRate * ease;
        }
        if (car.rng.next() < p * dt) {
          car.passing = {
            targetId: ahead.id,
            until: this.time + 9,
            side: (car.lap + car.grid) % 2 === 0 ? 1 : -1,
          };
        }
      }
    }
    return target;
  }

  private logOvertake(car: CarState, victim: CarState): void {
    const lapped = car.dist - victim.dist > this.track.length * 0.5;
    if (lapped) return;
    this.overtakeCount++;
    const pos = this.standings().indexOf(car) + 1;
    this.addEvent('overtake', `${car.driver.code} passes ${victim.driver.code} for P${pos}`, car.id);
  }

  // ------------------------------------------------------------ pit stops

  private atPitEntry(car: CarState): void {
    if (this.raceOver) return;
    const inProgress = car.lap + 1;
    if (inProgress >= this.totalLaps) return;
    let compound: Compound | null = car.pitRequest;
    const next = car.plan.stops[0];
    if (compound === null && next && inProgress >= next.lap) {
      // Rival teams fit what the conditions call for, not the dry plan, once rain is about.
      const aiCar = !car.isPlayer || car.auto;
      compound = aiCar && (this.wetness > 0 || this.rain > 0) ? this.chooseNextCompound(car) : next.compound;
    }
    if (compound === null) return;

    const L = this.track.length;
    car.status = 'pitLane';
    car.currentLapPit = true;
    car.passing = null;
    car.drsOn = false;
    car.pit = {
      phase: 'in',
      boxDist: (car.lap + 1) * L,
      exitDist: (car.lap + 1) * L + this.track.pitExitM,
      stopEnd: 0,
      compound,
    };
    car.pitRequest = null;
  }

  private stopDuration(car: CarState): number {
    const base = 2.2 + (100 - car.team.car.pitCrew) * 0.02;
    let d = car.rng.normal(base, 0.25);
    if (car.rng.chance(0.04)) d += car.rng.range(2, 5);
    return Math.max(1.8, d);
  }

  private pitLaneTarget(car: CarState, racing: number): number {
    const ps = car.pit;
    if (!ps) {
      car.status = 'running';
      return racing;
    }
    if (ps.phase === 'in') {
      const remaining = ps.boxDist - car.dist;
      if (remaining <= 0.3) {
        car.dist = ps.boxDist;
        car.speed = 0;
        ps.phase = 'stopped';
        const start = Math.max(this.time, this.boxFreeAt.get(car.team.id) ?? 0);
        const duration = this.stopDuration(car);
        ps.stopEnd = start + duration;
        this.boxFreeAt.set(car.team.id, ps.stopEnd);
        car.stops.push({ lap: car.lap + 1, compound: ps.compound, duration });
        return 0;
      }
      return Math.min(TUNING.pitSpeed, Math.sqrt(2 * TUNING.pitDecel * remaining), racing);
    }
    if (ps.phase === 'stopped') {
      if (this.time < ps.stopEnd) return 0;
      this.completeStop(car, ps);
      ps.phase = 'out';
      return Math.min(TUNING.pitSpeed, racing);
    }
    if (car.dist >= ps.exitDist) {
      car.status = 'running';
      car.pit = null;
      return racing;
    }
    return Math.min(TUNING.pitSpeed, racing);
  }

  private completeStop(car: CarState, ps: PitState): void {
    const wasPlanned = car.plan.stops.length > 0 && car.plan.stops[0].compound === ps.compound;
    car.tyre = { compound: ps.compound, wear: 0, ageLaps: 0 };
    if (!car.usedCompounds.includes(ps.compound)) car.usedCompounds.push(ps.compound);
    car.damage = 0;
    const stop = car.stops[car.stops.length - 1];
    this.addEvent(
      'pit',
      `${car.driver.code} pits for ${COMPOUNDS[ps.compound].name.toLowerCase()} tyres (${stop ? stop.duration.toFixed(1) : '?'}s)`,
      car.id,
    );
    // Update the plan for the remaining laps. On wet-weather tyres there is
    // no dry plan to follow: the next stop comes when the conditions change.
    if (tyreClass(ps.compound) !== 'slick') {
      car.plan = { startCompound: ps.compound, stops: [] };
    } else if (wasPlanned) {
      car.plan.stops.shift();
    } else {
      const ctx = this.planContext(car, ps.compound, 0);
      car.plan = planStrategy(
        car.isPlayer ? ctx : { ...ctx, jitter: { rng: car.rng, seconds: TUNING.aiStrategyJitter / 2 } },
      );
    }
  }

  /**
   * Seconds each tyre class would lose to the conditions over the next
   * `laps` laps, if the rain falling now carries on: the racing line is
   * projected lap by lap with the same wetting and drying model the race
   * uses. Rivals judge only the rain they can see; the forecast is the
   * player's edge.
   */
  private projectedClassCost(laps: number): Record<TyreClass, number> {
    const target = this.rain > RAIN_THRESHOLD ? Math.min(1, this.rain * 1.2) : 0;
    const running = this.cars.filter((c) => c.status === 'running').length / this.cars.length;
    const tau =
      target > this.wetness ? TUNING.wettingSeconds / Math.max(this.rain, 0.05) : TUNING.dryingSeconds / (0.3 + 0.7 * running);
    const cost: Record<TyreClass, number> = { slick: 0, inter: 0, wet: 0 };
    for (let k = 1; k <= laps; k++) {
      const w = target + (this.wetness - target) * Math.exp((-k * this.track.refLap) / tau);
      cost.slick += weatherPenalty('M', w);
      cost.inter += weatherPenalty('I', w);
      cost.wet += weatherPenalty('W', w);
    }
    return cost;
  }

  /** The tyre class that loses least to the conditions over the next laps. */
  private bestProjectedClass(laps: number): TyreClass {
    const cost = this.projectedClassCost(laps);
    let best: TyreClass = 'slick';
    for (const cls of ['inter', 'wet'] as const) if (cost[cls] < cost[best]) best = cls;
    return best;
  }

  /** The tyre to fit at an unplanned stop: whatever suits the conditions, and the planner's pick when dry. */
  private chooseNextCompound(car: CarState): Compound {
    if (this.wetness === 0 && this.rain === 0) return this.chooseDryCompound(car);
    const wanted = this.bestProjectedClass(Math.max(1, Math.min(this.totalLaps - car.lap, WEATHER_HORIZON_LAPS)));
    if (wanted === 'inter') return 'I';
    if (wanted === 'wet') return 'W';
    return this.chooseDryCompound(car);
  }

  private chooseDryCompound(car: CarState): Compound {
    const ctx = this.planContext(car, null, 0);
    const plan = planStrategy({ ...ctx, lapsRemaining: Math.max(1, ctx.lapsRemaining - 1) });
    return plan.startCompound;
  }

  // -------------------------------------------------------------- laps

  private isLeader(car: CarState): boolean {
    for (const o of this.cars) {
      if (o !== car && o.status !== 'out' && o.dist > car.dist) return false;
    }
    return true;
  }

  private onLapComplete(car: CarState, tCross: number): void {
    const lapTime = tCross - car.lapStartTime;
    const m1 = car.sectorMarks[0] ?? lapTime / 3;
    const m2 = car.sectorMarks[1] ?? (2 * lapTime) / 3;
    const sectors: [number, number, number] = [m1, m2 - m1, lapTime - m2];
    const wasLeader = this.isLeader(car);
    const clean = !car.currentLapPit && !car.currentLapSC && car.lap >= 1;
    const lapNo = car.lap + 1;
    car.laps.push({
      lap: lapNo,
      time: lapTime,
      sectors,
      compound: car.tyre.compound,
      tyreAge: car.tyre.ageLaps,
      pit: car.currentLapPit,
      clean,
    });
    car.lastLap = lapTime;
    if (clean) {
      if (car.bestLap === null || lapTime < car.bestLap) car.bestLap = lapTime;
      if (!this.fastestLap || lapTime < this.fastestLap.time) {
        const first = this.fastestLap === null;
        this.fastestLap = { carId: car.id, time: lapTime, lap: lapNo };
        if (!first || lapNo > 1) {
          this.addEvent('fastest', `Fastest lap: ${car.driver.code} ${formatLap(lapTime)}`, car.id);
        }
      }
    }

    car.lap = lapNo;
    car.lapStartTime = tCross;
    car.sectorMarks = [null, null];
    car.currentLapSC = this.sc.active;
    car.currentLapPit = car.status === 'pitLane';
    car.lapNoise = car.rng.normal(0, this.lapSigma(car));
    car.errorPenalty = 0;
    if (car.status === 'running' && car.rng.chance((100 - car.driver.ratings.consistency) * 0.0003)) {
      car.errorPenalty = car.rng.range(2, 6);
      this.addEvent('incident', `${car.driver.code} locks up and runs wide`, car.id);
    }

    // Safety car countdown happens when the leader crosses the line.
    if (this.sc.active && wasLeader) {
      this.sc.lapsLeft--;
      if (this.sc.lapsLeft === 1) this.addEvent('safetycar', 'Safety car in this lap');
      if (this.sc.lapsLeft <= 0) this.endSafetyCar();
    }

    // Race end.
    if (!this.raceOver && car.lap >= this.totalLaps) {
      this.raceOver = true;
      this.addEvent('finish', `${car.driver.code} wins the race!`, car.id);
    }
    if (this.raceOver && car.status !== 'out') {
      car.status = 'finished';
      car.pit = null;
      car.finishTime = tCross;
      // Running intermediates or wets waives the rule, as in real racing.
      const ranWetTyres = car.usedCompounds.some((c) => tyreClass(c) !== 'slick');
      if (car.usedCompounds.length < 2 && !ranWetTyres) {
        car.penaltySeconds = TUNING.compoundRulePenalty;
        this.addEvent(
          'penalty',
          `${car.driver.code}: +${TUNING.compoundRulePenalty}s for using only one compound`,
          car.id,
        );
      }
      this.standingsCache = null;
      return;
    }

    if ((!car.isPlayer || car.auto) && car.status === 'running') this.aiLapStart(car);
  }

  private aiLapStart(car: CarState): void {
    const remaining = this.totalLaps - car.lap;
    const wear = car.tyre.wear;
    const next = car.plan.stops[0];

    // Pace and engine modes.
    const order = this.standings();
    const behind = order[order.indexOf(car) + 1];
    car.paceMode = aiPaceMode({
      safetyCar: this.sc.active,
      lapsRemaining: remaining,
      wear,
      lapsToNextStop: next ? next.lap - car.lap : null,
      gapAhead: this.gapToAhead(car),
      gapBehind: behind && behind.status !== 'out' ? this.gapToAhead(behind) : null,
    });
    const spare = car.fuel - remaining * this.burnPerLap;
    car.engineMode = spare < 0.3 ? 'lean' : spare > 2.5 && remaining <= 5 ? 'rich' : 'standard';

    if (this.wetness > 0 || this.rain > 0 || tyreClass(car.tyre.compound) !== 'slick') this.aiWeatherCall(car, remaining);

    // Unscheduled stops.
    if (car.pitRequest !== null || remaining <= 2) return;
    if (wear > 0.93 && (!next || next.lap > car.lap + 1)) {
      car.pitRequest = this.chooseNextCompound(car);
    } else if (this.sc.active && car.tyre.ageLaps >= 6 && remaining >= 8) {
      car.pitRequest = next && next.lap - car.lap <= 10 ? next.compound : this.chooseNextCompound(car);
    }
  }

  /**
   * Switch to the tyre class the conditions call for, once the time it gains
   * over the next few laps covers the cost of the stop. Each team needs a
   * different margin before it commits, so rivals split on when to stop.
   */
  private aiWeatherCall(car: CarState, remaining: number): void {
    const horizon = Math.max(1, Math.min(remaining, WEATHER_HORIZON_LAPS));
    const cost = this.projectedClassCost(horizon);
    const current: TyreClass = tyreClass(car.tyre.compound);
    let wanted: TyreClass = 'slick';
    for (const cls of ['inter', 'wet'] as const) if (cost[cls] < cost[wanted]) wanted = cls;
    if (wanted === current || car.pitRequest !== null || remaining <= 2) return;
    if (car.lap - car.weatherStopLap < 3) return;
    if (cost[current] - cost[wanted] > TUNING.pitLossPlan * car.weatherCaution) {
      car.pitRequest = this.chooseNextCompound(car);
      car.weatherStopLap = car.lap;
    }
  }

  // ----------------------------------------------------- classification

  /** Cars in race order. The result is cached until the next step. */
  standings(): CarState[] {
    if (this.standingsCache) return this.standingsCache;
    const order = [...this.cars].sort((a, b) => {
      if ((a.status === 'out') !== (b.status === 'out')) return a.status === 'out' ? 1 : -1;
      if (a.lap !== b.lap) return b.lap - a.lap;
      const af = a.finishTime !== null;
      const bf = b.finishTime !== null;
      if (a.finishTime !== null && b.finishTime !== null) {
        return a.finishTime + a.penaltySeconds - (b.finishTime + b.penaltySeconds);
      }
      if (af !== bf) return af ? -1 : 1;
      return b.dist - a.dist;
    });
    this.standingsCache = order;
    return order;
  }

  /** Seconds `behind` needs to reach where `ahead` is now, or null if unknown. */
  timeBetween(behind: CarState, ahead: CarState): number | null {
    const d = behind.dist;
    if (d < 0) return null;
    const idx = Math.floor(d / CP_LEN);
    if (idx + 1 >= ahead.cpTimes.length) return null;
    const t0 = ahead.cpTimes[idx];
    if (Number.isNaN(t0)) return null;
    const t1 = ahead.cpTimes[idx + 1];
    const frac = (d - idx * CP_LEN) / CP_LEN;
    const tAhead = Number.isNaN(t1)
      ? t0 + (d - idx * CP_LEN) / Math.max(ahead.speed, 10)
      : t0 + (t1 - t0) * frac;
    return Math.max(0, this.time - tAhead);
  }

  /**
   * Gap between two classified cars. Once both have taken the flag it is the
   * difference in finishing time, because cars slow down and bunch up on the
   * lap after the line and the track gap stops meaning anything.
   */
  private classifiedGap(car: CarState, ahead: CarState): number | null {
    if (car.finishTime !== null && ahead.finishTime !== null && car.lap === ahead.lap) {
      return car.finishTime + car.penaltySeconds - (ahead.finishTime + ahead.penaltySeconds);
    }
    return this.timeBetween(car, ahead);
  }

  /** Gap (s) to the car directly ahead in the classification. */
  gapToAhead(car: CarState): number | null {
    const order = this.standings();
    const i = order.indexOf(car);
    if (i <= 0 || car.status === 'out') return null;
    return this.classifiedGap(car, order[i - 1]);
  }

  /** Gap (s) to the leader, or the number of laps down. */
  gapToLeader(car: CarState): { seconds: number | null; lapsDown: number } {
    const lead = this.standings()[0];
    if (!lead || lead === car) return { seconds: 0, lapsDown: 0 };
    const lapsDown = car.finishTime !== null ? lead.lap - car.lap : Math.floor((lead.dist - car.dist) / this.track.length);
    if (lapsDown >= 1) return { seconds: null, lapsDown };
    return { seconds: this.classifiedGap(car, lead), lapsDown: 0 };
  }

  /** Final classification (valid once the race is finished). */
  results(): ResultRow[] {
    const order = this.standings();
    const winner = order[0];
    const winnerTime =
      winner && winner.finishTime !== null ? winner.finishTime + winner.penaltySeconds : null;
    return order.map((car, i) => {
      const finished = car.finishTime !== null;
      const timeS = car.finishTime !== null ? car.finishTime + car.penaltySeconds : null;
      const sameLap = winner !== undefined && car.lap === winner.lap;
      return {
        position: i + 1,
        carId: car.id,
        grid: car.grid,
        laps: car.lap,
        finished,
        timeS,
        gapS: timeS !== null && sameLap && winnerTime !== null ? timeS - winnerTime : null,
        lapsDown: winner ? winner.lap - car.lap : 0,
        bestLap: car.bestLap,
        pitStops: car.stops.length,
        penaltyS: car.penaltySeconds,
        outReason: car.outReason,
      };
    });
  }

  private finishRace(): void {
    if (this.phase === 'finished') return;
    this.phase = 'finished';
    this.raceOver = true;
    this.standingsCache = null;
  }

  private addEvent(kind: EventKind, message: string, carIdValue?: string): void {
    this.events.push({
      id: this.eventSeq++,
      t: this.time,
      lap: Math.min(this.totalLaps, this.leaderLap() + 1),
      kind,
      carId: carIdValue,
      message,
    });
  }
}
