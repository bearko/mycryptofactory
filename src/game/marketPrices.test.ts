import { describe, it, expect } from 'vitest';
import { pricesForDay } from './marketPrices';
import { BASE_MATERIAL_PRICES, PRICE_VARIATION } from '../data/balance';

describe('pricesForDay', () => {
  it('returns prices for all material types', () => {
    const prices = pricesForDay(1);
    expect(Object.keys(prices).sort()).toEqual(
      Object.keys(BASE_MATERIAL_PRICES).sort(),
    );
  });

  it('is deterministic — same day yields same prices', () => {
    const a = pricesForDay(7);
    const b = pricesForDay(7);
    expect(a).toEqual(b);
  });

  it('keeps each price within ±25% of base (rounded)', () => {
    for (let day = 1; day <= 30; day++) {
      const prices = pricesForDay(day);
      for (const mat of Object.keys(BASE_MATERIAL_PRICES) as Array<keyof typeof BASE_MATERIAL_PRICES>) {
        const base = BASE_MATERIAL_PRICES[mat];
        const variance = PRICE_VARIATION + 0.01; // +1% rounding tolerance
        expect(prices[mat]).toBeGreaterThanOrEqual(Math.floor(base * (1 - variance)));
        expect(prices[mat]).toBeLessThanOrEqual(Math.ceil(base * (1 + variance)));
      }
    }
  });

  it('all prices are at least 1 GUM', () => {
    for (let day = 1; day <= 30; day++) {
      const prices = pricesForDay(day);
      for (const v of Object.values(prices)) {
        expect(v).toBeGreaterThanOrEqual(1);
      }
    }
  });
});
