import {
  BID_EDGE_BONUS,
  BID_LUCK_WEIGHT,
  BID_REPUTATION_WEIGHT,
  BID_THRESHOLD_BASE,
  BID_THRESHOLD_PER_EXTRA_BIDDER,
  BIDDING_MIN_TIER,
} from '../data/balance';

export interface BidContext {
  /** 0..100 */
  reputation: number;
  /** ★0-3 — player's reputation+fit for this specific order */
  playerEdge: 0 | 1 | 2 | 3;
  /** Total bidders including the player; 0/1 means uncontested. */
  bidders: number;
  /** Returns 0..1, called once per call. */
  rng: () => number;
}

export interface BidOutcome {
  won: boolean;
  /** The score the player rolled (for diagnostics / future UI tooltip). */
  playerScore: number;
  /** The threshold the player had to beat. */
  threshold: number;
}

/**
 * Decide whether the player wins a competitive bid.
 * Pure (given a deterministic rng).
 *
 * Spec v3 §2.3: contribution weights are reputation:luck = 7:3, plus a
 * playerEdge bonus and a per-extra-bidder threshold bump.
 */
export function judgeBidding(ctx: BidContext): BidOutcome {
  const repPart = (ctx.reputation / 100) * BID_REPUTATION_WEIGHT;
  const luckPart = ctx.rng() * BID_LUCK_WEIGHT;
  const edgeBonus = ctx.playerEdge * BID_EDGE_BONUS;
  const playerScore = repPart + luckPart + edgeBonus;

  const extraBidders = Math.max(0, ctx.bidders - 1);
  const threshold = BID_THRESHOLD_BASE + extraBidders * BID_THRESHOLD_PER_EXTRA_BIDDER;

  return {
    won: playerScore >= threshold,
    playerScore,
    threshold,
  };
}

/** Whether an order requires a bid (Tier 3+). */
export function isBiddable(tier: number): boolean {
  return tier >= BIDDING_MIN_TIER;
}
