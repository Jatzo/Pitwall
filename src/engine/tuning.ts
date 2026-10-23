/**
 * Every balance knob for the race simulation lives here, so tuning the game is
 * a one-file change. Values are checked with `npm run calibrate` over 300
 * full-distance races; the measured results are listed in docs/DESIGN.md.
 */
export const TUNING = {
  /** Lap-time cost per missing point of car rating (out of 100). */
  carSecPerPoint: 0.07,
  /** Lap-time cost per missing point of driver pace rating. */
  driverSecPerPoint: 0.03,
  /** Per-race random "form" of each car, standard deviation in seconds. */
  formSigma: 0.3,
  /** How well a car suits one qualifying session, shared by both cars of a team, in seconds. */
  qualiTeamSigma: 0.2,
  /**
   * How much of a driver's race-day form shows in qualifying (0 to 1); the rest
   * is that session's own luck. All of it made pole too good a bet in the race.
   */
  qualiFormShare: 0.5,
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
  passRate: 0.125,
  passBoostFactor: 1.06,
  /** Safety car pace as a multiple of the reference lap time. */
  scFactor: 1.65,
  /** Pit lane speed limit in m/s (80 km/h). */
  pitSpeed: 22.2,
  pitDecel: 10,
  maxAccel: 9,
  maxBrake: 40,
  /** Length of a full-distance race. Hazard rates are set per race of this length. */
  referenceRaceKm: 305,
  /** Expected race incidents for the whole field over a full-distance race (before safety-car odds). */
  incidentsPerRace: 0.35,
  /** Failure probability per full-distance race for a car rated 0 reliability. */
  failureAtZeroReliability: 0.35,
  /** An AI car with nobody close ahead saves its tyres once the car behind is this far back (seconds). */
  cruiseGap: 5,
  /** Planner's estimate of time lost in the pits (seconds). */
  pitLossPlan: 23,
  /** How much AI teams' strategy choices vary (seconds of cost noise). */
  aiStrategyJitter: 6,
  /** Lap-time cost of a fully wet track for everyone, on top of any wrong-tyre loss. */
  wetTrackSeconds: 9,
  /** How quickly rain wets the track: the time constant at full strength (seconds). */
  wettingSeconds: 150,
  /** Time constant for the racing line to dry with a full field running (seconds). */
  dryingSeconds: 600,
  /** Off the racing line nobody clears the water, so it dries more slowly (seconds). */
  offlineDryingSeconds: 1500,
  /** Race incidents rise by this factor times wetness. */
  wetIncidentFactor: 3,
  /** Penalty if a dry race is finished on a single compound. */
  compoundRulePenalty: 30,
} as const;
