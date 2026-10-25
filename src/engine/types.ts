/** Shared domain types for the simulation engine. No UI dependencies. */

/** Slick tyres for a dry track: soft, medium, hard. */
export type DryCompound = 'S' | 'M' | 'H';
/** Any tyre a car can carry: the slicks plus intermediates and full wets. */
export type Compound = DryCompound | 'I' | 'W';
export type PaceMode = 'push' | 'standard' | 'conserve';
export type EngineMode = 'rich' | 'standard' | 'lean';
/** How hard the rival teams are to beat. It changes their pace and their pit-wall calls, never the player's cars. */
export type Difficulty = 'easy' | 'medium' | 'hard';

/** All ratings are 0-100. */
export interface DriverRatings {
  pace: number;
  racecraft: number;
  tyreMgmt: number;
  consistency: number;
  start: number;
}

export interface DriverDef {
  id: string;
  name: string;
  code: string;
  number: number;
  ratings: DriverRatings;
}

export interface CarRatings {
  power: number;
  aero: number;
  chassis: number;
  reliability: number;
  pitCrew: number;
}

export type LogoShape = 'shield' | 'circle' | 'hex' | 'chevron' | 'diamond' | 'stripe';

export interface LogoSpec {
  shape: LogoShape;
  initials: string;
  /** Optional uploaded image (data URL). Overrides the generated emblem. */
  imageDataUrl?: string;
}

export interface TeamDef {
  id: string;
  name: string;
  shortName: string;
  colors: { primary: string; secondary: string };
  logo: LogoSpec;
  car: CarRatings;
  drivers: [DriverDef, DriverDef];
}

export interface PlannedStop {
  /** The stop happens at the end of this lap (the "in-lap"). */
  lap: number;
  /** Compound fitted at the stop. */
  compound: Compound;
}

export interface StrategyPlan {
  startCompound: Compound;
  stops: PlannedStop[];
}

export type RaceCommand =
  | { type: 'pace'; carId: string; mode: PaceMode }
  | { type: 'engine'; carId: string; mode: EngineMode }
  /** Request a stop at the next pit entry; null cancels the request. */
  | { type: 'pit'; carId: string; compound: Compound | null }
  | { type: 'plan'; carId: string; plan: StrategyPlan }
  /** Hand a player car over to the AI race engineer (or take it back). */
  | { type: 'auto'; carId: string; enabled: boolean };
