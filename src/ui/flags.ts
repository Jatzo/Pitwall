/**
 * Race-screen choices that are off until the player turns them on, and then remembered. The older
 * switches on the race screen work the other way round (on unless turned off), so this is kept apart.
 */

type KeyValue = Pick<Storage, 'getItem' | 'setItem'>;

/** The 3D camera: off by default, because it costs more to draw than the 2D close-up. */
export const CAMERA_3D_KEY = 'pitwall.camera3d';

function storage(): KeyValue | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadChoice(key: string, kv: KeyValue | null = storage()): boolean {
  try {
    return kv?.getItem(key) === 'true';
  } catch {
    return false;
  }
}

export function saveChoice(key: string, on: boolean, kv: KeyValue | null = storage()): void {
  try {
    kv?.setItem(key, String(on));
  } catch {
    // Storage unavailable: the choice lasts for this race only.
  }
}
