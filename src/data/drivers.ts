import type { DriverDef } from '../engine/types.ts';

/**
 * Drivers without a seat, whom the player can sign when a contract ends. All
 * fictional. Their ids, codes and numbers differ from every default driver's;
 * a number the editor has since given to someone else is changed on the grid.
 */
export const FREE_AGENTS: readonly DriverDef[] = [
  { id: 'fa-virta', name: 'Aleksi Virta', code: 'VIR', number: 22, ratings: { pace: 88, racecraft: 86, tyreMgmt: 84, consistency: 88, start: 82 } },
  { id: 'fa-castellan', name: 'Noemi Castellan', code: 'CAS', number: 4, ratings: { pace: 86, racecraft: 84, tyreMgmt: 86, consistency: 84, start: 86 } },
  { id: 'fa-morioka', name: 'Kenji Morioka', code: 'MOR', number: 12, ratings: { pace: 84, racecraft: 82, tyreMgmt: 80, consistency: 82, start: 88 } },
  { id: 'fa-achterberg', name: 'Lewin Achterberg', code: 'ACH', number: 19, ratings: { pace: 83, racecraft: 80, tyreMgmt: 84, consistency: 86, start: 78 } },
  { id: 'fa-darwish', name: 'Sami Darwish', code: 'DAR', number: 23, ratings: { pace: 82, racecraft: 82, tyreMgmt: 76, consistency: 76, start: 86 } },
  { id: 'fa-lindholm', name: 'Freya Lindholm', code: 'LHM', number: 2, ratings: { pace: 79, racecraft: 80, tyreMgmt: 80, consistency: 80, start: 80 } },
  { id: 'fa-penrose', name: 'Oliver Penrose', code: 'PEN', number: 6, ratings: { pace: 78, racecraft: 76, tyreMgmt: 82, consistency: 84, start: 76 } },
  { id: 'fa-moura', name: 'Tiago Moura', code: 'MOU', number: 10, ratings: { pace: 80, racecraft: 78, tyreMgmt: 74, consistency: 74, start: 86 } },
];
