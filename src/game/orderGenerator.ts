import seedrandom from 'seedrandom';
import type { Category, MaterialType, Order } from './types';
import {
  ORDER_BOARD_SIZE,
  ORDER_DEADLINE_MAX,
  ORDER_DEADLINE_MIN,
  ORDER_MATERIALS_BY_TIER,
  TIER_TABLE,
} from '../data/balance';

const ALL_CATEGORIES: Category[] = ['Sword', 'Helm', 'Armor', 'Acc'];

interface GenerateParams {
  day: number;
  tierMax: number; // workshop.tierMax — caps the tier of generated orders
  reputationLevel: number; // 0-100, higher reputation → higher reward orders appear more
  existingCount: number; // how many orders already on the board
  seed?: string; // for deterministic tests
}

/**
 * Generate enough new orders to fill the board to ORDER_BOARD_SIZE.
 * Pure function — no side effects, deterministic given a seed.
 */
export function generateOrders(params: GenerateParams): Order[] {
  const { day, tierMax, reputationLevel, existingCount, seed } = params;
  const needed = Math.max(0, ORDER_BOARD_SIZE - existingCount);
  if (needed === 0) return [];

  const rng = seedrandom(seed ?? `day-${day}-${reputationLevel}`);
  const orders: Order[] = [];

  for (let i = 0; i < needed; i++) {
    const category = ALL_CATEGORIES[Math.floor(rng() * ALL_CATEGORIES.length)]!;
    const tier = pickTier(rng, tierMax, reputationLevel);
    const tierDef = TIER_TABLE[tier]!;
    const deadline = ORDER_DEADLINE_MIN + Math.floor(rng() * (ORDER_DEADLINE_MAX - ORDER_DEADLINE_MIN + 1));

    const { bidders, playerEdge } = pickBidContext(rng, tier, reputationLevel);
    orders.push({
      id: `order-d${day}-${i}-${category.toLowerCase()}-t${tier}`,
      category,
      tier,
      qualityRequired: tierDef.qualityRequired,
      deadline,
      reward: tierDef.reward,
      repBonus: tierDef.repBonus,
      bidders,
      playerEdge,
    });
  }

  return orders;
}

/**
 * Phase 3: high-tier orders attract NPC competitors and have a player-edge rating.
 * Tier 1-2 are uncontested.
 */
function pickBidContext(
  rng: () => number,
  tier: number,
  reputation: number,
): { bidders: number; playerEdge: 0 | 1 | 2 | 3 } {
  if (tier < 3) return { bidders: 0, playerEdge: 0 };

  // Bidders scale with tier (T3: 1-3, T4: 2-4, T5: 3-5)
  const minBidders = tier - 2;
  const maxBidders = tier;
  const bidders = minBidders + Math.floor(rng() * (maxBidders - minBidders + 1));

  // playerEdge: derived from reputation with ±1 jitter
  const baseEdge = Math.floor(reputation / 25); // 0..4 (clamped below)
  const jitter = Math.floor(rng() * 3) - 1; // -1, 0, +1
  const edge = Math.max(0, Math.min(3, baseEdge + jitter)) as 0 | 1 | 2 | 3;

  return { bidders, playerEdge: edge };
}

/**
 * Tier distribution biased toward lower tiers when reputation is low.
 * Always respects workshop.tierMax cap.
 */
function pickTier(rng: () => number, tierMax: number, reputation: number): number {
  // Start: mostly Tier 1-2. As reputation grows, more Tier 3+.
  const repFactor = reputation / 100; // 0..1
  const r = rng();
  if (tierMax >= 5 && r < 0.05 + repFactor * 0.10) return 5;
  if (tierMax >= 4 && r < 0.10 + repFactor * 0.15) return 4;
  if (tierMax >= 3 && r < 0.20 + repFactor * 0.20) return 3;
  if (tierMax >= 2 && r < 0.55) return 2;
  return 1;
}

/** Material cost for an order of the given tier. */
export function materialsForOrder(tier: number): Partial<Record<MaterialType, number>> {
  return ORDER_MATERIALS_BY_TIER[tier] ?? {};
}

/** Check whether the player has enough materials to accept an order. */
export function canAffordMaterials(
  required: Partial<Record<MaterialType, number>>,
  available: Record<MaterialType, number>,
): boolean {
  for (const [mat, qty] of Object.entries(required)) {
    if ((available[mat as MaterialType] ?? 0) < (qty ?? 0)) return false;
  }
  return true;
}
