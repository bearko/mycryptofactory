import { describe, it, expect } from 'vitest';
import { resolveDelivery } from './orderResolver';
import type { ActiveCraft, Order } from './types';
import { TIER_TABLE, FAILED_DELIVERY_REP_PENALTY } from '../data/balance';

const baseOrder: Order = {
  id: 'order-1',
  category: 'Sword',
  tier: 2,
  qualityRequired: 40,
  deadline: 2,
  reward: TIER_TABLE[2]!.reward,
  repBonus: TIER_TABLE[2]!.repBonus,
  bidders: 0,
  playerEdge: 0,
};

const baseCraft: ActiveCraft = {
  id: 'craft-1',
  orderId: 'order-1',
  category: 'Sword',
  tier: 2,
  employeeId: 'emp-1',
  daysRemaining: 0,
  quality: 50,
};

describe('resolveDelivery', () => {
  it('returns success when quality meets requirement', () => {
    const o = resolveDelivery({ ...baseCraft, quality: 50 }, baseOrder);
    expect(o.success).toBe(true);
    expect(o.gumDelta).toBe(baseOrder.reward);
    expect(o.repDelta).toBe(baseOrder.repBonus);
  });

  it('returns success at exactly the threshold', () => {
    const o = resolveDelivery({ ...baseCraft, quality: 40 }, baseOrder);
    expect(o.success).toBe(true);
  });

  it('returns failure when quality is below threshold', () => {
    const o = resolveDelivery({ ...baseCraft, quality: 39 }, baseOrder);
    expect(o.success).toBe(false);
    expect(o.gumDelta).toBe(0);
    expect(o.repDelta).toBe(-FAILED_DELIVERY_REP_PENALTY);
  });

  it('returns failure for quality 0 (e.g., Armor explosion)', () => {
    const o = resolveDelivery({ ...baseCraft, quality: 0 }, baseOrder);
    expect(o.success).toBe(false);
  });
});
