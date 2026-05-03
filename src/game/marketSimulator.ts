import type { EXT, ShowcaseItem } from './types';
import {
  SHOWCASE_AGE_BONUS_PER_DAY,
  SHOWCASE_AUTO_DISCOUNT_PER_DAY,
  SHOWCASE_MAX_AGE_BONUS,
  SHOWCASE_MAX_AUTO_DISCOUNT,
  TIER_TABLE,
} from '../data/balance';

/**
 * "Fair" price for an EXT given its tier and quality.
 * Reference value used for slider center and probability calculation.
 */
export function fairPriceForExt(ext: EXT): number {
  const base = TIER_TABLE[ext.tier]?.selfPrice ?? 0;
  return Math.max(1, Math.floor(base * (ext.quality / 100)));
}

export interface SaleContext {
  item: ShowcaseItem;
  /** Demand multiplier for this item's category today. */
  demandFactor: number;
  /** Returns 0..1, called once per call. */
  rng: () => number;
}

export interface SaleOutcome {
  sold: boolean;
  /** GUM revenue if sold (= item.price). */
  revenue: number;
  /** Probability the simulator computed (for diagnostics / future UI tooltip). */
  probability: number;
}

/**
 * Simulate whether a listed showcase item sells today.
 * Pure (deterministic given a seeded rng).
 *
 * Probability logic:
 *   - Sigmoid centered at fair price: 0.5x → ~95%; 1.0x → ~60%; 1.5x → ~20%
 *   - × demandFactor (trending category gets 1.5x, off-trend 0.85x)
 *   - + age bonus (5% per day listed, capped 30%)
 *   - clamped to [0.05, 0.95]
 */
export function simulateSale(ctx: SaleContext): SaleOutcome {
  const fair = fairPriceForExt(ctx.item.ext);
  const ratio = ctx.item.price / Math.max(1, fair);

  // Sigmoid: 0.5x → 0.95, 1.0x → 0.5, 1.5x → 0.05
  const baseProb = 1 - 1 / (1 + Math.exp(-4 * (ratio - 1)));
  const demandAdjusted = baseProb * ctx.demandFactor;

  const ageBonus = Math.min(SHOWCASE_MAX_AGE_BONUS, ctx.item.daysListed * SHOWCASE_AGE_BONUS_PER_DAY);
  const probability = Math.max(0.05, Math.min(0.95, demandAdjusted + ageBonus));

  if (ctx.rng() < probability) {
    return { sold: true, revenue: ctx.item.price, probability };
  }
  return { sold: false, revenue: 0, probability };
}

/**
 * Apply auto-discount to an unsold item: drops the price by SHOWCASE_AUTO_DISCOUNT_PER_DAY,
 * but never below SHOWCASE_MAX_AUTO_DISCOUNT off the original list price (tracked by daysListed).
 */
export function autoDiscount(item: ShowcaseItem): number {
  const totalDiscount = Math.min(
    SHOWCASE_MAX_AUTO_DISCOUNT,
    SHOWCASE_AUTO_DISCOUNT_PER_DAY * (item.daysListed + 1),
  );
  // Discount is relative to "current" price each day; simpler: 10% off current price daily, floor to 70% of original
  return Math.max(
    Math.floor(item.price * (1 - SHOWCASE_AUTO_DISCOUNT_PER_DAY)),
    Math.floor(fairPriceForExt(item.ext) * (1 - totalDiscount)),
  );
}
