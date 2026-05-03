import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ActiveCraft,
  Category,
  Employee,
  EXT,
  Feature,
  GatherDispatch,
  MaterialType,
  NewsItem,
  Order,
  ShowcaseItem,
  Workshop,
} from '../game/types';
import {
  BANKRUPT_DAYS,
  BASE_MATERIAL_PRICES,
  COMMON_INITIAL_STAMINA,
  EMPLOYEE_LV_UP_COST,
  EMPLOYEE_MAX_LEVEL,
  GATHER_DAYS,
  INITIAL_GUM,
  INITIAL_REPUTATION,
  LEGACY_SAVE_KEY,
  SAVE_KEY,
  SAVE_VERSION,
  SHOWCASE_MAX_LISTED,
  STAMINA_MAX,
  STAMINA_PER_CRAFT,
  TIER_TABLE,
  WORKSHOP_LV_UP_COSTS,
  WORKSHOP_MAX_LEVEL,
} from '../data/balance';
import seedrandom from 'seedrandom';
import { isBiddable, judgeBidding } from '../game/biddingJudge';
import { applyEmployeeBonus } from '../game/craftJudge';
import { demandFactorsForDay, trendForDay } from '../game/demandTrend';
import { computeUnlocks, featureLabel, newlyUnlocked } from '../game/featureUnlocks';
import { findNode, runGather } from '../game/gatherEngine';
import { generateHireMarket } from '../game/hireGenerator';
import { pricesForDay } from '../game/marketPrices';
import { autoDiscount, fairPriceForExt, simulateSale } from '../game/marketSimulator';
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
  events: string[];
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
  /** One-shot UI messages (e.g., bidding loss) shown as toasts. */
  transientMessages: string[];

  materials: Record<MaterialType, number>;
  inventory: EXT[];

  workshop: Workshop;

  employees: Employee[];
  hireMarket: Employee[];

  orderBoard: Order[];
  activeCrafts: ActiveCraft[];
  showcase: ShowcaseItem[];
  pendingMinigame: PendingMinigame | null;

  // Phase 4
  gatherDispatches: GatherDispatch[];

  marketPrices: Record<MaterialType, number>;
  newsTomorrow: NewsItem | null;
  newsAfterTomorrow: NewsItem | null;

  // Actions
  reset: () => void;
  advanceDay: () => void;
  buyMaterial: (mat: MaterialType, qty: number) => boolean;
  sellMaterial: (mat: MaterialType, qty: number) => boolean;
  acceptOrder: (orderId: string, employeeId?: string) => boolean;
  completeMinigame: (craftId: string, quality: number) => void;
  cancelMinigame: () => void;
  hireEmployee: (candidateId: string) => boolean;
  levelUpEmployee: (employeeId: string) => boolean;
  levelUpWorkshop: () => boolean;
  restEmployee: (employeeId: string) => boolean;
  dismissTransientMessage: (index: number) => void;
  // Phase 4 actions
  startSelfCraft: (category: Category, tier: number, employeeId?: string) => boolean;
  dispatchGather: (employeeId: string, nodeId: string) => boolean;
  listShowcaseItem: (extId: string, price: number) => boolean;
  unlistShowcaseItem: (showcaseItemId: string) => boolean;
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
  stamina: COMMON_INITIAL_STAMINA,
  wage: 0, // starter is free
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
  transientMessages: [] as string[],
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
  gatherDispatches: [] as GatherDispatch[],
  marketPrices: pricesForDay(1),
  newsTomorrow: trendForDay(2) as NewsItem | null,
  newsAfterTomorrow: trendForDay(3) as NewsItem | null,
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
          if (remaining <= 0) completedCrafts.push({ ...craft, daysRemaining: 0 });
          else continuingCrafts.push({ ...craft, daysRemaining: remaining });
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

        // 3) Update orders
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

        // 5b) Process gather dispatches (Phase 4)
        const completedDispatches: GatherDispatch[] = [];
        const continuingDispatches: GatherDispatch[] = [];
        state.gatherDispatches.forEach((d) => {
          const remaining = d.daysRemaining - 1;
          if (remaining <= 0) completedDispatches.push({ ...d, daysRemaining: 0 });
          else continuingDispatches.push({ ...d, daysRemaining: remaining });
        });

        const newMaterials = { ...state.materials };
        const completedDispatchEmpIds = new Set<string>();
        completedDispatches.forEach((d) => {
          const node = findNode(d.nodeId);
          const employee = state.employees.find((e) => e.id === d.employeeId);
          if (!node || !employee) return;
          const rng = seedrandom(`gather-d${newDay}-${d.id}`);
          const result = runGather(node, employee, () => rng());
          for (const [mat, n] of Object.entries(result.drops)) {
            newMaterials[mat as MaterialType] = (newMaterials[mat as MaterialType] ?? 0) + (n ?? 0);
          }
          const summary = Object.entries(result.drops)
            .map(([m, n]) => `${m}×${n}`)
            .join(' ');
          events.push(`採集 ${node.name} (${employee.name}): ${summary}`);
          if (result.rareDrops.length > 0) {
            events.push(`✨ レア素材獲得: ${result.rareDrops.join(', ')}`);
          }
          completedDispatchEmpIds.add(employee.id);
        });

        // 6) Free up employees from completed crafts/dispatches + apply rest recovery
        const completedEmpIds = new Set(completedCrafts.map((c) => c.employeeId));
        const newEmployees = state.employees.map((e) => {
          const next = { ...e };
          if (completedEmpIds.has(e.id) || completedDispatchEmpIds.has(e.id)) {
            next.state = 'idle';
          }
          if (next.state === 'resting') {
            next.stamina = STAMINA_MAX;
            next.state = 'idle';
            events.push(`${next.name} が休養から復帰 (Stamina ${STAMINA_MAX})`);
          }
          return next;
        });

        // 7) Daily wage deduction
        const totalWages = newEmployees.reduce((sum, e) => sum + (e.wage ?? 0), 0);
        if (totalWages > 0) {
          gum -= totalWages;
          events.push(`日給支払: -${totalWages} GUM (${newEmployees.filter((e) => (e.wage ?? 0) > 0).length} 名)`);
        }

        // 8) Refresh hire market (only if HIRE feature is unlocked)
        const featuresAfter = computeUnlocks(state.unlockedFeatures, {
          totalGumEarned: totalGum,
          workshop: state.workshop,
          employeeCount: newEmployees.length,
        });
        const justUnlocked = newlyUnlocked(state.unlockedFeatures, featuresAfter);
        justUnlocked.forEach((f) => events.push(`${featureLabel(f)} が解放されました！`));

        const newHireMarket = featuresAfter.includes('HIRE')
          ? generateHireMarket({ day: newDay })
          : [];

        // 8b) Process showcase sales (Phase 4)
        const factors = demandFactorsForDay(newDay);
        const remainingShowcase: ShowcaseItem[] = [];
        state.showcase.forEach((item) => {
          const rng = seedrandom(`sale-d${newDay}-${item.id}`);
          const outcome = simulateSale({
            item,
            demandFactor: factors[item.ext.category],
            rng: () => rng(),
          });
          if (outcome.sold) {
            gum += outcome.revenue;
            totalGum += outcome.revenue;
            events.push(`💰 売却: ${item.ext.category} Tier ${item.ext.tier} (Q${item.ext.quality}) → ${outcome.revenue.toLocaleString()} GUM`);
          } else {
            const newPrice = autoDiscount(item);
            const aged: ShowcaseItem = {
              ...item,
              price: newPrice,
              daysListed: item.daysListed + 1,
            };
            remainingShowcase.push(aged);
            if (newPrice < item.price) {
              events.push(`📉 売れ残り: ${item.ext.category} Tier ${item.ext.tier} → 値下げ ${item.price} → ${newPrice} GUM`);
            }
          }
        });

        // 9) Bankrupt detection
        const consecutiveDeficit = gum < 0 ? state.consecutiveDeficitDays + 1 : 0;
        const isBankrupt = consecutiveDeficit >= BANKRUPT_DAYS && newInventory.length === 0 && remainingShowcase.length === 0;
        if (isBankrupt) events.push('💀 GAME OVER: 連続赤字で工房閉鎖');

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
          hireMarket: newHireMarket,
          unlockedFeatures: featuresAfter,
          lastDayLog: { day: newDay, events },
          newsTomorrow: trendForDay(newDay + 1),
          newsAfterTomorrow: trendForDay(newDay + 2),
          transientMessages: [], // clear toasts on day advance
          gatherDispatches: continuingDispatches,
          showcase: remainingShowcase,
          materials: newMaterials,
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
        const revenue = Math.floor(state.marketPrices[mat] * qty * 0.7);
        set({
          gum: state.gum + revenue,
          materials: { ...state.materials, [mat]: state.materials[mat] - qty },
        });
        return true;
      },

      acceptOrder: (orderId, employeeId) => {
        const state = get();
        const order = state.orderBoard.find((o) => o.id === orderId);
        if (!order) return false;

        const required = materialsForOrder(order.tier);
        if (!canAffordMaterials(required, state.materials)) return false;

        const candidate = employeeId
          ? state.employees.find((e) => e.id === employeeId)
          : state.employees.find((e) => e.state === 'idle' && e.stamina >= STAMINA_PER_CRAFT);

        if (!candidate) return false;
        if (candidate.state !== 'idle') return false;
        if (candidate.stamina < STAMINA_PER_CRAFT) return false;
        if (state.activeCrafts.length >= state.workshop.slots) return false;
        if (order.tier > state.workshop.tierMax) return false;

        // Phase 3: bid against NPC competitors for high-tier orders BEFORE consuming materials
        if (isBiddable(order.tier) && order.bidders > 0) {
          const rng = seedrandom(`bid-d${state.day}-${order.id}-r${state.reputation}`);
          const outcome = judgeBidding({
            reputation: state.reputation,
            playerEdge: order.playerEdge,
            bidders: order.bidders,
            rng: () => rng(),
          });
          if (!outcome.won) {
            // Lose: order disappears from board, no materials consumed, no rep penalty
            set({
              orderBoard: state.orderBoard.filter((o) => o.id !== order.id),
              transientMessages: [
                ...state.transientMessages,
                `🚫 失注: ${order.category} Tier ${order.tier} は競合に取られた (${order.bidders} 人入札)`,
              ],
            });
            return false;
          }
        }

        // Deduct materials
        const newMaterials = { ...state.materials };
        for (const [mat, qty] of Object.entries(required)) {
          newMaterials[mat as MaterialType] -= qty ?? 0;
        }

        const tierDef = TIER_TABLE[order.tier]!;
        const craftId = `craft-${state.day}-${order.id}`;
        const newCraft: ActiveCraft = {
          id: craftId,
          orderId: order.id,
          category: order.category,
          tier: order.tier,
          employeeId: candidate.id,
          daysRemaining: tierDef.craftDays,
          quality: 0,
        };

        set({
          materials: newMaterials,
          activeCrafts: [...state.activeCrafts, newCraft],
          employees: state.employees.map((e) =>
            e.id === candidate.id
              ? { ...e, state: 'crafting' as const, stamina: Math.max(0, e.stamina - STAMINA_PER_CRAFT) }
              : e,
          ),
          pendingMinigame: { craftId, category: order.category, tier: order.tier },
        });
        return true;
      },

      completeMinigame: (craftId, rawQuality) => {
        const state = get();
        const craft = state.activeCrafts.find((c) => c.id === craftId);
        if (!craft) {
          set({ pendingMinigame: null });
          return;
        }
        const employee = state.employees.find((e) => e.id === craft.employeeId);
        const adjustedQuality = employee
          ? applyEmployeeBonus(rawQuality, employee, craft.category)
          : Math.round(Math.max(0, Math.min(100, rawQuality)));

        set({
          activeCrafts: state.activeCrafts.map((c) =>
            c.id === craftId ? { ...c, quality: adjustedQuality } : c,
          ),
          pendingMinigame: null,
        });
      },

      cancelMinigame: () => {
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
        // Refund stamina too
        set({
          materials: newMaterials,
          activeCrafts: state.activeCrafts.filter((c) => c.id !== craft.id),
          employees: state.employees.map((e) =>
            e.id === craft.employeeId
              ? { ...e, state: 'idle' as const, stamina: Math.min(STAMINA_MAX, e.stamina + STAMINA_PER_CRAFT) }
              : e,
          ),
          pendingMinigame: null,
        });
      },

      hireEmployee: (candidateId) => {
        const state = get();
        if (!state.unlockedFeatures.includes('HIRE')) return false;
        const candidate = state.hireMarket.find((c) => c.id === candidateId);
        if (!candidate) return false;
        // First wage paid up-front
        if (state.gum < candidate.wage) return false;
        const newId = `emp-${state.day}-${state.employees.length}`;
        const hired: Employee = { ...candidate, id: newId, state: 'idle', stamina: STAMINA_MAX };
        set({
          gum: state.gum - candidate.wage,
          employees: [...state.employees, hired],
          hireMarket: state.hireMarket.filter((c) => c.id !== candidateId),
        });
        return true;
      },

      levelUpEmployee: (employeeId) => {
        const state = get();
        const emp = state.employees.find((e) => e.id === employeeId);
        if (!emp) return false;
        if (emp.craftLv >= EMPLOYEE_MAX_LEVEL) return false;
        if (state.gum < EMPLOYEE_LV_UP_COST) return false;
        set({
          gum: state.gum - EMPLOYEE_LV_UP_COST,
          employees: state.employees.map((e) =>
            e.id === employeeId ? { ...e, craftLv: e.craftLv + 1 } : e,
          ),
        });
        return true;
      },

      levelUpWorkshop: () => {
        const state = get();
        if (!state.unlockedFeatures.includes('WORKSHOP_UP')) return false;
        if (state.workshop.level >= WORKSHOP_MAX_LEVEL) return false;
        const cost = WORKSHOP_LV_UP_COSTS[state.workshop.level];
        if (cost == null) return false;
        if (state.gum < cost) return false;
        const newLevel = state.workshop.level + 1;
        const newWorkshop: Workshop = {
          level: newLevel,
          slots: state.workshop.slots + 1,
          tierMax: state.workshop.tierMax + 1,
        };
        // Re-evaluate features (HIGH_TIER may unlock now)
        const featuresAfter = computeUnlocks(state.unlockedFeatures, {
          totalGumEarned: state.totalGumEarned,
          workshop: newWorkshop,
          employeeCount: state.employees.length,
        });
        set({ gum: state.gum - cost, workshop: newWorkshop, unlockedFeatures: featuresAfter });
        return true;
      },

      restEmployee: (employeeId) => {
        const state = get();
        const emp = state.employees.find((e) => e.id === employeeId);
        if (!emp) return false;
        if (emp.state !== 'idle') return false;
        set({
          employees: state.employees.map((e) =>
            e.id === employeeId ? { ...e, state: 'resting' as const } : e,
          ),
        });
        return true;
      },

      dismissTransientMessage: (index) => {
        const state = get();
        set({ transientMessages: state.transientMessages.filter((_, i) => i !== index) });
      },

      // ----- Phase 4 actions -----

      startSelfCraft: (category, tier, employeeId) => {
        const state = get();
        if (!state.unlockedFeatures.includes('SELF_CRAFT')) return false;
        if (tier < 1 || tier > state.workshop.tierMax) return false;

        const required = materialsForOrder(tier);
        if (!canAffordMaterials(required, state.materials)) return false;

        const candidate = employeeId
          ? state.employees.find((e) => e.id === employeeId)
          : state.employees.find((e) => e.state === 'idle' && e.stamina >= STAMINA_PER_CRAFT);
        if (!candidate) return false;
        if (candidate.state !== 'idle') return false;
        if (candidate.stamina < STAMINA_PER_CRAFT) return false;
        if (state.activeCrafts.length >= state.workshop.slots) return false;

        const newMaterials = { ...state.materials };
        for (const [mat, qty] of Object.entries(required)) {
          newMaterials[mat as MaterialType] -= qty ?? 0;
        }

        const tierDef = TIER_TABLE[tier]!;
        const craftId = `craft-self-${state.day}-${candidate.id}-${Date.now()}`;
        const newCraft: ActiveCraft = {
          id: craftId,
          orderId: null,
          category,
          tier,
          employeeId: candidate.id,
          daysRemaining: tierDef.craftDays,
          quality: 0,
        };

        set({
          materials: newMaterials,
          activeCrafts: [...state.activeCrafts, newCraft],
          employees: state.employees.map((e) =>
            e.id === candidate.id
              ? { ...e, state: 'crafting' as const, stamina: Math.max(0, e.stamina - STAMINA_PER_CRAFT) }
              : e,
          ),
          pendingMinigame: { craftId, category, tier },
        });
        return true;
      },

      dispatchGather: (employeeId, nodeId) => {
        const state = get();
        if (!state.unlockedFeatures.includes('SELF_CRAFT')) return false;
        const node = findNode(nodeId);
        if (!node) return false;
        const emp = state.employees.find((e) => e.id === employeeId);
        if (!emp) return false;
        if (emp.state !== 'idle') return false;

        const dispatch: GatherDispatch = {
          id: `gather-d${state.day}-${employeeId}-${Date.now()}`,
          employeeId,
          nodeId,
          daysRemaining: GATHER_DAYS,
        };
        set({
          gatherDispatches: [...state.gatherDispatches, dispatch],
          employees: state.employees.map((e) =>
            e.id === employeeId ? { ...e, state: 'gathering' as const } : e,
          ),
        });
        return true;
      },

      listShowcaseItem: (extId, price) => {
        const state = get();
        if (!state.unlockedFeatures.includes('SELF_CRAFT')) return false;
        if (state.showcase.length >= SHOWCASE_MAX_LISTED) return false;
        const ext = state.inventory.find((i) => i.id === extId);
        if (!ext) return false;

        const fair = fairPriceForExt(ext);
        const minPrice = Math.floor(fair * 0.5);
        const maxPrice = Math.ceil(fair * 1.5);
        const clampedPrice = Math.max(minPrice, Math.min(maxPrice, Math.round(price)));

        const item: ShowcaseItem = {
          id: `show-${extId}-${state.day}`,
          ext,
          price: clampedPrice,
          daysListed: 0,
        };
        set({
          inventory: state.inventory.filter((i) => i.id !== extId),
          showcase: [...state.showcase, item],
        });
        return true;
      },

      unlistShowcaseItem: (showcaseItemId) => {
        const state = get();
        const item = state.showcase.find((i) => i.id === showcaseItemId);
        if (!item) return false;
        set({
          showcase: state.showcase.filter((i) => i.id !== showcaseItemId),
          inventory: [...state.inventory, item.ext],
        });
        return true;
      },
    }),
    {
      name: SAVE_KEY,
      version: SAVE_VERSION,
      partialize: (s) => ({
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
        hireMarket: s.hireMarket,
        orderBoard: s.orderBoard,
        activeCrafts: s.activeCrafts,
        showcase: s.showcase,
        marketPrices: s.marketPrices,
        newsTomorrow: s.newsTomorrow,
        newsAfterTomorrow: s.newsAfterTomorrow,
        gatherDispatches: s.gatherDispatches,
      }),
    },
  ),
);

/**
 * Best-effort cleanup of the legacy v1 save key on first import.
 * Runs once when the module loads. Safe in SSR (typeof check).
 */
if (typeof window !== 'undefined') {
  try {
    if (window.localStorage.getItem(LEGACY_SAVE_KEY)) {
      window.localStorage.removeItem(LEGACY_SAVE_KEY);
    }
  } catch {
    // ignore (private browsing etc)
  }
}

/** Reset save data and reload the page — exposed for the "セーブ初期化" button. */
export function clearSaveAndReset() {
  useGameStore.getState().reset();
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(SAVE_KEY);
      window.localStorage.removeItem(LEGACY_SAVE_KEY);
    } catch {
      // ignore
    }
  }
}

export { BASE_MATERIAL_PRICES };
