/**
 * Single source of truth for game balance constants.
 * Tweak this file (and only this file) to rebalance the game.
 *
 * SPEC-001 §6 / 仕様書 v3 §3 に基づく初期値。Day 7 で balance-tester による調整が入る前提。
 */
import type { MaterialType } from '../game/types';

// --- Initial player state ---
export const INITIAL_GUM = 500;
export const INITIAL_REPUTATION = 50;

// --- Material market ---
export const BASE_MATERIAL_PRICES: Record<MaterialType, number> = {
  Iron: 30,
  Wood: 25,
  Cloth: 35,
  Gem: 80,
  Mithril: 300,
  Orichalcum: 800,
};

/**
 * Daily price variation: ±25% sinusoidal over a 3-day cycle, with deterministic per-material phase offset.
 */
export const PRICE_CYCLE_DAYS = 3;
export const PRICE_VARIATION = 0.25;

// --- Tier table (仕様書 v3 §3) ---
export interface TierDef {
  reward: number;
  selfPrice: number;
  craftDays: number;
  qualityRequired: number;
  repBonus: number;
}

export const TIER_TABLE: Record<number, TierDef> = {
  1: { reward: 150, selfPrice: 200, craftDays: 1, qualityRequired: 30, repBonus: 1 },
  2: { reward: 400, selfPrice: 600, craftDays: 1, qualityRequired: 40, repBonus: 2 },
  3: { reward: 1000, selfPrice: 1800, craftDays: 2, qualityRequired: 50, repBonus: 4 },
  4: { reward: 2500, selfPrice: 5000, craftDays: 3, qualityRequired: 60, repBonus: 7 },
  5: { reward: 7000, selfPrice: 15000, craftDays: 4, qualityRequired: 70, repBonus: 12 },
};

/**
 * Materials required to craft an EXT of the given tier.
 * Same shape regardless of category for now (Phase 1 simplification).
 */
export const ORDER_MATERIALS_BY_TIER: Record<number, Partial<Record<MaterialType, number>>> = {
  1: { Iron: 1, Wood: 1 },
  2: { Iron: 2, Wood: 2 },
  3: { Iron: 3, Wood: 3, Cloth: 1 },
  4: { Iron: 5, Wood: 5, Cloth: 2, Gem: 1 },
  5: { Iron: 8, Wood: 8, Cloth: 4, Gem: 2 },
};

// --- Bankrupt / failure handling ---
export const BANKRUPT_DAYS = 3; // GUM<0 for N consecutive days → game over
export const FAILED_DELIVERY_REP_PENALTY = 5;
export const EXPIRED_ORDER_REP_PENALTY = 0; // Phase 1: no penalty for ignoring orders

// --- Order generation ---
export const ORDER_BOARD_SIZE = 5; // Target number of orders on board
export const ORDER_DEADLINE_MIN = 2;
export const ORDER_DEADLINE_MAX = 4;

// --- Feature unlock thresholds (Phase 2/4) ---
export const HIRE_UNLOCK_TOTAL_GUM = 1000;
export const WORKSHOP_UP_UNLOCK_TOTAL_GUM = 1000;
export const SELF_CRAFT_UNLOCK_TOTAL_GUM = 10_000;
// HIGH_TIER unlocks at workshop.level >= 2 AND employees.length >= 3 (logical, not GUM)
export const HIGH_TIER_MIN_WORKSHOP_LEVEL = 2;
export const HIGH_TIER_MIN_EMPLOYEES = 3;

// --- Hiring (Phase 2) ---
export const HIRE_MARKET_SIZE = 3;
export const COMMON_DAILY_WAGE = 200;
export const COMMON_INITIAL_STAMINA = 100;
export const COMMON_INITIAL_CRAFT_LV = 1;

// --- Employee leveling (Phase 2) ---
export const EMPLOYEE_LV_UP_COST = 500; // flat per level
export const EMPLOYEE_MAX_LEVEL = 10;
export const EMPLOYEE_QUALITY_BONUS_PER_LEVEL = 5;
export const EMPLOYEE_AFFINITY_QUALITY_BONUS = 10;

// --- Workshop leveling (Phase 2) ---
export const WORKSHOP_LV_UP_COSTS: Record<number, number> = {
  // current_level -> cost to reach next
  1: 2000, // Lv1 → Lv2
  2: 8000, // Lv2 → Lv3
};
export const WORKSHOP_MAX_LEVEL = 3;

// --- Stamina (Phase 2) ---
export const STAMINA_PER_CRAFT = 30;
export const STAMINA_MAX = 100;

// --- Bidding / competition (Phase 3) ---
/** Tiers at which bidders/playerEdge appear and a bid judge runs on accept. */
export const BIDDING_MIN_TIER = 3;
/** Spec v3 §2.3: judge weight = reputation:luck = 7:3 */
export const BID_REPUTATION_WEIGHT = 0.7;
export const BID_LUCK_WEIGHT = 0.3;
/** Each ★ of playerEdge adds this to the player score. */
export const BID_EDGE_BONUS = 0.05;
/** Base win threshold; each extra bidder past 1 adds this much. */
export const BID_THRESHOLD_BASE = 0.40;
export const BID_THRESHOLD_PER_EXTRA_BIDDER = 0.05;

// --- Demand trend (Phase 3 / Phase 4) ---
/** Demand trend cycles through the 4 categories. */
export const DEMAND_TREND_CYCLE_DAYS = 4;
/** Demand factor on the trending day for the trending category. */
export const DEMAND_FACTOR_TRENDING = 1.5;
/** Demand factor on the trending day for non-trending categories. */
export const DEMAND_FACTOR_OFF_TREND = 0.85;
