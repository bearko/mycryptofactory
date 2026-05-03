import { describe, it, expect } from 'vitest';
import seedrandom from 'seedrandom';
import { GATHER_NODES, findNode, runGather } from './gatherEngine';
import type { Employee, MaterialType } from './types';

const mkEmp = (overrides: Partial<Employee> = {}): Employee => ({
  id: 'e1',
  name: 'Test',
  rarity: 'Common',
  craftLv: 1,
  affinity: 'Sword',
  battleStats: { atk: 10, hp: 20, spd: 5 },
  stamina: 100,
  wage: 200,
  state: 'idle',
  ...overrides,
});

describe('GATHER_NODES', () => {
  it('has 4 nodes', () => {
    expect(GATHER_NODES).toHaveLength(4);
  });

  it('every node has at least one base material', () => {
    GATHER_NODES.forEach((n) => {
      expect(Object.keys(n.baseDrops).length).toBeGreaterThan(0);
    });
  });
});

describe('findNode', () => {
  it('finds by id', () => {
    expect(findNode('forest')?.name).toBe('森');
  });
  it('returns undefined for unknown id', () => {
    expect(findNode('atlantis')).toBeUndefined();
  });
});

describe('runGather', () => {
  it('returns deterministic drops with the same seed', () => {
    const node = findNode('forest')!;
    const rngA = seedrandom('test');
    const rngB = seedrandom('test');
    const a = runGather(node, mkEmp(), () => rngA());
    const b = runGather(node, mkEmp(), () => rngB());
    expect(a).toEqual(b);
  });

  it('drop count is at least 1', () => {
    const node = findNode('mine')!;
    for (let s = 0; s < 20; s++) {
      const rng = seedrandom(`seed-${s}`);
      const result = runGather(node, mkEmp(), () => rng());
      const total = Object.values(result.drops).reduce((a, b) => a + (b ?? 0), 0);
      expect(total).toBeGreaterThanOrEqual(1);
    }
  });

  it('higher craftLv yields more drops on average', () => {
    const node = findNode('mine')!;
    let lowSum = 0;
    let highSum = 0;
    for (let s = 0; s < 50; s++) {
      const rngLow = seedrandom(`low-${s}`);
      const low = runGather(node, mkEmp({ craftLv: 1 }), () => rngLow());
      const rngHigh = seedrandom(`high-${s}`);
      const high = runGather(node, mkEmp({ craftLv: 10 }), () => rngHigh());
      lowSum += Object.values(low.drops).reduce((a, b) => a + (b ?? 0), 0);
      highSum += Object.values(high.drops).reduce((a, b) => a + (b ?? 0), 0);
    }
    expect(highSum).toBeGreaterThan(lowSum);
  });

  it('rare material occasionally appears in cave (Orichalcum 10%)', () => {
    const node = findNode('cave')!;
    let rareCount = 0;
    for (let s = 0; s < 200; s++) {
      const rng = seedrandom(`cave-${s}`);
      const result = runGather(node, mkEmp({ craftLv: 5 }), () => rng());
      if (result.rareDrops.length > 0) rareCount++;
    }
    expect(rareCount).toBeGreaterThan(10);
  });

  it('drops are valid MaterialType', () => {
    const validMaterials: MaterialType[] = ['Iron', 'Wood', 'Cloth', 'Gem', 'Mithril', 'Orichalcum'];
    const node = findNode('forest')!;
    const rng = seedrandom('valid');
    const result = runGather(node, mkEmp({ craftLv: 3 }), () => rng());
    Object.keys(result.drops).forEach((mat) => {
      expect(validMaterials).toContain(mat as MaterialType);
    });
  });
});
