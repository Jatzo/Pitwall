import type { Difficulty } from '../engine/types.ts';

/** The three levels in menu order, with the names the player sees. */
export const DIFFICULTY_LEVELS: readonly { id: Difficulty; name: string }[] = [
  { id: 'easy', name: 'Easy' },
  { id: 'medium', name: 'Medium' },
  { id: 'hard', name: 'Hard' },
];

export function difficultyName(id: Difficulty): string {
  return DIFFICULTY_LEVELS.find((l) => l.id === id)?.name ?? id;
}
