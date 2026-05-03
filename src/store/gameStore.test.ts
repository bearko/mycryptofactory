import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './gameStore';
import { ORDER_BOARD_SIZE, BANKRUPT_DAYS } from '../data/balance';
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
});
