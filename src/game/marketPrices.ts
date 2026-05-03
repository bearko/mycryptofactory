import type { MaterialType } from './types';
import { BASE_MATERIAL_PRICES, PRICE_CYCLE_DAYS, PRICE_VARIATION } from '../data/balance';

/**
 * Compute market prices for a given day.
 * Deterministic: same day → same prices (no RNG, just sin curve with material-specific phase).
 *
 * Each material has its own phase offset so they don't all peak/dip together — this keeps
 * the player from being able to trivially game the market.
 */
export function pricesForDay(day: number): Record<MaterialType, number> {
  const prices = {} as Record<MaterialType, number>;
  const materials = Object.keys(BASE_MATERIAL_PRICES) as MaterialType[];

  materials.forEach((mat, idx) => {
    const base = BASE_MATERIAL_PRICES[mat];
    // Phase offset per material (golden-ratio-ish, just to spread them out)
    const phaseOffset = (idx * 0.618) % 1;
    const cyclePos = ((day - 1) % PRICE_CYCLE_DAYS) / PRICE_CYCLE_DAYS;
    const angle = (cyclePos + phaseOffset) * 2 * Math.PI;
    const variation = Math.sin(angle) * PRICE_VARIATION;
    prices[mat] = Math.max(1, Math.round(base * (1 + variation)));
  });

  return prices;
}
