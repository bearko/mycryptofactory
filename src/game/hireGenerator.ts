import seedrandom from 'seedrandom';
import type { Category, Employee } from './types';
import {
  COMMON_DAILY_WAGE,
  COMMON_INITIAL_CRAFT_LV,
  COMMON_INITIAL_STAMINA,
  HIRE_MARKET_SIZE,
} from '../data/balance';

const ALL_CATEGORIES: Category[] = ['Sword', 'Helm', 'Armor', 'Acc'];

const FIRST_NAMES = [
  'カイト', 'ミミ', 'ジン', 'シェル', 'ロウ', 'ハル', 'ノヴァ', 'リン',
  'ツバキ', 'ガイ', 'エマ', 'コウ', 'ユイ', 'タク', 'モモ', 'レン',
];

interface GenerateParams {
  day: number;
  seed?: string;
}

/**
 * Generate the day's hire candidates (Common rarity in Phase 2).
 * Pure: same seed → same output.
 */
export function generateHireMarket(params: GenerateParams): Employee[] {
  const { day, seed } = params;
  const rng = seedrandom(seed ?? `hire-day-${day}`);
  const candidates: Employee[] = [];

  for (let i = 0; i < HIRE_MARKET_SIZE; i++) {
    const name = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)] ?? `候補者${i + 1}`;
    const affinity = ALL_CATEGORIES[Math.floor(rng() * ALL_CATEGORIES.length)]!;
    candidates.push({
      id: `cand-d${day}-${i}-${name}`,
      name,
      rarity: 'Common',
      craftLv: COMMON_INITIAL_CRAFT_LV,
      affinity,
      battleStats: {
        atk: 8 + Math.floor(rng() * 6),
        hp: 18 + Math.floor(rng() * 6),
        spd: 4 + Math.floor(rng() * 4),
      },
      stamina: COMMON_INITIAL_STAMINA,
      wage: COMMON_DAILY_WAGE,
      state: 'idle',
    });
  }

  return candidates;
}
