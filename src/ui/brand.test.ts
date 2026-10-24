import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Read as bytes: the app imports this image through Vite, which Node cannot do.
const png = readFileSync(new URL('../assets/jatzo-mark.png', import.meta.url));

/** The PNG's chunk types, in order. */
function chunks(bytes: Buffer): string[] {
  const types: string[] = [];
  for (let at = 8; at < bytes.length; ) {
    const length = bytes.readUInt32BE(at);
    types.push(bytes.toString('latin1', at + 4, at + 8));
    at += 12 + length;
  }
  return types;
}

describe('the Jatzo mark', () => {
  it('is a PNG holding nothing but its image', () => {
    assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const allowed = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']);
    const found = chunks(png);
    assert.deepEqual(found.filter((t) => !allowed.has(t)), []);
    assert.equal(found.at(-1), 'IEND');
  });

  it('carries no record of the tools that made it', () => {
    assert.doesNotMatch(png.toString('latin1'), /c2pa|claude|anthropic/i);
  });
});
