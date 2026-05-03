import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ActiveCraft,
  Category,
  Employee,
  EXT,
  Feature,
  MaterialType,
  NewsItem,
  Order,
  ShowcaseItem,
  Workshop,
} from '../game/types';
import {
  BANKRUPT_DAYS,
  BASE_MATERIAL_PRICES,
  INITIAL_GUM,
  INITIAL_REPUTATION,
  TIER_TABLE,
} from '../data/balance';
import { pricesForDay } from '../game/marketPrices';
import { canAffordMaterials, generateOrders, materialsForOrder } from '../game/orderGenerator';
import { resolveDelivery } from '../game/orderResolver';

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

export interface DayLog {
  day: number;
  events: string[]; // last advanceDay's notable events for the player to see
}

export interface PendingMinigame {
  craftId: string;
  category: Category;
  tier: number;
}

interface GameState {
  day: number;
  gum: number;
  reputation: number;
  totalGumEarned: number;
  unlockedFeatures: Feature[];
  consecutiveDeficitDays: number;
  isBankrupt: boolean;
  lastDayLog: DayLog | null;

  materials: Record<MaterialType, number>;
  inventory: EXT[];

  workshop: Workshop;

  employees: Employee[];
  hireMarket: Employee[];

  orderBoard: Order[];
  activeCrafts: ActiveCraft[];
  showcase: ShowcaseItem[];
  pendingMinigame: PendingMinigame | null;

  marketPrices: Record<MaterialType, number>;
  newsTomorrow: NewsItem | null;

  // Actions
  reset: () => void;
  advanceDay: () => void;
  buyMaterial: (mat: MaterialType, qty: number) => boolean;
  sellMaterial: (mat: MaterialType, qty: number) => boolean;
  acceptOrder: (orderId: string) => boolean;
  completeMinigame: (craftId: string, quality: number) => void;
  cancelMinigame: () => void;
}

