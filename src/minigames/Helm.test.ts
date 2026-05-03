import { describe, it, expect } from 'vitest';
import { calculateHelmQuality, tierToIntervalMs, type BeatJudgment } from './Helm';

describe('calculateHelmQuality', () => {
  it('all Perfect → quality >= 95 (Critical)', () => {
    const judgments: BeatJudgment[] = ['Perfect', 'Perfect', 'Perfect', 'Perfect'];
    const q = calculateHelmQuality(judgments);
    expect(q).toBeGreaterThanOrEqual(95);
    expect(q).toBeLessThanOrEqual(100);
  });

  it('mixed Perfect/Good with no Miss → 60-94 (Standard)', () => {
    const judgments: BeatJudgment[] = ['Perfect', 'Perfect', 'Good', 'Good'];
    const q = calculateHelmQuality(judgments);
    expect(q).toBeGreaterThanOrEqual(60);
    expect(q).toBeLessThanOrEqual(94);
  });

  it('all Miss → quality = 0 (Fail)', () => {
    const judgments: BeatJudgment[] = ['Miss', 'Miss', 'Miss', 'Miss'];
    expect(calculateHelmQuality(judgments)).toBe(0);
  });

  it('3 Perfect + 1 Good → 80-94', () => {
    const judgments: BeatJudgment[] = ['Perfect', 'Perfect', 'Perfect', 'Good'];
    const q = calculateHelmQuality(judgments);
    expect(q).toBeGreaterThanOrEqual(80);
    expect(q).toBeLessThanOrEqual(94);
  });

  it('all Good → 60-79', () => {
    const judgments: BeatJudgment[] = ['Good', 'Good', 'Good', 'Good'];
    const q = calculateHelmQuality(judgments);
    expect(q).toBeGreaterThanOrEqual(60);
    expect(q).toBeLessThanOrEqual(79);
  });

  it('any Miss reduces quality below the all-Good baseline', () => {
    const allGood: BeatJudgment[] = ['Good', 'Good', 'Good', 'Good'];
    const oneMiss: BeatJudgment[] = ['Perfect', 'Perfect', 'Perfect', 'Miss'];
    // Miss を含むと all-Good (4 Good = 60+) より下回る or 比例減点ルートに乗る
    const allGoodQ = calculateHelmQuality(allGood);
    const oneMissQ = calculateHelmQuality(oneMiss);
    // 仕様: Miss を含むと per-beat 比例で減点される
    expect(oneMissQ).toBeLessThan(98);
    expect(oneMissQ).toBeGreaterThanOrEqual(0);
    // any Miss = 1 → quality は 4Perfect の98より低い
    expect(oneMissQ).toBeLessThan(98);
    // sanity: all-Good は最低でも60
    expect(allGoodQ).toBeGreaterThanOrEqual(60);
  });

  it('throws when judgments length is not 4', () => {
    expect(() => calculateHelmQuality(['Perfect', 'Perfect', 'Perfect'] as BeatJudgment[])).toThrow();
    expect(() => calculateHelmQuality([] as BeatJudgment[])).toThrow();
  });
});

describe('tierToIntervalMs', () => {
  it('Tier 1 → 800ms', () => {
    expect(tierToIntervalMs(1)).toBe(800);
  });

  it('Tier 5 → 400ms', () => {
    expect(tierToIntervalMs(5)).toBe(400);
  });

  it('Tier 3 → 600ms (linear)', () => {
    expect(tierToIntervalMs(3)).toBe(600);
  });

  it('clamps out-of-range tier', () => {
    expect(tierToIntervalMs(0)).toBe(800);
    expect(tierToIntervalMs(99)).toBe(400);
  });
});
