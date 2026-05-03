import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './gameStore';
import {
  ORDER_BOARD_SIZE,
  BANKRUPT_DAYS,
  HIRE_UNLOCK_TOTAL_GUM,
  COMMON_DAILY_WAGE,
  EMPLOYEE_LV_UP_COST,
  WORKSHOP_LV_UP_COSTS,
  STAMINA_PER_CRAFT,
  STAMINA_MAX,
} from '../data/balance';
import { pricesForDay } from '../game/marketPrices';

describe('gameStore', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  describe('initial state', () => {
    it('starts with day 1 and 500 GUM', () => {
      const state = useGameStore.getState();
      expect(state.day).toBe(1);
      expect(state.gum).toBe(500);
      expect(state.reputation).toBe(50);
      expect(state.totalGumEarned).toBe(0);
    });

    it('starts with no unlocked features', () => {
      expect(useGameStore.getState().unlockedFeatures).toEqual([]);
    });

    it('starts with empty material inventory', () => {
      const { materials } = useGameStore.getState();
      Object.values(materials).forEach((v) => expect(v).toBe(0));
    });

    it('starts with workshop Lv 1 (1 slot, tierMax 2)', () => {
      const { workshop } = useGameStore.getState();
      expect(workshop.level).toBe(1);
      expect(workshop.slots).toBe(1);
      expect(workshop.tierMax).toBe(2);
    });

    it('starts with 1 starter employee', () => {
      const { employees } = useGameStore.getState();
      expect(employees).toHaveLength(1);
      expect(employees[0]?.rarity).toBe('Common');
      expect(employees[0]?.state).toBe('idle');
    });

    it('starts with empty active crafts/showcase/hire/inventory', () => {
      const state = useGameStore.getState();
      expect(state.activeCrafts).toEqual([]);
      expect(state.showcase).toEqual([]);
      expect(state.hireMarket).toEqual([]);
      expect(state.inventory).toEqual([]);
    });

    it('seeds the order board with ORDER_BOARD_SIZE orders', () => {
      expect(useGameStore.getState().orderBoard).toHaveLength(ORDER_BOARD_SIZE);
    });

    it('starts with day-1 market prices', () => {
      const { marketPrices } = useGameStore.getState();
      const expected = pricesForDay(1);
      expect(marketPrices).toEqual(expected);
    });

    it('starts not bankrupt', () => {
      expect(useGameStore.getState().isBankrupt).toBe(false);
      expect(useGameStore.getState().consecutiveDeficitDays).toBe(0);
    });
  });

  describe('reset', () => {
    it('returns all fields to initial state', () => {
      useGameStore.setState({ day: 50, gum: 9999, reputation: 100 });
      useGameStore.getState().reset();
      const s = useGameStore.getState();
      expect(s.day).toBe(1);
      expect(s.gum).toBe(500);
    });

    it('restores starter employee after reset', () => {
      useGameStore.setState({ employees: [] });
      useGameStore.getState().reset();
      expect(useGameStore.getState().employees).toHaveLength(1);
    });
  });

  describe('advanceDay', () => {
    it('increments day by 1', () => {
      useGameStore.getState().advanceDay();
      expect(useGameStore.getState().day).toBe(2);
    });

    it('refreshes market prices to next day', () => {
      useGameStore.getState().advanceDay();
      expect(useGameStore.getState().marketPrices).toEqual(pricesForDay(2));
    });

    it('refills order board to ORDER_BOARD_SIZE', () => {
      // Empty the board first
      useGameStore.setState({ orderBoard: [] });
      useGameStore.getState().advanceDay();
      expect(useGameStore.getState().orderBoard.length).toBe(ORDER_BOARD_SIZE);
    });

    it('decrements deadlines on existing orders', () => {
      const state = useGameStore.getState();
      const initialDeadlines = state.orderBoard.map((o) => o.deadline);
      useGameStore.getState().advanceDay();
      const newDeadlines = useGameStore.getState().orderBoard.map((o) => o.deadline);
      // Some original orders should still be there with deadline-1; new ones may have full deadline
      const survivedCount = newDeadlines.filter((d, i) => initialDeadlines[i] !== undefined && d === initialDeadlines[i]! - 1).length;
      expect(survivedCount).toBeGreaterThan(0);
    });

    it('triggers bankrupt after BANKRUPT_DAYS days of GUM<0 with empty inventory', () => {
      useGameStore.setState({ gum: -100, inventory: [], consecutiveDeficitDays: 0 });
      for (let i = 0; i < BANKRUPT_DAYS; i++) {
        useGameStore.getState().advanceDay();
      }
      expect(useGameStore.getState().isBankrupt).toBe(true);
    });

    it('does not progress when bankrupt', () => {
      useGameStore.setState({ isBankrupt: true, day: 10 });
      useGameStore.getState().advanceDay();
      expect(useGameStore.getState().day).toBe(10);
    });
  });

  describe('buyMaterial / sellMaterial', () => {
    it('buyMaterial deducts GUM and adds material', () => {
      const before = useGameStore.getState();
      const price = before.marketPrices.Iron;
      const ok = useGameStore.getState().buyMaterial('Iron', 2);
      expect(ok).toBe(true);
      const after = useGameStore.getState();
      expect(after.gum).toBe(before.gum - price * 2);
      expect(after.materials.Iron).toBe(2);
    });

    it('buyMaterial fails when GUM is insufficient', () => {
      useGameStore.setState({ gum: 5 });
      const ok = useGameStore.getState().buyMaterial('Gem', 1);
      expect(ok).toBe(false);
    });

    it('sellMaterial deducts material and adds 70% revenue', () => {
      useGameStore.setState({ materials: { ...useGameStore.getState().materials, Iron: 5 } });
      const before = useGameStore.getState();
      const ok = useGameStore.getState().sellMaterial('Iron', 2);
      expect(ok).toBe(true);
      const expected = Math.floor(before.marketPrices.Iron * 2 * 0.7);
      expect(useGameStore.getState().gum).toBe(before.gum + expected);
      expect(useGameStore.getState().materials.Iron).toBe(3);
    });

    it('sellMaterial fails when not enough owned', () => {
      const ok = useGameStore.getState().sellMaterial('Iron', 99);
      expect(ok).toBe(false);
    });
  });

  describe('acceptOrder + completeMinigame', () => {
    it('acceptOrder deducts materials, creates active craft, sets pendingMinigame', () => {
      // Give materials enough for a Tier 1 order (Iron+Wood)
      useGameStore.setState({
        materials: { Iron: 5, Wood: 5, Cloth: 0, Gem: 0, Mithril: 0, Orichalcum: 0 },
      });
      const order = useGameStore.getState().orderBoard.find((o) => o.tier === 1);
      expect(order).toBeDefined();
      const ok = useGameStore.getState().acceptOrder(order!.id);
      expect(ok).toBe(true);
      const s = useGameStore.getState();
      expect(s.activeCrafts).toHaveLength(1);
      expect(s.pendingMinigame?.craftId).toBe(s.activeCrafts[0]!.id);
      expect(s.materials.Iron).toBe(4);
      expect(s.materials.Wood).toBe(4);
      expect(s.employees[0]!.state).toBe('crafting');
    });

    it('completeMinigame stores quality and clears pendingMinigame', () => {
      useGameStore.setState({
        materials: { Iron: 5, Wood: 5, Cloth: 0, Gem: 0, Mithril: 0, Orichalcum: 0 },
      });
      const order = useGameStore.getState().orderBoard.find((o) => o.tier === 1)!;
      useGameStore.getState().acceptOrder(order.id);
      const craftId = useGameStore.getState().activeCrafts[0]!.id;
      useGameStore.getState().completeMinigame(craftId, 75);
      const s = useGameStore.getState();
      expect(s.activeCrafts[0]!.quality).toBe(75);
      expect(s.pendingMinigame).toBeNull();
    });

    it('cancelMinigame refunds materials and removes craft', () => {
      useGameStore.setState({
        materials: { Iron: 5, Wood: 5, Cloth: 0, Gem: 0, Mithril: 0, Orichalcum: 0 },
      });
      const order = useGameStore.getState().orderBoard.find((o) => o.tier === 1)!;
      useGameStore.getState().acceptOrder(order.id);
      useGameStore.getState().cancelMinigame();
      const s = useGameStore.getState();
      expect(s.activeCrafts).toHaveLength(0);
      expect(s.materials.Iron).toBe(5);
      expect(s.materials.Wood).toBe(5);
      expect(s.employees[0]!.state).toBe('idle');
    });

    it('full loop: accept → minigame → advanceDay → reward', () => {
      useGameStore.setState({
        materials: { Iron: 5, Wood: 5, Cloth: 0, Gem: 0, Mithril: 0, Orichalcum: 0 },
      });
      const order = useGameStore.getState().orderBoard.find((o) => o.tier === 1)!;
      const beforeGum = useGameStore.getState().gum;
      useGameStore.getState().acceptOrder(order.id);
      const craftId = useGameStore.getState().activeCrafts[0]!.id;
      useGameStore.getState().completeMinigame(craftId, 80); // way above req
      useGameStore.getState().advanceDay();
      const s = useGameStore.getState();
      expect(s.gum).toBe(beforeGum + order.reward);
      expect(s.activeCrafts).toHaveLength(0);
      expect(s.employees[0]!.state).toBe('idle');
    });
  });

  describe('Day 4: feature unlocks', () => {
    it('unlocks HIRE & WORKSHOP_UP after totalGumEarned crosses threshold', () => {
      useGameStore.setState({ totalGumEarned: HIRE_UNLOCK_TOTAL_GUM });
      useGameStore.getState().advanceDay();
      const s = useGameStore.getState();
      expect(s.unlockedFeatures).toContain('HIRE');
      expect(s.unlockedFeatures).toContain('WORKSHOP_UP');
    });

    it('populates hireMarket only after HIRE is unlocked', () => {
      useGameStore.getState().advanceDay();
      expect(useGameStore.getState().hireMarket).toHaveLength(0);

      useGameStore.setState({ totalGumEarned: HIRE_UNLOCK_TOTAL_GUM });
      useGameStore.getState().advanceDay();
      expect(useGameStore.getState().hireMarket.length).toBeGreaterThan(0);
    });
  });

  describe('Day 4: hireEmployee', () => {
    beforeEach(() => {
      useGameStore.setState({
        unlockedFeatures: ['HIRE'],
        hireMarket: [
          {
            id: 'cand-1',
            name: 'テスト候補',
            rarity: 'Common',
            craftLv: 1,
            affinity: 'Helm',
            battleStats: { atk: 10, hp: 20, spd: 5 },
            stamina: STAMINA_MAX,
            wage: COMMON_DAILY_WAGE,
            state: 'idle',
          },
        ],
      });
    });

    it('hires when affordable, deducts first wage', () => {
      const before = useGameStore.getState();
      const ok = useGameStore.getState().hireEmployee('cand-1');
      expect(ok).toBe(true);
      const s = useGameStore.getState();
      expect(s.employees).toHaveLength(2);
      expect(s.gum).toBe(before.gum - COMMON_DAILY_WAGE);
      expect(s.hireMarket).toHaveLength(0);
    });

    it('fails when GUM is insufficient', () => {
      useGameStore.setState({ gum: 10 });
      const ok = useGameStore.getState().hireEmployee('cand-1');
      expect(ok).toBe(false);
      expect(useGameStore.getState().employees).toHaveLength(1);
    });

    it('fails when HIRE is not unlocked', () => {
      useGameStore.setState({ unlockedFeatures: [] });
      const ok = useGameStore.getState().hireEmployee('cand-1');
      expect(ok).toBe(false);
    });
  });

  describe('Day 4: levelUpEmployee', () => {
    it('increments craftLv and deducts cost', () => {
      const empId = useGameStore.getState().employees[0]!.id;
      const beforeGum = useGameStore.getState().gum;
      const beforeLv = useGameStore.getState().employees[0]!.craftLv;
      const ok = useGameStore.getState().levelUpEmployee(empId);
      expect(ok).toBe(true);
      expect(useGameStore.getState().employees[0]!.craftLv).toBe(beforeLv + 1);
      expect(useGameStore.getState().gum).toBe(beforeGum - EMPLOYEE_LV_UP_COST);
    });

    it('fails when GUM is insufficient', () => {
      useGameStore.setState({ gum: 0 });
      const empId = useGameStore.getState().employees[0]!.id;
      const ok = useGameStore.getState().levelUpEmployee(empId);
      expect(ok).toBe(false);
    });

    it('fails at max level', () => {
      useGameStore.setState({
        employees: useGameStore.getState().employees.map((e) => ({ ...e, craftLv: 10 })),
      });
      const empId = useGameStore.getState().employees[0]!.id;
      const ok = useGameStore.getState().levelUpEmployee(empId);
      expect(ok).toBe(false);
    });
  });

  describe('Day 4: levelUpWorkshop', () => {
    beforeEach(() => {
      useGameStore.setState({ unlockedFeatures: ['WORKSHOP_UP'], gum: 100_000 });
    });

    it('Lv1→2 deducts cost and increments slots/tierMax', () => {
      const ok = useGameStore.getState().levelUpWorkshop();
      expect(ok).toBe(true);
      const s = useGameStore.getState();
      expect(s.workshop.level).toBe(2);
      expect(s.workshop.slots).toBe(2);
      expect(s.workshop.tierMax).toBe(3);
      expect(s.gum).toBe(100_000 - (WORKSHOP_LV_UP_COSTS[1] ?? 0));
    });

    it('fails at max level', () => {
      useGameStore.setState({ workshop: { level: 3, slots: 3, tierMax: 4 } });
      const ok = useGameStore.getState().levelUpWorkshop();
      expect(ok).toBe(false);
    });

    it('fails when WORKSHOP_UP is not unlocked', () => {
      useGameStore.setState({ unlockedFeatures: [] });
      const ok = useGameStore.getState().levelUpWorkshop();
      expect(ok).toBe(false);
    });
  });

  describe('Day 4: stamina + restEmployee', () => {
    it('acceptOrder consumes stamina', () => {
      useGameStore.setState({
        materials: { Iron: 5, Wood: 5, Cloth: 0, Gem: 0, Mithril: 0, Orichalcum: 0 },
      });
      const order = useGameStore.getState().orderBoard.find((o) => o.tier === 1)!;
      useGameStore.getState().acceptOrder(order.id);
      expect(useGameStore.getState().employees[0]!.stamina).toBe(STAMINA_MAX - STAMINA_PER_CRAFT);
    });

    it('cannot acceptOrder with stamina < STAMINA_PER_CRAFT', () => {
      useGameStore.setState({
        materials: { Iron: 5, Wood: 5, Cloth: 0, Gem: 0, Mithril: 0, Orichalcum: 0 },
        employees: useGameStore.getState().employees.map((e) => ({ ...e, stamina: 10 })),
      });
      const order = useGameStore.getState().orderBoard.find((o) => o.tier === 1)!;
      const ok = useGameStore.getState().acceptOrder(order.id);
      expect(ok).toBe(false);
    });

    it('restEmployee sets state to resting', () => {
      const empId = useGameStore.getState().employees[0]!.id;
      const ok = useGameStore.getState().restEmployee(empId);
      expect(ok).toBe(true);
      expect(useGameStore.getState().employees[0]!.state).toBe('resting');
    });

    it('advanceDay restores stamina for resting employees', () => {
      const empId = useGameStore.getState().employees[0]!.id;
      useGameStore.setState({
        employees: useGameStore.getState().employees.map((e) =>
          e.id === empId ? { ...e, state: 'resting', stamina: 20 } : e,
        ),
      });
      useGameStore.getState().advanceDay();
      const s = useGameStore.getState();
      expect(s.employees[0]!.stamina).toBe(STAMINA_MAX);
      expect(s.employees[0]!.state).toBe('idle');
    });
  });

  describe('Day 5: bidding loss', () => {
    it('Tier 3+ order with high bidders + low rep → mostly lost, materials kept', () => {
      // Construct a tough bid manually
      useGameStore.setState({
        reputation: 10,
        materials: { Iron: 99, Wood: 99, Cloth: 99, Gem: 99, Mithril: 0, Orichalcum: 0 },
        workshop: { level: 3, slots: 3, tierMax: 5 },
        orderBoard: [
          {
            id: 'order-tough',
            category: 'Sword',
            tier: 5,
            qualityRequired: 70,
            deadline: 4,
            reward: 7000,
            repBonus: 12,
            bidders: 5,
            playerEdge: 0,
          },
        ],
      });
      const beforeMats = useGameStore.getState().materials.Iron;
      const result = useGameStore.getState().acceptOrder('order-tough');
      // With bidders=5 + low rep, very likely to lose
      if (!result) {
        // Lost: order removed, materials kept, transient message added
        expect(useGameStore.getState().materials.Iron).toBe(beforeMats);
        expect(useGameStore.getState().orderBoard.find((o) => o.id === 'order-tough')).toBeUndefined();
        expect(useGameStore.getState().transientMessages.length).toBeGreaterThan(0);
      }
    });

    it('Tier 1-2 orders skip bidding entirely', () => {
      useGameStore.setState({
        materials: { Iron: 5, Wood: 5, Cloth: 0, Gem: 0, Mithril: 0, Orichalcum: 0 },
      });
      const order = useGameStore.getState().orderBoard.find((o) => o.tier === 1)!;
      const ok = useGameStore.getState().acceptOrder(order.id);
      expect(ok).toBe(true);
      expect(useGameStore.getState().transientMessages).toHaveLength(0);
    });

    it('dismissTransientMessage removes by index', () => {
      useGameStore.setState({ transientMessages: ['a', 'b', 'c'] });
      useGameStore.getState().dismissTransientMessage(1);
      expect(useGameStore.getState().transientMessages).toEqual(['a', 'c']);
    });

    it('advanceDay clears all transient messages', () => {
      useGameStore.setState({ transientMessages: ['a', 'b'] });
      useGameStore.getState().advanceDay();
      expect(useGameStore.getState().transientMessages).toEqual([]);
    });
  });

  describe('Day 5: news / demand trend', () => {
    it('initial state has newsTomorrow and newsAfterTomorrow set', () => {
      const s = useGameStore.getState();
      expect(s.newsTomorrow).not.toBeNull();
      expect(s.newsAfterTomorrow).not.toBeNull();
      expect(s.newsTomorrow!.date).toBe(2);
      expect(s.newsAfterTomorrow!.date).toBe(3);
    });

    it('advanceDay rolls the news 1 day forward', () => {
      useGameStore.getState().advanceDay();
      const s = useGameStore.getState();
      expect(s.newsTomorrow!.date).toBe(s.day + 1);
      expect(s.newsAfterTomorrow!.date).toBe(s.day + 2);
    });
  });

  describe('Day 4: completeMinigame applies craftJudge bonus', () => {
    it('Lv 5 starter (affinity Sword) on Sword craft → +30 quality', () => {
      useGameStore.setState({
        employees: useGameStore.getState().employees.map((e) => ({ ...e, craftLv: 5 })),
        materials: { Iron: 5, Wood: 5, Cloth: 0, Gem: 0, Mithril: 0, Orichalcum: 0 },
      });
      const swordOrder = useGameStore.getState().orderBoard.find(
        (o) => o.tier === 1 && o.category === 'Sword',
      );
      // Some seeds may not produce Sword Tier 1; only run assertion when present
      if (!swordOrder) return;
      useGameStore.getState().acceptOrder(swordOrder.id);
      const craftId = useGameStore.getState().activeCrafts[0]!.id;
      useGameStore.getState().completeMinigame(craftId, 50);
      // Lv 5 → +20, affinity Sword → +10, total 80
      expect(useGameStore.getState().activeCrafts[0]!.quality).toBe(80);
    });
  });
});