const initialMaterials: Record<MaterialType, number> = {
  Iron: 0,
  Wood: 0,
  Cloth: 0,
  Gem: 0,
  Mithril: 0,
  Orichalcum: 0,
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

const buildInitialState = () => ({
  day: 1,
  gum: INITIAL_GUM,
  reputation: INITIAL_REPUTATION,
  totalGumEarned: 0,
  unlockedFeatures: [] as Feature[],
  consecutiveDeficitDays: 0,
  isBankrupt: false,
  lastDayLog: null as DayLog | null,
  materials: { ...initialMaterials },
  inventory: [] as EXT[],
  workshop: { ...initialWorkshop },
  employees: [{ ...starterEmployee }],
  hireMarket: [] as Employee[],
  orderBoard: generateOrders({
    day: 1,
    tierMax: initialWorkshop.tierMax,
    reputationLevel: INITIAL_REPUTATION,
    existingCount: 0,
    seed: 'initial-day-1',
  }),
  activeCrafts: [] as ActiveCraft[],
  showcase: [] as ShowcaseItem[],
  pendingMinigame: null as PendingMinigame | null,
  marketPrices: pricesForDay(1),
  newsTomorrow: null as NewsItem | null,
});

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      ...buildInitialState(),

      reset: () => set(buildInitialState()),

      advanceDay: () => {
        const state = get();
        if (state.isBankrupt) return;

        const newDay = state.day + 1;
        const events: string[] = [];

        // 1) Progress active crafts
        const completedCrafts: ActiveCraft[] = [];
        const continuingCrafts: ActiveCraft[] = [];
        state.activeCrafts.forEach((craft) => {
          const remaining = craft.daysRemaining - 1;
          if (remaining <= 0) {
            completedCrafts.push({ ...craft, daysRemaining: 0 });
          } else {
            continuingCrafts.push({ ...craft, daysRemaining: remaining });
          }
        });

        // 2) Resolve completed crafts
        let gum = state.gum;
        let totalGum = state.totalGumEarned;
        let reputation = state.reputation;
        const newInventory = [...state.inventory];
        const fulfilledOrderIds = new Set<string>();

        completedCrafts.forEach((craft) => {
          if (craft.orderId) {
            const order = state.orderBoard.find((o) => o.id === craft.orderId);
            if (!order) {
              events.push(`クラフト#${craft.id} の対応注文が見つからず破棄`);
              return;
            }
            const outcome = resolveDelivery(craft, order);
            gum += outcome.gumDelta;
            if (outcome.gumDelta > 0) totalGum += outcome.gumDelta;
            reputation = Math.max(0, Math.min(100, reputation + outcome.repDelta));
            fulfilledOrderIds.add(order.id);
            events.push(outcome.message);
          } else {
            // Self-craft → push to inventory
            const ext: EXT = {
              id: `ext-${craft.id}`,
              tier: craft.tier,
              category: craft.category,
              quality: craft.quality,
              craftDays: 0,
              materialCost: materialsForOrder(craft.tier),
              hypeBonus: 0,
            };
            newInventory.push(ext);
            events.push(`自作 ${craft.category} Tier ${craft.tier} 完成 (Q${craft.quality})`);
          }
        });

        // 3) Update orders: remove fulfilled, decrement deadlines, drop expired
        const survivingOrders = state.orderBoard
          .filter((o) => !fulfilledOrderIds.has(o.id))
          .map((o) => ({ ...o, deadline: o.deadline - 1 }))
          .filter((o) => {
            if (o.deadline <= 0) {
              events.push(`オーダー ${o.category} Tier ${o.tier} 期限切れで消失`);
              return false;
            }
            return true;
          });

        // 4) Refill order board
        const newOrders = generateOrders({
          day: newDay,
          tierMax: state.workshop.tierMax,
          reputationLevel: reputation,
          existingCount: survivingOrders.length,
          seed: `day-${newDay}-r${reputation}`,
        });

        // 5) Update market prices
        const newPrices = pricesForDay(newDay);

        // 6) Bankrupt detection
        const consecutiveDeficit = gum < 0 ? state.consecutiveDeficitDays + 1 : 0;
        const isBankrupt = consecutiveDeficit >= BANKRUPT_DAYS && newInventory.length === 0;
        if (isBankrupt) events.push('💀 GAME OVER: 連続赤字で工房閉鎖');

        // 7) Free up employees from completed crafts
        const completedEmpIds = new Set(completedCrafts.map((c) => c.employeeId));
        const newEmployees = state.employees.map((e) =>
          completedEmpIds.has(e.id) ? { ...e, state: 'idle' as const } : e,
        );

        set({
          day: newDay,
          gum,
          totalGumEarned: totalGum,
          reputation,
          marketPrices: newPrices,
          activeCrafts: continuingCrafts,
          inventory: newInventory,
          orderBoard: [...survivingOrders, ...newOrders],
          consecutiveDeficitDays: consecutiveDeficit,
          isBankrupt,
          employees: newEmployees,
          lastDayLog: { day: newDay, events },
        });
      },

      buyMaterial: (mat, qty) => {
        const state = get();
        if (qty <= 0) return false;
        const cost = state.marketPrices[mat] * qty;
        if (state.gum < cost) return false;
        set({
          gum: state.gum - cost,
          materials: { ...state.materials, [mat]: state.materials[mat] + qty },
        });
        return true;
      },

      sellMaterial: (mat, qty) => {
        const state = get();
        if (qty <= 0) return false;
        if (state.materials[mat] < qty) return false;
        const revenue = Math.floor(state.marketPrices[mat] * qty * 0.7); // 30% spread
        set({
          gum: state.gum + revenue,
          materials: { ...state.materials, [mat]: state.materials[mat] - qty },
        });
        return true;
      },

      acceptOrder: (orderId) => {
        const state = get();
        const order = state.orderBoard.find((o) => o.id === orderId);
        if (!order) return false;

        const required = materialsForOrder(order.tier);
        if (!canAffordMaterials(required, state.materials)) return false;

        const idleEmp = state.employees.find((e) => e.state === 'idle');
        if (!idleEmp) return false;

        if (state.activeCrafts.length >= state.workshop.slots) return false;

        // Deduct materials
        const newMaterials = { ...state.materials };
        for (const [mat, qty] of Object.entries(required)) {
          newMaterials[mat as MaterialType] -= qty ?? 0;
        }

        // Create active craft (quality 0 until minigame fills it)
        const tierDef = TIER_TABLE[order.tier]!;
        const craftId = `craft-${state.day}-${order.id}`;
        const newCraft: ActiveCraft = {
          id: craftId,
          orderId: order.id,
          category: order.category,
          tier: order.tier,
          employeeId: idleEmp.id,
          daysRemaining: tierDef.craftDays,
          quality: 0,
        };

        set({
          materials: newMaterials,
          activeCrafts: [...state.activeCrafts, newCraft],
          employees: state.employees.map((e) =>
            e.id === idleEmp.id ? { ...e, state: 'crafting' as const } : e,
          ),
          pendingMinigame: { craftId, category: order.category, tier: order.tier },
        });
        return true;
      },

      completeMinigame: (craftId, quality) => {
        const state = get();
        set({
          activeCrafts: state.activeCrafts.map((c) =>
            c.id === craftId ? { ...c, quality: Math.round(Math.max(0, Math.min(100, quality))) } : c,
          ),
          pendingMinigame: null,
        });
      },

      cancelMinigame: () => {
        // Refund the materials and remove the craft (player aborted)
        const state = get();
        const pending = state.pendingMinigame;
        if (!pending) return;
        const craft = state.activeCrafts.find((c) => c.id === pending.craftId);
        if (!craft) {
          set({ pendingMinigame: null });
          return;
        }
        const refund = materialsForOrder(craft.tier);
        const newMaterials = { ...state.materials };
        for (const [mat, qty] of Object.entries(refund)) {
          newMaterials[mat as MaterialType] += qty ?? 0;
        }
        set({
          materials: newMaterials,
          activeCrafts: state.activeCrafts.filter((c) => c.id !== craft.id),
          employees: state.employees.map((e) =>
            e.id === craft.employeeId ? { ...e, state: 'idle' as const } : e,
          ),
          pendingMinigame: null,
        });
      },
    }),
    {
      name: 'mcf-save-v1',
      partialize: (s) => ({
        // Persist game state but not the pendingMinigame UI flag
        day: s.day,
        gum: s.gum,
        reputation: s.reputation,
        totalGumEarned: s.totalGumEarned,
        unlockedFeatures: s.unlockedFeatures,
        consecutiveDeficitDays: s.consecutiveDeficitDays,
        isBankrupt: s.isBankrupt,
        materials: s.materials,
        inventory: s.inventory,
        workshop: s.workshop,
        employees: s.employees,
        orderBoard: s.orderBoard,
        activeCrafts: s.activeCrafts,
        showcase: s.showcase,
        marketPrices: s.marketPrices,
      }),
    },
  ),
);

// Re-export for easy access (used by UI)
export { BASE_MATERIAL_PRICES };
