import type { ResultRow } from './race.ts';

/** Points for positions 1-10, as in the modern grand prix system. */
export const POINTS_TABLE: readonly number[] = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

export function pointsForPosition(position: number): number {
  return POINTS_TABLE[position - 1] ?? 0;
}

export interface ScoredRow extends ResultRow {
  points: number;
  fastestLap: boolean;
}

/**
 * Award points to a classification. The fastest-lap point only goes to a
 * driver who finishes in the top ten.
 */
export function scoreRace(rows: readonly ResultRow[], fastestLapCarId: string | null): ScoredRow[] {
  return rows.map((row) => {
    const classified = row.finished;
    const fl = classified && row.position <= 10 && row.carId === fastestLapCarId;
    return {
      ...row,
      points: (classified ? pointsForPosition(row.position) : 0) + (fl ? 1 : 0),
      fastestLap: row.carId === fastestLapCarId,
    };
  });
}
