import type { KeyValue } from '../replays.ts';

/** In-memory storage that can be told to run out of room. */
export function fakeStorage(limit = Infinity): KeyValue & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      const used = [...data].reduce((s, [key, val]) => s + (key === k ? 0 : val.length), 0);
      if (used + v.length > limit) throw new Error('QuotaExceededError');
      data.set(k, v);
    },
    removeItem: (k) => void data.delete(k),
  };
}
