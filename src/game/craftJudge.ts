import type { Category, Employee } from './types';
import { EMPLOYEE_AFFINITY_QUALITY_BONUS, EMPLOYEE_QUALITY_BONUS_PER_LEVEL } from '../data/balance';

/**
 * Apply employee level + category affinity bonuses to a raw mini-game quality score.
 * Pure function for testability (SPEC-002 §5).
 *
 *   - +5 quality per craftLv beyond 1 (so Lv1 = +0, Lv5 = +20, Lv10 = +45)
 *   - +10 quality if employee.affinity matches the craft category
 *   - clamped to [0, 100]
 */
export function applyEmployeeBonus(
  rawQuality: number,
  employee: Employee,
  category: Category,
): number {
  let q = rawQuality;
  q += (employee.craftLv - 1) * EMPLOYEE_QUALITY_BONUS_PER_LEVEL;
  if (employee.affinity === category) q += EMPLOYEE_AFFINITY_QUALITY_BONUS;
  return Math.round(Math.min(100, Math.max(0, q)));
}
