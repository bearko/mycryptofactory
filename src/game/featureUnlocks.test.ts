import { describe, it, expect } from 'vitest';
import { computeUnlocks, newlyUnlocked } from './featureUnlocks';
import type { Feature, Workshop } from './types';
import {
  HIRE_UNLOCK_TOTAL_GUM,
  SELF_CRAFT_UNLOCK_TOTAL_GUM,
  HIGH_TIER_MIN_EMPLOYEES,
  HIGH_TIER_MIN_WORKSHOP_LEVEL,
} from '../data/balance';

const baseWorkshop: Workshop = { level: 1, slots: 1, tierMax: 2 };

describe('computeUnlocks', () => {
  it('returns empty when nothing reaches threshold', () => {
    const u = computeUnlocks([], { totalGumEarned: 0, workshop: baseWorkshop, employeeCount: 1 });
    expect(u).toEqual([]);
  });

  it('unlocks HIRE and WORKSHOP_UP at 1000 GUM', () => {
    const u = computeUnlocks([], {
      totalGumEarned: HIRE_UNLOCK_TOTAL_GUM,
      workshop: baseWorkshop,
      employeeCount: 1,
    });
    expect(u).toContain('HIRE');
    expect(u).toContain('WORKSHOP_UP');
  });

  it('does NOT unlock HIGH_TIER without workshop Lv 2 + 3 employees', () => {
    const u = computeUnlocks([], {
      totalGumEarned: 999_999,
      workshop: { level: 1, slots: 1, tierMax: 2 },
      employeeCount: 5,
    });
    expect(u).not.toContain('HIGH_TIER');
  });

  it('unlocks HIGH_TIER when workshop Lv >= 2 AND employeeCount >= 3', () => {
    const u = computeUnlocks([], {
      totalGumEarned: 0,
      workshop: { level: HIGH_TIER_MIN_WORKSHOP_LEVEL, slots: 2, tierMax: 3 },
      employeeCount: HIGH_TIER_MIN_EMPLOYEES,
    });
    expect(u).toContain('HIGH_TIER');
  });

  it('unlocks SELF_CRAFT at 10,000 GUM', () => {
    const u = computeUnlocks([], {
      totalGumEarned: SELF_CRAFT_UNLOCK_TOTAL_GUM,
      workshop: baseWorkshop,
      employeeCount: 1,
    });
    expect(u).toContain('SELF_CRAFT');
  });

  it('is monotonic: keeps existing features even if threshold drops', () => {
    const before: Feature[] = ['HIRE', 'WORKSHOP_UP'];
    const u = computeUnlocks(before, {
      totalGumEarned: 0,
      workshop: baseWorkshop,
      employeeCount: 1,
    });
    expect(u).toContain('HIRE');
    expect(u).toContain('WORKSHOP_UP');
  });
});

describe('newlyUnlocked', () => {
  it('returns features in `after` not in `before`', () => {
    expect(newlyUnlocked([], ['HIRE'])).toEqual(['HIRE']);
    expect(newlyUnlocked(['HIRE'], ['HIRE', 'WORKSHOP_UP'])).toEqual(['WORKSHOP_UP']);
    expect(newlyUnlocked(['HIRE', 'WORKSHOP_UP'], ['HIRE', 'WORKSHOP_UP'])).toEqual([]);
  });
});
