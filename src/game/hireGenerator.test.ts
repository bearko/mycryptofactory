import { describe, it, expect } from 'vitest';
import { generateHireMarket } from './hireGenerator';
import { HIRE_MARKET_SIZE, COMMON_DAILY_WAGE, COMMON_INITIAL_CRAFT_LV } from '../data/balance';

describe('generateHireMarket', () => {
  it('generates HIRE_MARKET_SIZE candidates', () => {
    const market = generateHireMarket({ day: 1 });
    expect(market).toHaveLength(HIRE_MARKET_SIZE);
  });

  it('all candidates are Common rarity in Phase 2', () => {
    const market = generateHireMarket({ day: 5 });
    market.forEach((c) => expect(c.rarity).toBe('Common'));
  });

  it('all candidates have starter wage and craftLv', () => {
    const market = generateHireMarket({ day: 1 });
    market.forEach((c) => {
      expect(c.wage).toBe(COMMON_DAILY_WAGE);
      expect(c.craftLv).toBe(COMMON_INITIAL_CRAFT_LV);
      expect(c.state).toBe('idle');
    });
  });

  it('is deterministic with the same seed', () => {
    const a = generateHireMarket({ day: 7, seed: 'fixed' });
    const b = generateHireMarket({ day: 7, seed: 'fixed' });
    expect(a).toEqual(b);
  });
});
