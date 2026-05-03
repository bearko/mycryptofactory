import { describe, it, expect } from 'vitest';
import { canAffordMaterials, generateOrders, materialsForOrder } from './orderGenerator';
import { ORDER_BOARD_SIZE, TIER_TABLE } from '../data/balance';
import type { MaterialType } from './types';

describe('generateOrders', () => {
  it('fills the board to ORDER_BOARD_SIZE when empty', () => {
    const orders = generateOrders({
      day: 1,
      tierMax: 2,
      reputationLevel: 50,
      existingCount: 0,
      seed: 'test',
    });
    expect(orders).toHaveLength(ORDER_BOARD_SIZE);
  });

  it('returns 0 orders when board is already full', () => {
    const orders = generateOrders({
      day: 1,
      tierMax: 2,
      reputationLevel: 50,
      existingCount: ORDER_BOARD_SIZE,
      seed: 'test',
    });
    expect(orders).toHaveLength(0);
  });

  it('respects tierMax cap', () => {
    const orders = generateOrders({
      day: 1,
      tierMax: 2,
      reputationLevel: 100,
      existingCount: 0,
      seed: 'test-cap',
    });
    expect(orders.every((o) => o.tier <= 2)).toBe(true);
  });

  it('is deterministic with the same seed', () => {
    const a = generateOrders({ day: 5, tierMax: 3, reputationLevel: 60, existingCount: 0, seed: 'fixed' });
    const b = generateOrders({ day: 5, tierMax: 3, reputationLevel: 60, existingCount: 0, seed: 'fixed' });
    expect(a).toEqual(b);
  });

  it('generated orders have valid tier table fields', () => {
    const orders = generateOrders({ day: 1, tierMax: 5, reputationLevel: 80, existingCount: 0, seed: 'tier-check' });
    orders.forEach((o) => {
      const def = TIER_TABLE[o.tier];
      expect(def).toBeDefined();
      expect(o.reward).toBe(def!.reward);
      expect(o.qualityRequired).toBe(def!.qualityRequired);
      expect(o.repBonus).toBe(def!.repBonus);
    });
  });

  it('higher reputation produces more high-tier orders on average', () => {
    let lowRepHighTierCount = 0;
    let highRepHighTierCount = 0;
    for (let s = 0; s < 50; s++) {
      const lowRep = generateOrders({ day: 1, tierMax: 5, reputationLevel: 20, existingCount: 0, seed: `low-${s}` });
      const highRep = generateOrders({ day: 1, tierMax: 5, reputationLevel: 90, existingCount: 0, seed: `high-${s}` });
      lowRepHighTierCount += lowRep.filter((o) => o.tier >= 3).length;
      highRepHighTierCount += highRep.filter((o) => o.tier >= 3).length;
    }
    expect(highRepHighTierCount).toBeGreaterThan(lowRepHighTierCount);
  });
});

describe('canAffordMaterials', () => {
  const owned: Record<MaterialType, number> = {
    Iron: 5, Wood: 5, Cloth: 2, Gem: 1, Mithril: 0, Orichalcum: 0,
  };

  it('returns true when player has enough', () => {
    expect(canAffordMaterials({ Iron: 2, Wood: 1 }, owned)).toBe(true);
  });

  it('returns false when missing a material', () => {
    expect(canAffordMaterials({ Iron: 10 }, owned)).toBe(false);
  });

  it('returns true for empty requirement', () => {
    expect(canAffordMaterials({}, owned)).toBe(true);
  });
});

describe('materialsForOrder', () => {
  it('returns the per-tier template', () => {
    expect(materialsForOrder(1)).toEqual({ Iron: 1, Wood: 1 });
    expect(materialsForOrder(5)).toEqual({ Iron: 8, Wood: 8, Cloth: 4, Gem: 2 });
  });
});
