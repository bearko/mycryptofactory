import { describe, it, expect } from 'vitest';
import seedrandom from 'seedrandom';
import { autoDiscount, fairPriceForExt, simulateSale } from './marketSimulator';
import type { EXT, ShowcaseItem } from './types';
import { TIER_TABLE } from '../data/balance';

const mkExt = (overrides: Partial<EXT> = {}): EXT => ({
  id: 'ext-1',
  tier: 2,
  category: 'Sword',
  quality: 80,
  craftDays: 1,
  materialCost: {},
  hypeBonus: 0,
  ...overrides,
});

const mkItem = (overrides: Partial<ShowcaseItem> = {}): ShowcaseItem => ({
  id: 'show-1',
  ext: mkExt(),
  price: fairPriceForExt(mkExt()),
  daysListed: 0,
  ...overrides,
});

describe('fairPriceForExt', () => {
  it('scales with quality', () => {
    const ext100 = mkExt({ quality: 100 });
    const ext50 = mkExt({ quality: 50 });
    expect(fairPriceForExt(ext100)).toBe(TIER_TABLE[2]!.selfPrice);
    expect(fairPriceForExt(ext50)).toBe(Math.floor(TIER_TABLE[2]!.selfPrice * 0.5));
  });

  it('always returns at least 1', () => {
    const ext = mkExt({ quality: 0, tier: 1 });
    expect(fairPriceForExt(ext)).toBeGreaterThanOrEqual(1);
  });
});

describe('simulateSale', () => {
  it('cheap items (0.5x fair) sell often', () => {
    const fair = fairPriceForExt(mkExt());
    let sold = 0;
    for (let s = 0; s < 100; s++) {
      const rng = seedrandom(`cheap-${s}`);
      const item = mkItem({ price: Math.floor(fair * 0.5) });
      if (simulateSale({ item, demandFactor: 1.0, rng: () => rng() }).sold) sold++;
    }
    expect(sold).toBeGreaterThan(70);
  });

  it('expensive items (2x fair) rarely sell', () => {
    const fair = fairPriceForExt(mkExt());
    let sold = 0;
    for (let s = 0; s < 100; s++) {
      const rng = seedrandom(`exp-${s}`);
      const item = mkItem({ price: Math.floor(fair * 2.0) });
      if (simulateSale({ item, demandFactor: 1.0, rng: () => rng() }).sold) sold++;
    }
    expect(sold).toBeLessThan(30);
  });

  it('higher demand factor increases sale rate', () => {
    const fair = fairPriceForExt(mkExt());
    let lowDemand = 0;
    let highDemand = 0;
    for (let s = 0; s < 100; s++) {
      const rng1 = seedrandom(`d-low-${s}`);
      const rng2 = seedrandom(`d-high-${s}`);
      const item = mkItem({ price: fair });
      if (simulateSale({ item, demandFactor: 0.85, rng: () => rng1() }).sold) lowDemand++;
      if (simulateSale({ item, demandFactor: 1.5, rng: () => rng2() }).sold) highDemand++;
    }
    expect(highDemand).toBeGreaterThan(lowDemand);
  });

  it('age bonus increases probability for old listings', () => {
    const fair = fairPriceForExt(mkExt());
    const result = simulateSale({
      item: mkItem({ price: fair, daysListed: 10 }),
      demandFactor: 1.0,
      rng: () => 0.5,
    });
    expect(result.probability).toBeGreaterThan(0.5);
  });

  it('returns revenue equal to listed price when sold', () => {
    const item = mkItem({ price: 1234 });
    const out = simulateSale({ item, demandFactor: 2.0, rng: () => 0.0 });
    expect(out.sold).toBe(true);
    expect(out.revenue).toBe(1234);
  });

  it('probability is clamped to [0.05, 0.95]', () => {
    const expensive = simulateSale({
      item: mkItem({ price: 100_000 }),
      demandFactor: 0.1,
      rng: () => 0.5,
    });
    expect(expensive.probability).toBeGreaterThanOrEqual(0.05);
    expect(expensive.probability).toBeLessThanOrEqual(0.95);
  });
});

describe('autoDiscount', () => {
  it('reduces the price', () => {
    const item = mkItem({ price: 1000 });
    expect(autoDiscount(item)).toBeLessThan(item.price);
  });
});
