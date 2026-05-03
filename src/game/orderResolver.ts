import type { ActiveCraft, Order } from './types';
import { FAILED_DELIVERY_REP_PENALTY } from '../data/balance';

export interface DeliveryOutcome {
  success: boolean;
  gumDelta: number;
  repDelta: number;
  message: string;
}

/**
 * Resolve a completed craft's delivery against its order.
 * Pure function: takes craft + order, returns outcome.
 *
 * Success criteria (Phase 1): quality >= order.qualityRequired
 * Failure: low quality (no late penalty in Phase 1 since we resolve at completion, not after deadline)
 */
export function resolveDelivery(craft: ActiveCraft, order: Order): DeliveryOutcome {
  if (craft.quality >= order.qualityRequired) {
    return {
      success: true,
      gumDelta: order.reward,
      repDelta: order.repBonus,
      message: `${order.category} Tier ${order.tier} 納品成功！ +${order.reward} GUM`,
    };
  }
  return {
    success: false,
    gumDelta: 0,
    repDelta: -FAILED_DELIVERY_REP_PENALTY,
    message: `${order.category} Tier ${order.tier} 品質不足で受領拒否... (要 ${order.qualityRequired}, 実際 ${craft.quality})`,
  };
}
