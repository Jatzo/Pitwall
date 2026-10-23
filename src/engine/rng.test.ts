import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Rng, mixSeed } from './rng.ts';

describe('Rng', () => {
  it('is deterministic for a given seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
  });

  it('differs between seeds and stays within [0, 1)', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    assert.notEqual(a.next(), b.next());
    const c = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = c.next();
      assert.ok(v >= 0 && v < 1);
    }
  });

  it('int() is inclusive and normal() has roughly the requested mean and spread', () => {
    const r = new Rng(9);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.int(1, 3));
    assert.deepEqual([...seen].sort(), [1, 2, 3]);

    const n = new Rng(11);
    const samples = Array.from({ length: 5000 }, () => n.normal(10, 2));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const sd = Math.sqrt(samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length);
    assert.ok(Math.abs(mean - 10) < 0.15, `mean ${mean}`);
    assert.ok(Math.abs(sd - 2) < 0.15, `sd ${sd}`);
  });

  it('mixSeed gives independent streams per label', () => {
    assert.notEqual(mixSeed(5, 'a'), mixSeed(5, 'b'));
    assert.equal(mixSeed(5, 'a'), mixSeed(5, 'a'));
  });
});
