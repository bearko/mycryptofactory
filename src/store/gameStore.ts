import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Feature = 'HIRE' | 'WORKSHOP_UP' | 'HIGH_TIER' | 'SELF_CRAFT';
export type Category = 'Sword' | 'Helm' | 'Armor' | 'Acc';
export type MaterialType = 'Iron' | 'Wood' | 'Cloth' | 'Gem' | 'Mithril' | 'Orichalcum';

interface GameState {
  day: number;
  gum: number;
  reputation: number;
  totalGumEarned: number;
  unlockedFeatures: Feature[];
  materials: Record<MaterialType, number>;
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

export const useGameStore = create<GameState>()(
  persist(
    (set) => ({
      day: 1,
      gum: 500,
      reputation: 50,
      totalGumEarned: 0,
      unlockedFeatures: [],
      materials: initialMaterials,
      reset: () =>
        set({
          day: 1,
          gum: 500,
          reputation: 50,
          totalGumEarned: 0,
          unlockedFeatures: [],
          materials: initialMaterials,
        }),
    }),
    { name: 'mcf-save-v1' },
  ),
);
