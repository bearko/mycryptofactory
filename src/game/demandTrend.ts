import type { Category, NewsItem } from './types';
import {
  DEMAND_FACTOR_OFF_TREND,
  DEMAND_FACTOR_TRENDING,
  DEMAND_TREND_CYCLE_DAYS,
} from '../data/balance';

const CATEGORIES: Category[] = ['Sword', 'Helm', 'Armor', 'Acc'];

/**
 * Pure deterministic trend for a given day.
 * SPEC: 4 categories rotate with a DEMAND_TREND_CYCLE_DAYS-day cycle.
 */
export function trendForDay(day: number): NewsItem {
  const idx = ((day - 1) % DEMAND_TREND_CYCLE_DAYS + DEMAND_TREND_CYCLE_DAYS) % DEMAND_TREND_CYCLE_DAYS;
  const trendingCategory = CATEGORIES[idx]!;
  return {
    date: day,
    trendingCategory,
    demandFactor: DEMAND_FACTOR_TRENDING,
  };
}

/**
 * Demand multiplier per category for a given day.
 * The trending category gets DEMAND_FACTOR_TRENDING, others get DEMAND_FACTOR_OFF_TREND.
 * Phase 4 free-market sales will multiply EXT prices by this.
 */
export function demandFactorsForDay(day: number): Record<Category, number> {
  const trending = trendForDay(day).trendingCategory;
  const factors: Record<Category, number> = {
    Sword: DEMAND_FACTOR_OFF_TREND,
    Helm: DEMAND_FACTOR_OFF_TREND,
    Armor: DEMAND_FACTOR_OFF_TREND,
    Acc: DEMAND_FACTOR_OFF_TREND,
  };
  factors[trending] = DEMAND_FACTOR_TRENDING;
  return factors;
}

const CATEGORY_LABEL: Record<Category, string> = {
  Sword: '剣',
  Helm: '兜',
  Armor: '鎧',
  Acc: '装飾',
};

/** Human-readable trend headline for the UI. */
export function trendHeadline(news: NewsItem): string {
  return `${CATEGORY_LABEL[news.trendingCategory]} が人気 (×${news.demandFactor.toFixed(2)})`;
}
