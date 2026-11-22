import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import { CAR } from './geometry.ts';
import { WHEELS, carParts } from './car.ts';

describe('3D car', () => {
  it('is built to the car size the view uses: 5.4 m long, 2 m wide, about 1 m high', () => {
    const parts = carParts();
    const all = new THREE.Box3();
    for (const g of [parts.paint, parts.accent, parts.carbon]) {
      g.computeBoundingBox();
      all.union(g.boundingBox as THREE.Box3);
    }
    for (const w of WHEELS) all.union(new THREE.Box3(new THREE.Vector3(w.x - w.radius, 0, w.z - w.width / 2), new THREE.Vector3(w.x + w.radius, 2 * w.radius, w.z + w.width / 2)));
    const size = all.getSize(new THREE.Vector3());
    assert.ok(Math.abs(size.x - CAR.length) < 0.1, `length ${size.x.toFixed(2)}`);
    assert.ok(Math.abs(size.z - CAR.width) < 0.1, `width ${size.z.toFixed(2)}`);
    assert.ok(size.y > 0.9 && size.y < 1.1, `height ${size.y.toFixed(2)}`);
    assert.ok(all.min.y >= 0, 'nothing below the road');
  });

  it('has no broken numbers in any part', () => {
    for (const g of Object.values(carParts())) {
      const p = g.getAttribute('position').array as Float32Array;
      assert.ok(p.every(Number.isFinite));
      assert.ok((g.getAttribute('normal').array as Float32Array).every(Number.isFinite));
    }
  });
});
