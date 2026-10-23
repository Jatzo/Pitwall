/**
 * Every balance knob for the race simulation lives here, so tuning the game is
 * a one-file change. Values were calibrated with `scripts/sim.ts` against
 * real-world ballparks: about 1.5 stops per car, 40-60 on-track overtakes,
 * roughly 0.7 safety cars and 1-2 retirements per race, and a pit-lane time
 * loss of 22-23 seconds.
 */
export const TUNING = {
  /** Lap-time cost per missing point of car rating (out of 100). */
  carSecPerPoint: 0.085,
  /** Lap-time cost per missing point of driver pace rating. */
  driverSecPerPoint: 0.03,
  /** Per-race random "form" of each car, standard deviation in seconds. */
  formSigma: 0.2,
  fuelSecPerKg: 0.03,
  /** Fuel burn per lap at a 5.3 km track. Scaled by lap length. */
  fuelPerLapRef: 1.55,
  fuelMarginKg: 1.5,
  /** Extra time on the first lap of a new set of tyres. */
  warmupPenalty: 0.9,
  paceMode: {
    push: { pace: -0.35, wear: 1.35, fuel: 1.04 },
    standard: { pace: 0, wear: 1, fuel: 1 },
    conserve: { pace: 0.5, wear: 0.78, fuel: 0.93 },
  },
  engineMode: {
    rich: { pace: -0.18, fuel: 1.06, hazard: 1.7 },
    standard: { pace: 0, fuel: 1, hazard: 1 },
    lean: { pace: 0.22, fuel: 0.94, hazard: 0.7 },
  },
  /** Lap-time loss when right behind another car, and the gap it applies within. */
  dirtyAirSeconds: 0.45,
  dirtyAirRange: 1.6,
  drsAdvantage: 0.8,
  drsSpeedBoost: 1.035,
  /** Base overtaking probability per second. Raise for more passing. */
  passRate: 0.1,
  passBoostFactor: 1.06,
  /** Safety car pace as a multiple of the reference lap time. */
  scFactor: 1.65,
  /** Pit lane speed limit in m/s (80 km/h). */
  pitSpeed: 22.2,
  pitDecel: 10,
  maxAccel: 9,
  maxBrake: 40,
  /** Expected race incidents for the whole field (before safety-car odds). */
  incidentsPerRace: 0.35,
  /** Failure probability per race for a car rated 0 reliability. */
  failureAtZeroReliability: 0.35,
  /** Planner's estimate of time lost in the pits (seconds). */
  pitLossPlan: 23,
  /** How much AI teams' strategy choices vary (seconds of cost noise). */
  aiStrategyJitter: 6,
  /** Penalty if a dry race is finished on a single compound. */
  compoundRulePenalty: 30,
} as const;
