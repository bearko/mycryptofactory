import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './gameStore';

describe('gameStore', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it('starts with day 1 and 500 GUM', () => {
    const state = useGameStore.getState();
    expect(state.day).toBe(1);
    expect(state.gum).toBe(500);
    expect(state.reputation).toBe(50);
  });

  it('reset returns to initial state', () => {
    useGameStore.setState({ day: 10, gum: 9999 });
    useGameStore.getState().reset();
    expect(useGameStore.getState().day).toBe(1);
    expect(useGameStore.getState().gum).toBe(500);
  });
});
