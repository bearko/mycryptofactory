import { describe, it, expect } from 'vitest';
import {
  calculateArmorQuality,
  isArmorSuccess,
  fillRateForTier,
  CRITICAL_ZONE,
  GREAT_LOW_ZONE,
  STANDARD_HIGH_ZONE,
  STANDARD_LOW_ZONE,
} from './Armor';

describe('calculateArmorQuality', () => {
  describe('Critical zone (85-95%)', () => {
    it('returns quality >= 90 at the sweet spot (90%)', () => {
      const q = calculateArmorQuality(90, false);
      expect(q).toBeGreaterThanOrEqual(90);
      expect(q).toBeLessThanOrEqual(100);
    });

    it('returns peak quality 100 at exactly 90%', () => {
      expect(calculateArmorQuality(90, false)).toBe(100);
    });

    it('returns 90 at the critical zone edges (85 and 95)', () => {
      expect(calculateArmorQuality(CRITICAL_ZONE.min, false)).toBe(90);
      expect(calculateArmorQuality(CRITICAL_ZONE.max, false)).toBe(90);
    });
  });

  describe('Great zones', () => {
    it('returns quality 70-89 for 78% (great-low zone)', () => {
      const q = calculateArmorQuality(78, false);
      expect(q).toBeGreaterThanOrEqual(70);
      expect(q).toBeLessThanOrEqual(89);
    });

    it('returns quality 70-89 for 97% (great-high zone with overheat risk)', () => {
      const q = calculateArmorQuality(97, false);
      expect(q).toBeGreaterThanOrEqual(70);
      expect(q).toBeLessThanOrEqual(89);
    });

    it('returns quality 70 at the lower boundary of great-low (70%)', () => {
      expect(calculateArmorQuality(GREAT_LOW_ZONE.min, false)).toBe(70);
    });
  });

  describe('Standard zones', () => {
    it('returns quality 40-69 for 50% (standard-high)', () => {
      const q = calculateArmorQuality(50, false);
      expect(q).toBeGreaterThanOrEqual(40);
      expect(q).toBeLessThanOrEqual(69);
    });

    it('returns quality 20-39 for 30% (standard-low)', () => {
      const q = calculateArmorQuality(30, false);
      expect(q).toBeGreaterThanOrEqual(20);
      expect(q).toBeLessThanOrEqual(39);
    });

    it('returns 40 exactly at the standard-high lower bound (40%)', () => {
      expect(calculateArmorQuality(STANDARD_HIGH_ZONE.min, false)).toBe(40);
    });

    it('returns 20 exactly at the standard-low lower bound (20%)', () => {
      expect(calculateArmorQuality(STANDARD_LOW_ZONE.min, false)).toBe(20);
    });
  });

  describe('Failure cases', () => {
    it('returns 0 quality and success false for overheat (releasePercent=110, overheated=true)', () => {
      const q = calculateArmorQuality(110, true);
      const ok = isArmorSuccess(110, true);
      expect(q).toBe(0);
      expect(ok).toBe(false);
    });

    it('returns 0 quality when overheated flag is true even if release is low', () => {
      expect(calculateArmorQuality(60, true)).toBe(0);
      expect(isArmorSuccess(60, true)).toBe(false);
    });

    it('returns 0 quality and success false when releasing below 20%', () => {
      expect(calculateArmorQuality(10, false)).toBe(0);
      expect(isArmorSuccess(10, false)).toBe(false);
    });

    it('returns 0 quality and success false at exactly 0%', () => {
      expect(calculateArmorQuality(0, false)).toBe(0);
      expect(isArmorSuccess(0, false)).toBe(false);
    });
  });

  describe('Success classification', () => {
    it('reports success=true for any release in [20, 100]', () => {
      expect(isArmorSuccess(20, false)).toBe(true);
      expect(isArmorSuccess(50, false)).toBe(true);
      expect(isArmorSuccess(90, false)).toBe(true);
      expect(isArmorSuccess(100, false)).toBe(true);
    });

    it('reports success=false when releasePercent exceeds 100 even without explicit overheat flag', () => {
      expect(isArmorSuccess(101, false)).toBe(false);
    });
  });

  describe('Determinism / pure function contract', () => {
    it('returns the same quality for the same input on repeated calls', () => {
      const samples = [25, 45, 78, 90, 95, 110];
      for (const r of samples) {
        const a = calculateArmorQuality(r, r > 100);
        const b = calculateArmorQuality(r, r > 100);
        expect(a).toBe(b);
      }
    });

    it('always returns an integer quality in [0, 100]', () => {
      for (let r = 0; r <= 105; r += 1) {
        const overheated = r > 100;
        const q = calculateArmorQuality(r, overheated);
        expect(Number.isInteger(q)).toBe(true);
        expect(q).toBeGreaterThanOrEqual(0);
        expect(q).toBeLessThanOrEqual(100);
      }
    });
  });
});

describe('fillRateForTier', () => {
  it('Tier 1 fills 100% in approximately 1500ms', () => {
    const rate = fillRateForTier(1);
    const msToFull = 100 / rate;
    expect(msToFull).toBeCloseTo(1500, 0);
  });

  it('Tier 5 fills 100% in approximately 700ms', () => {
    const rate = fillRateForTier(5);
    const msToFull = 100 / rate;
    expect(msToFull).toBeCloseTo(700, 0);
  });

  it('higher tier means faster fill rate', () => {
    expect(fillRateForTier(5)).toBeGreaterThan(fillRateForTier(1));
    expect(fillRateForTier(3)).toBeGreaterThan(fillRateForTier(2));
  });

  it('clamps tier values out of [1, 5] to the valid range', () => {
    expect(fillRateForTier(0)).toBe(fillRateForTier(1));
    expect(fillRateForTier(99)).toBe(fillRateForTier(5));
  });
});
