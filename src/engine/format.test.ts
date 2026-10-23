import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatGap, formatLap, formatRaceTime } from './format.ts';

describe('formatting', () => {
  it('shows lap times as minutes, seconds and thousandths', () => {
    assert.equal(formatLap(84.5123), '1:24.512');
    assert.equal(formatLap(59.9), '0:59.900');
  });

  it('shows gaps with a plus sign, and in minutes past sixty seconds', () => {
    assert.equal(formatGap(1.2345), '+1.234');
    assert.equal(formatGap(75), '+1:15.000');
    assert.equal(formatGap(null), '--');
  });

  it('leaves the hour off race times shorter than an hour', () => {
    assert.equal(formatRaceTime(33 * 60 + 7.424), '33:07.424');
    assert.equal(formatRaceTime(3600 + 24 * 60 + 36.512), '1:24:36.512');
  });
});
