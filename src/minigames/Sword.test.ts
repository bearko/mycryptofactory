import { describe, it, expect } from 'vitest';
import {
  calculateSwordQuality,
  isSwordSuccess,
  swordAngularSpeed,
  CRITICAL_WINDOW,
  GREAT_WINDOW,
} from './Sword';

describe('calculateSwordQuality', () => {
  it('Critical band: position 0.02 → quality ≥ 90', () => {
    const q = calculateSwordQuality(0.02);
    expect(q).toBeGreaterThanOrEqual(90);
    expect(q).toBeLessThanOrEqual(100);
  });

  it('Critical perfect center: position 0 → 100', () => {
    expect(calculateSwordQuality(0)).toBe(100);
  });

  it('Great band: position 0.10 → quality between 70 and 89', () => {
    const q = calculateSwordQuality(0.1);
    expect(q).toBeGreaterThanOrEqual(70);
    expect(q).toBeLessThanOrEqual(89);
  });

  it('Standard band: position 0.5 → quality between 30 and 69', () => {
    const q = calculateSwordQuality(0.5);
    expect(q).toBeGreaterThanOrEqual(30);
    expect(q).toBeLessThanOrEqual(69);
  });

  it('Edge: position 1.0 → quality at low end of Standard (≈30)', () => {
    const q = calculateSwordQuality(1.0);
    expect(q).toBe(30);
  });

  it('symmetric: negative positions score the same as positive', () => {
    expect(calculateSwordQuality(-0.02)).toBe(calculateSwordQuality(0.02));
    expect(calculateSwordQuality(-0.5)).toBe(calculateSwordQuality(0.5));
  });

  it('clamps out-of-range positions to ±1', () => {
    expect(calculateSwordQuality(2)).toBe(calculateSwordQuality(1));
    expect(calculateSwordQuality(-2)).toBe(calculateSwordQuality(1));
  });

  it('returns integers in 0..100', () => {
    for (const p of [0, 0.03, 0.05, 0.1, 0.15, 0.4, 0.7, 1.0]) {
      const q = calculateSwordQuality(p);
      expect(Number.isInteger(q)).toBe(true);
      expect(q).toBeGreaterThanOrEqual(0);
      expect(q).toBeLessThanOrEqual(100);
    }
  });

  it('boundary CRITICAL_WINDOW maps to ~90 (top of Great = bottom of Critical)', () => {
    expect(calculateSwordQuality(CRITICAL_WINDOW)).toBe(90);
  });

  it('boundary GREAT_WINDOW maps to ~70', () => {
    expect(calculateSwordQuality(GREAT_WINDOW)).toBe(70);
  });

  it('NaN input degrades gracefully (Standard tier)', () => {
    const q = calculateSwordQuality(Number.NaN);
    expect(q).toBeGreaterThanOrEqual(30);
    expect(q).toBeLessThanOrEqual(69);
  });
});

describe('isSwordSuccess', () => {
  it('true for any positive quality (player struck)', () => {
    expect(isSwordSuccess(1)).toBe(true);
    expect(isSwordSuccess(50)).toBe(true);
    expect(isSwordSuccess(100)).toBe(true);
  });

  it('false for quality 0 (timeout)', () => {
    expect(isSwordSuccess(0)).toBe(false);
  });
});

describe('swordAngularSpeed', () => {
  it('Tier 5 is roughly 2x Tier 1 base speed', () => {
    const t1 = swordAngularSpeed(1);
    const t5 = swordAngularSpeed(5);
    expect(t5 / t1).toBeCloseTo(2.0, 1);
  });

  it('Tier increases speed monotonically', () => {
    const speeds = [1, 2, 3, 4, 5].map(swordAngularSpeed);
    for (let i = 1; i < speeds.length; i++) {
      expect(speeds[i]).toBeGreaterThan(speeds[i - 1]);
    }
  });

  it('Out-of-range tier is clamped to [1, 5]', () => {
    expect(swordAngularSpeed(0)).toBe(swordAngularSpeed(1));
    expect(swordAngularSpeed(99)).toBe(swordAngularSpeed(5));
  });
});
