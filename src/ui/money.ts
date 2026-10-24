/** Money is held in millions of pounds; these show it the same way on every screen. */

export function formatMoney(m: number): string {
  return `${m < 0 ? '-' : ''}£${Math.abs(m).toFixed(2)}m`;
}

/** An income or a cost, signed so the two read apart in a column. */
export function formatAmount(m: number): string {
  return m > 0 ? `+${formatMoney(m)}` : formatMoney(m);
}
