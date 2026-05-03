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
