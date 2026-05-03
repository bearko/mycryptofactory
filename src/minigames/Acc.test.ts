import { describe, it, expect } from 'vitest';
import {
  countAdjacentMatches,
  calculateAccQuality,
  generateHand,
  getMaterialPalette,
  type Grid,
} from './Acc';

describe('Acc minigame - countAdjacentMatches', () => {
  it('returns 12 for a fully Iron grid (max possible adjacent pairs in 3x3)', () => {
    const grid: Grid = [
      ['Iron', 'Iron', 'Iron'],
      ['Iron', 'Iron', 'Iron'],
      ['Iron', 'Iron', 'Iron'],
    ];
    // 横ペア: 3行 × 2 = 6, 縦ペア: 2行間 × 3列 = 6 → 合計12
    expect(countAdjacentMatches(grid)).toBe(12);
  });

  it('returns 0 for a checkerboard Iron/Wood pattern (no like-neighbors)', () => {
    const grid: Grid = [
      ['Iron', 'Wood', 'Iron'],
      ['Wood', 'Iron', 'Wood'],
      ['Iron', 'Wood', 'Iron'],
    ];
    expect(countAdjacentMatches(grid)).toBe(0);
  });

  it('counts 3 adjacent pairs in a partially-clustered grid', () => {
    // 上段に Iron-Iron-Iron (横2ペア)、上段中央と中段中央に Iron (縦1ペア) = 3 ペア
    const grid: Grid = [
      ['Iron', 'Iron', 'Iron'],
      ['Wood', 'Iron', 'Cloth'],
      ['Gem', 'Wood', 'Cloth'],
    ];
    // 横: row0 (Iron-Iron, Iron-Iron) = 2, row1 (mismatch) = 0, row2 (mismatch) = 0
    // 縦: (Iron-Wood)=0 (Iron-Iron)=1 (Iron-Cloth)=0 (Wood-Gem)=0 (Iron-Wood)=0 (Cloth-Cloth)=1
    // → 2 + 1 + 1 = 4 … 期待値を再計算しよう
    // 横ペア再カウント:
    //  row0: (Iron,Iron),(Iron,Iron) = 2
    //  row1: (Wood,Iron),(Iron,Cloth) = 0
    //  row2: (Gem,Wood),(Wood,Cloth) = 0
    // 縦ペア:
    //  col0: (Iron,Wood),(Wood,Gem) = 0
    //  col1: (Iron,Iron),(Iron,Wood) = 1
    //  col2: (Iron,Cloth),(Cloth,Cloth) = 1
    // 合計 4
    expect(countAdjacentMatches(grid)).toBe(4);
  });

  it('ignores null cells when counting adjacency', () => {
    const grid: Grid = [
      ['Iron', null, 'Iron'],
      [null, 'Iron', null],
      ['Iron', null, 'Iron'],
    ];
    // すべての隣接ペアの片側が null → 0
    expect(countAdjacentMatches(grid)).toBe(0);
  });

  it('does not count diagonal neighbors', () => {
    const grid: Grid = [
      ['Iron', 'Wood', 'Iron'],
      ['Wood', 'Iron', 'Wood'],
      ['Iron', 'Wood', 'Iron'],
    ];
    // 対角は同じ Iron / Wood が並ぶが、上下左右はすべて異なる → 0
    expect(countAdjacentMatches(grid)).toBe(0);
  });
});

describe('Acc minigame - calculateAccQuality', () => {
  it('returns 30 for 0 matches (random-bad placement)', () => {
    expect(calculateAccQuality(0)).toBe(30);
  });

  it('returns quality in 50-65 range for 1-3 matches', () => {
    expect(calculateAccQuality(1)).toBe(50);
    expect(calculateAccQuality(2)).toBeGreaterThanOrEqual(50);
    expect(calculateAccQuality(2)).toBeLessThanOrEqual(65);
    expect(calculateAccQuality(3)).toBe(65);
  });

  it('returns quality in 70-85 range for 4-6 matches', () => {
    expect(calculateAccQuality(4)).toBe(70);
    expect(calculateAccQuality(5)).toBeGreaterThanOrEqual(70);
    expect(calculateAccQuality(5)).toBeLessThanOrEqual(85);
    expect(calculateAccQuality(6)).toBe(85);
  });

  it('returns quality in 90-100 range for 7-12 matches (max=100)', () => {
    expect(calculateAccQuality(7)).toBe(90);
    expect(calculateAccQuality(12)).toBe(100);
    // 上限超過しても 100 を超えない
    expect(calculateAccQuality(20)).toBe(100);
  });

  it('clamps negative input to 30 (treated as 0)', () => {
    expect(calculateAccQuality(-5)).toBe(30);
  });
});

describe('Acc minigame - integration: max-match grid → high quality', () => {
  it('all-Iron 3x3 → 12 matches → quality 100', () => {
    const grid: Grid = [
      ['Iron', 'Iron', 'Iron'],
      ['Iron', 'Iron', 'Iron'],
      ['Iron', 'Iron', 'Iron'],
    ];
    const matches = countAdjacentMatches(grid);
    expect(calculateAccQuality(matches)).toBeGreaterThanOrEqual(90);
    expect(calculateAccQuality(matches)).toBe(100);
  });

  it('checkerboard → 0 matches → quality 30', () => {
    const grid: Grid = [
      ['Iron', 'Wood', 'Iron'],
      ['Wood', 'Iron', 'Wood'],
      ['Iron', 'Wood', 'Iron'],
    ];
    expect(calculateAccQuality(countAdjacentMatches(grid))).toBe(30);
  });
});

describe('Acc minigame - generateHand (seedrandom reproducibility)', () => {
  it('same seed produces same hand', () => {
    const a = generateHand(3, 'fixed-seed');
    const b = generateHand(3, 'fixed-seed');
    expect(a).toEqual(b);
    expect(a).toHaveLength(9);
  });

  it('different seeds produce different hands (probabilistic)', () => {
    const a = generateHand(5, 'seed-A');
    const b = generateHand(5, 'seed-B');
    // 9 ピースが完全一致する確率は palette=4 で 4^-9 ≈ 4e-6 → 実用上 0
    expect(a).not.toEqual(b);
  });

  it('hand only contains materials from the tier palette', () => {
    const tier1Hand = generateHand(1, 's');
    const tier1Palette = getMaterialPalette(1);
    expect(tier1Hand.every((m) => tier1Palette.includes(m))).toBe(true);

    const tier5Hand = generateHand(5, 's');
    const tier5Palette = getMaterialPalette(5);
    expect(tier5Hand.every((m) => tier5Palette.includes(m))).toBe(true);
  });
});

describe('Acc minigame - getMaterialPalette (tier scaling)', () => {
  it('Tier 1 has 2 materials', () => {
    expect(getMaterialPalette(1)).toHaveLength(2);
  });

  it('Tier 3 has 3 materials', () => {
    expect(getMaterialPalette(3)).toHaveLength(3);
  });

  it('Tier 5 has 4 materials (more variety = harder to match)', () => {
    expect(getMaterialPalette(5)).toHaveLength(4);
  });

  it('out-of-range tier is clamped (0 → 1, 99 → 5)', () => {
    expect(getMaterialPalette(0)).toEqual(getMaterialPalette(1));
    expect(getMaterialPalette(99)).toEqual(getMaterialPalette(5));
  });
});
