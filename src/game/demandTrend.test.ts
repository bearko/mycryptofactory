import { describe, it, expect } from 'vitest';
import { demandFactorsForDay, trendForDay, trendHeadline } from './demandTrend';
import {
  DEMAND_FACTOR_OFF_TREND,
  DEMAND_FACTOR_TRENDING,
  DEMAND_TREND_CYCLE_DAYS,
} from '../data/balance';

describe('trendForDay', () => {
  it('cycles through 4 categories every DEMAND_TREND_CYCLE_DAYS days', () => {
    const cats = Array.from({ length: DEMAND_TREND_CYCLE_DAYS }, (_, i) => trendForDay(i + 1).trendingCategory);
    expect(new Set(cats).size).toBe(DEMAND_TREND_CYCLE_DAYS);
  });

  it('is deterministic', () => {
    expect(trendForDay(7)).toEqual(trendForDay(7));
  });

  it('day 1 = Sword, day 2 = Helm, day 3 = Armor, day 4 = Acc', () => {
    expect(trendForDay(1).trendingCategory).toBe('Sword');
    expect(trendForDay(2).trendingCategory).toBe('Helm');
    expect(trendForDay(3).trendingCategory).toBe('Armor');
    expect(trendForDay(4).trendingCategory).toBe('Acc');
  });

  it('repeats after DEMAND_TREND_CYCLE_DAYS', () => {
    expect(trendForDay(5).trendingCategory).toBe(trendForDay(1).trendingCategory);
  });

  it('uses DEMAND_FACTOR_TRENDING for trending day', () => {
    expect(trendForDay(1).demandFactor).toBe(DEMAND_FACTOR_TRENDING);
  });
});

describe('demandFactorsForDay', () => {
  it('trending category gets TRENDING factor, others OFF_TREND', () => {
    const f = demandFactorsForDay(1); // Sword trends
    expect(f.Sword).toBe(DEMAND_FACTOR_TRENDING);
    expect(f.Helm).toBe(DEMAND_FACTOR_OFF_TREND);
    expect(f.Armor).toBe(DEMAND_FACTOR_OFF_TREND);
    expect(f.Acc).toBe(DEMAND_FACTOR_OFF_TREND);
  });
});

describe('trendHeadline', () => {
  it('produces a Japanese headline with the trending category', () => {
    expect(trendHeadline(trendForDay(1))).toContain('剣');
    expect(trendHeadline(trendForDay(2))).toContain('兜');
  });
});
