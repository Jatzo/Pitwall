import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCircuit } from './circuitBuilder.ts';

describe('buildCircuit', () => {
  const square = buildCircuit([
    [0, 0, 50],
    [1000, 0, 50],
    [1000, 1000, 50],
    [0, 1000, 50],
  ]);

  it('makes a square into four straights and four quarter circles', () => {
    const straights = 4 * (1000 - 2 * 50);
    const arcs = 2 * Math.PI * 50;
    assert.ok(Math.abs(square.length - (straights + arcs)) < 1e-6, `length ${square.length}`);
    assert.equal(square.corners.length, 4);
    for (const c of square.corners) assert.ok(Math.abs(c.angle - 90) < 1e-9);
    assert.ok(Math.abs(square.turning - 360) < 1e-9);
  });

  it('closes: the end of the lap is the start', () => {
    const a = square.sample(0);
    const b = square.sample(square.length - 1e-9);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1e-6);
    assert.deepEqual([a.x, a.y], [500, 0]);
  });

  it('puts each corner apex on its arc, at the radius from the corner centre', () => {
    const first = square.corners[0];
    assert.equal(first.point, 1);
    const p = square.sample(first.s);
    assert.ok(Math.abs(p.kappa - 1 / 50) < 1e-12);
    assert.ok(Math.abs(Math.hypot(p.x - 950, p.y - 50) - 50) < 1e-6);
    assert.ok(Math.abs(square.sample(100).kappa) === 0);
  });

  it('reports the straight either side of the start line', () => {
    assert.deepEqual(square.startStraight, { before: 450, after: 450 });
  });

  it('turns the other way for an anticlockwise lap', () => {
    const anti = buildCircuit([
      [0, 1000, 30],
      [1000, 1000, 30],
      [1000, 0, 30],
      [0, 0, 30],
    ]);
    assert.ok(Math.abs(anti.turning + 360) < 1e-9);
    assert.ok(anti.sample(anti.corners[0].s).kappa < 0);
  });

  it('names the points when two corners do not fit on one straight', () => {
    assert.throws(
      () => buildCircuit([[0, 0, 50], [80, 0, 50], [80, 1000, 50], [0, 1000, 50]]),
      /corners at points 0 and 1 need 100 m but the edge is 80 m/,
    );
  });

  it('rejects a layout that crosses itself', () => {
    assert.throws(
      () => buildCircuit([[0, 0, 10], [1000, 1000, 10], [1000, 0, 10], [0, 1000, 10]]),
      /turns 0 degrees, not 360/,
    );
  });
});
