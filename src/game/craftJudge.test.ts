import { describe, it, expect } from 'vitest';
import { applyEmployeeBonus } from './craftJudge';
import type { Employee } from './types';

const mkEmp = (overrides: Partial<Employee> = {}): Employee => ({
  id: 'e1',
  name: 'Test',
  rarity: 'Common',
  craftLv: 1,
  affinity: 'Sword',
  battleStats: { atk: 10, hp: 20, spd: 5 },
  stamina: 100,
  wage: 200,
  state: 'idle',
  ...overrides,
});

describe('applyEmployeeBonus', () => {
  it('Lv 1 with no affinity match → no bonus', () => {
    expect(applyEmployeeBonus(50, mkEmp({ craftLv: 1, affinity: 'Helm' }), 'Sword')).toBe(50);
  });

  it('+10 quality on affinity match', () => {
    expect(applyEmployeeBonus(50, mkEmp({ craftLv: 1, affinity: 'Sword' }), 'Sword')).toBe(60);
  });

  it('+5 per craftLv beyond 1', () => {
    expect(applyEmployeeBonus(50, mkEmp({ craftLv: 5, affinity: 'Helm' }), 'Sword')).toBe(50 + 4 * 5);
  });

  it('Lv 5 + affinity → +30', () => {
    expect(applyEmployeeBonus(50, mkEmp({ craftLv: 5, affinity: 'Sword' }), 'Sword')).toBe(50 + 4 * 5 + 10);
  });

  it('clamps to 100 max', () => {
    expect(applyEmployeeBonus(95, mkEmp({ craftLv: 10, affinity: 'Sword' }), 'Sword')).toBe(100);
  });

  it('clamps to 0 min', () => {
    expect(applyEmployeeBonus(0, mkEmp({ craftLv: 1, affinity: 'Helm' }), 'Sword')).toBe(0);
  });

  it('returns integer', () => {
    expect(Number.isInteger(applyEmployeeBonus(73.4, mkEmp({ craftLv: 3 }), 'Sword'))).toBe(true);
  });
});
