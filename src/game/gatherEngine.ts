import type { Employee, MaterialType } from './types';
import {
  GATHER_BASE_DROPS_MAX,
  GATHER_BASE_DROPS_MIN,
  GATHER_LV_BONUS_PER_5_LEVELS,
} from '../data/balance';

export interface GatherNode {
  id: string;
  name: string;
  description: string;
  /** Weighted base material distribution (weights are relative). */
  baseDrops: Partial<Record<MaterialType, number>>;
  /** Each entry is rolled independently per drop slot before falling back to base. */
  rareDrops: { material: MaterialType; chance: number }[];
}

export const GATHER_NODES: GatherNode[] = [
  {
    id: 'forest',
    name: '森',
    description: '木と布が中心。稀にミスリル。',
    baseDrops: { Wood: 60, Cloth: 25, Iron: 15 },
    rareDrops: [{ material: 'Mithril', chance: 0.10 }],
  },
  {
    id: 'mine',
    name: '鉱山',
    description: '鉄と宝石。稀にオリハルコン。',
    baseDrops: { Iron: 70, Gem: 30 },
    rareDrops: [{ material: 'Orichalcum', chance: 0.05 }],
  },
  {
    id: 'plains',
    name: '草原',
    description: '布と木が豊富。安全圏。',
    baseDrops: { Cloth: 55, Wood: 30, Iron: 15 },
    rareDrops: [{ material: 'Mithril', chance: 0.08 }],
  },
  {
    id: 'cave',
    name: '洞窟',
    description: '宝石が多い、オリハルコンも。',
    baseDrops: { Gem: 50, Iron: 30, Cloth: 20 },
    rareDrops: [{ material: 'Orichalcum', chance: 0.10 }],
  },
];

export function findNode(id: string): GatherNode | undefined {
  return GATHER_NODES.find((n) => n.id === id);
}

export interface GatherResult {
  drops: Partial<Record<MaterialType, number>>;
  rareDrops: MaterialType[];
}

/**
 * Pure: given a node + employee + rng, return the gathered materials.
 * Drop count = base 1-3 + craftLv bonus (every 5 levels = +1).
 */
export function runGather(node: GatherNode, employee: Employee, rng: () => number): GatherResult {
  const dropRange = GATHER_BASE_DROPS_MAX - GATHER_BASE_DROPS_MIN + 1;
  const baseCount = GATHER_BASE_DROPS_MIN + Math.floor(rng() * dropRange);
  const lvBonus = Math.floor((employee.craftLv - 1) / 5) * GATHER_LV_BONUS_PER_5_LEVELS;
  const totalDrops = baseCount + lvBonus;

  const drops: Partial<Record<MaterialType, number>> = {};
  const rareDrops: MaterialType[] = [];

  for (let i = 0; i < totalDrops; i++) {
    const material = rollOne(node, rng, rareDrops);
    drops[material] = (drops[material] ?? 0) + 1;
  }

  return { drops, rareDrops };
}

function rollOne(
  node: GatherNode,
  rng: () => number,
  rareTracker: MaterialType[],
): MaterialType {
  // Try each rare independently
  for (const rare of node.rareDrops) {
    if (rng() < rare.chance) {
      rareTracker.push(rare.material);
      return rare.material;
    }
  }
  // Fall back to weighted base distribution
  const entries = Object.entries(node.baseDrops) as [MaterialType, number][];
  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
  const r = rng() * totalWeight;
  let acc = 0;
  for (const [mat, w] of entries) {
    acc += w;
    if (r < acc) return mat;
  }
  return entries[0]?.[0] ?? 'Iron';
}
