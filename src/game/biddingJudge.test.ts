import { describe, it, expect } from 'vitest';
import seedrandom from 'seedrandom';
import { isBiddable, judgeBidding } from './biddingJudge';

describe('isBiddable', () => {
  it('Tier 1-2 are not biddable', () => {
    expect(isBiddable(1)).toBe(false);
    expect(isBiddable(2)).toBe(false);
  });
  it('Tier 3-5 are biddable', () => {
    expect(isBiddable(3)).toBe(true);
    expect(isBiddable(4)).toBe(true);
    expect(isBiddable(5)).toBe(true);
  });
});

describe('judgeBidding', () => {
  it('high reputation + max edge + few bidders → high win rate', () => {
    let wins = 0;
    const rng = seedrandom('high-rep');
    for (let i = 0; i < 100; i++) {
      if (
        judgeBidding({
          reputation: 90,
          playerEdge: 3,
          bidders: 1,
          rng: () => rng(),
        }).won
      ) wins++;
    }
    expect(wins).toBeGreaterThan(80); // should win almost always
  });

  it('low reputation + no edge + many bidders → low win rate', () => {
    let wins = 0;
    const rng = seedrandom('low-rep');
    for (let i = 0; i < 100; i++) {
      if (
        judgeBidding({
          reputation: 20,
          playerEdge: 0,
          bidders: 5,
          rng: () => rng(),
        }).won
      ) wins++;
    }
    expect(wins).toBeLessThan(15);
  });

  it('mid-rep + mid-edge + 3 bidders → roughly 30-70% range', () => {
    let wins = 0;
    const rng = seedrandom('mid');
    for (let i = 0; i < 200; i++) {
      if (
        judgeBidding({
          reputation: 50,
          playerEdge: 1,
          bidders: 3,
          rng: () => rng(),
        }).won
      ) wins++;
    }
    expect(wins).toBeGreaterThan(20);
    expect(wins).toBeLessThan(180);
  });

  it('returns the playerScore + threshold for diagnostics', () => {
    const out = judgeBidding({
      reputation: 50,
      playerEdge: 0,
      bidders: 1,
      rng: () => 0.5,
    });
    expect(out.playerScore).toBeGreaterThan(0);
    expect(out.playerScore).toBeLessThan(1);
    expect(out.threshold).toBeGreaterThan(0);
    expect(out.threshold).toBeLessThan(1);
  });

  it('is deterministic given the same rng', () => {
    const rng1 = seedrandom('test');
    const rng2 = seedrandom('test');
    const a = judgeBidding({ reputation: 60, playerEdge: 2, bidders: 2, rng: () => rng1() });
    const b = judgeBidding({ reputation: 60, playerEdge: 2, bidders: 2, rng: () => rng2() });
    expect(a).toEqual(b);
  });
});
