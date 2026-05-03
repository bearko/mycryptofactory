import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ActiveCraft,
  Employee,
  EXT,
  Feature,
  MaterialType,
  NewsItem,
  Order,
  ShowcaseItem,
  Workshop,
} from '../game/types';

export type {
  ActiveCraft,
  Category,
  Employee,
  EmployeeState,
  EXT,
  Feature,
  MaterialType,
  NewsItem,
  Order,
  Rarity,
  ShowcaseItem,
  Workshop,
} from '../game/types';

interface GameState {
  day: number;
  gum: number;
  reputation: number;
  totalGumEarned: number;
  unlockedFeatures: Feature[];

  materials: Record<MaterialType, number>;
  inventory: EXT[];

  workshop: Workshop;

  employees: Employee[];
  hireMarket: Employee[];

  orderBoard: Order[];
  activeCrafts: ActiveCraft[];
  showcase: ShowcaseItem[];

  marketPrices: Record<MaterialType, number>;
  newsTomorrow: NewsItem | null;

  reset: () => void;
}

const initialMaterials: Record<MaterialType, number> = {
  Iron: 0,
  Wood: 0,
  Cloth: 0,
  Gem: 0,
  Mithril: 0,
  Orichalcum: 0,
};

const initialMarketPrices: Record<MaterialType, number> = {
  Iron: 30,
  Wood: 25,
  Cloth: 35,
  Gem: 80,
  Mithril: 300,
  Orichalcum: 800,
};

const initialWorkshop: Workshop = {
  level: 1,
  slots: 1,
  tierMax: 2,
};

const starterEmployee: Employee = {
  id: 'starter-1',
  name: 'アシスタント',
  rarity: 'Common',
  craftLv: 1,
  affinity: 'Sword',
  battleStats: { atk: 10, hp: 20, spd: 5 },
  stamina: 100,
  wage: 0,
  state: 'idle',
};

const initialState = {
  day: 1,
  gum: 500,
  reputation: 50,
  totalGumEarned: 0,
  unlockedFeatures: [] as Feature[],
  materials: { ...initialMaterials },
  inventory: [] as EXT[],
  workshop: { ...initialWorkshop },
  employees: [{ ...starterEmployee }],
  hireMarket: [] as Employee[],
  orderBoard: [] as Order[],
  activeCrafts: [] as ActiveCraft[],
  showcase: [] as ShowcaseItem[],
  marketPrices: { ...initialMarketPrices },
  newsTomorrow: null as NewsItem | null,
};

export const useGameStore = create<GameState>()(
  persist(
    (set) => ({
      ...initialState,
      reset: () => set({ ...initialState, employees: [{ ...starterEmployee }] }),
    }),
    { name: 'mcf-save-v1' },
  ),
);
