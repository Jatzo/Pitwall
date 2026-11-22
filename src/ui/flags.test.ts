import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CAMERA_3D_KEY, loadChoice, saveChoice } from './flags.ts';

function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

describe('race-screen choices', () => {
  it('keep the 3D camera off until it is turned on, then remember it', () => {
    const kv = memory();
    assert.equal(loadChoice(CAMERA_3D_KEY, kv), false);
    saveChoice(CAMERA_3D_KEY, true, kv);
    assert.equal(loadChoice(CAMERA_3D_KEY, kv), true);
    saveChoice(CAMERA_3D_KEY, false, kv);
    assert.equal(loadChoice(CAMERA_3D_KEY, kv), false);
  });

  it('read as off when there is no storage', () => {
    assert.equal(loadChoice(CAMERA_3D_KEY, null), false);
  });
});
