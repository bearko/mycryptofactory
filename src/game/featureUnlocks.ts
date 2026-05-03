import type { Feature, Workshop } from './types';
import {
  HIGH_TIER_MIN_EMPLOYEES,
  HIGH_TIER_MIN_WORKSHOP_LEVEL,
  HIRE_UNLOCK_TOTAL_GUM,
  SELF_CRAFT_UNLOCK_TOTAL_GUM,
  WORKSHOP_UP_UNLOCK_TOTAL_GUM,
} from '../data/balance';

export interface UnlockContext {
  totalGumEarned: number;
  workshop: Workshop;
  employeeCount: number;
}

/**
 * Compute the set of features that should be unlocked given the current player state.
 * Pure: same input → same output. No side effects.
 *
 * Features are monotonic: once unlocked, they stay unlocked even if the underlying
 * threshold drops back (e.g., the player overspends after unlocking HIRE).
 */
export function computeUnlocks(currentlyUnlocked: Feature[], ctx: UnlockContext): Feature[] {
  const set = new Set<Feature>(currentlyUnlocked);

  if (ctx.totalGumEarned >= HIRE_UNLOCK_TOTAL_GUM) set.add('HIRE');
  if (ctx.totalGumEarned >= WORKSHOP_UP_UNLOCK_TOTAL_GUM) set.add('WORKSHOP_UP');
  if (
    ctx.workshop.level >= HIGH_TIER_MIN_WORKSHOP_LEVEL &&
    ctx.employeeCount >= HIGH_TIER_MIN_EMPLOYEES
  ) {
    set.add('HIGH_TIER');
  }
  if (ctx.totalGumEarned >= SELF_CRAFT_UNLOCK_TOTAL_GUM) set.add('SELF_CRAFT');

  return Array.from(set);
}

/**
 * Diff two unlock sets to find newly added features (for UI notifications).
 */
export function newlyUnlocked(before: Feature[], after: Feature[]): Feature[] {
  const beforeSet = new Set(before);
  return after.filter((f) => !beforeSet.has(f));
}

const FEATURE_LABELS: Record<Feature, string> = {
  HIRE: '🆕 雇用',
  WORKSHOP_UP: '🆕 工房レベルアップ',
  HIGH_TIER: '🆕 高Tier受注',
  SELF_CRAFT: '🆕 採集マップ・自作モード',
};

export function featureLabel(f: Feature): string {
  return FEATURE_LABELS[f];
}
