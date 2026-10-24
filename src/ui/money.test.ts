import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatAmount, formatMoney } from './money.ts';

describe('money format', () => {
  it('shows millions of pounds to two places', () => {
    assert.equal(formatMoney(21.5), '£21.50m');
    assert.equal(formatMoney(-0.7), '-£0.70m');
  });

  it('signs amounts so income and costs read apart', () => {
    assert.equal(formatAmount(0.6), '+£0.60m');
    assert.equal(formatAmount(-0.77), '-£0.77m');
    assert.equal(formatAmount(0), '£0.00m');
  });
});
