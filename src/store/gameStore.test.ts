import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './gameStore';

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
      expect(materials.Iron).toBe(0);
      expect(materials.Wood).toBe(0);
      expect(materials.Cloth).toBe(0);
      expect(materials.Gem).toBe(0);
      expect(materials.Mithril).toBe(0);
      expect(materials.Orichalcum).toBe(0);
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
      expect(employees[0]?.stamina).toBe(100);
      expect(employees[0]?.state).toBe('idle');
    });

    it('starts with empty boards (orders, crafts, showcase, hire, inventory)', () => {
      const state = useGameStore.getState();
      expect(state.orderBoard).toEqual([]);
      expect(state.activeCrafts).toEqual([]);
      expect(state.showcase).toEqual([]);
      expect(state.hireMarket).toEqual([]);
      expect(state.inventory).toEqual([]);
    });

    it('starts with base material prices from balance table', () => {
      const { marketPrices } = useGameStore.getState();
      expect(marketPrices.Iron).toBe(30);
      expect(marketPrices.Wood).toBe(25);
      expect(marketPrices.Cloth).toBe(35);
      expect(marketPrices.Gem).toBe(80);
      expect(marketPrices.Mithril).toBe(300);
      expect(marketPrices.Orichalcum).toBe(800);
    });

    it('starts with no tomorrow news', () => {
      expect(useGameStore.getState().newsTomorrow).toBeNull();
    });
  });

  describe('reset', () => {
    it('returns all fields to initial state', () => {
      useGameStore.setState({
        day: 50,
        gum: 9999,
        reputation: 100,
        totalGumEarned: 50000,
        materials: { Iron: 99, Wood: 99, Cloth: 99, Gem: 99, Mithril: 99, Orichalcum: 99 },
      });

      useGameStore.getState().reset();

      const state = useGameStore.getState();
      expect(state.day).toBe(1);
      expect(state.gum).toBe(500);
      expect(state.reputation).toBe(50);
      expect(state.totalGumEarned).toBe(0);
      expect(state.materials.Iron).toBe(0);
    });

    it('restores starter employee after reset', () => {
      useGameStore.setState({ employees: [] });
      useGameStore.getState().reset();
      expect(useGameStore.getState().employees).toHaveLength(1);
    });
  });
});
