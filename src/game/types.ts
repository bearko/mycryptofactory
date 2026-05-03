export type Feature = 'HIRE' | 'WORKSHOP_UP' | 'HIGH_TIER' | 'SELF_CRAFT';

export type Category = 'Sword' | 'Helm' | 'Armor' | 'Acc';

export type MaterialType = 'Iron' | 'Wood' | 'Cloth' | 'Gem' | 'Mithril' | 'Orichalcum';

export const BASE_MATERIALS: MaterialType[] = ['Iron', 'Wood', 'Cloth', 'Gem'];
export const RARE_MATERIALS: MaterialType[] = ['Mithril', 'Orichalcum'];

export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';

export type EmployeeState = 'idle' | 'crafting' | 'gathering' | 'resting';

export interface BattleStats {
  atk: number;
  hp: number;
  spd: number;
}

export interface Employee {
  id: string;
  name: string;
  rarity: Rarity;
  craftLv: number;
  affinity: Category;
  battleStats: BattleStats;
  stamina: number;
  wage: number;
  state: EmployeeState;
}

export interface EXT {
  id: string;
  tier: number;
  category: Category;
  quality: number;
  craftDays: number;
  materialCost: Partial<Record<MaterialType, number>>;
  hypeBonus: number;
}

export interface Order {
  id: string;
  category: Category;
  tier: number;
  qualityRequired: number;
  deadline: number;
  reward: number;
  repBonus: number;
  bidders: number;
  playerEdge: 0 | 1 | 2 | 3;
}

export interface ActiveCraft {
  id: string;
  orderId: string | null;
  category: Category;
  tier: number;
  employeeId: string;
  daysRemaining: number;
  quality: number;
}

export interface ShowcaseItem {
  id: string;
  ext: EXT;
  price: number;
  daysListed: number;
}

export interface Workshop {
  level: number;
  slots: number;
  tierMax: number;
}

export interface NewsItem {
  date: number;
  trendingCategory: Category;
  demandFactor: number;
}

export interface MiniGameResult {
  quality: number;
  success: boolean;
  durationMs: number;
}
