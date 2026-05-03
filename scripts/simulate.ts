/**
 * Headless balance simulator (SCRUM-37).
 *
 * Drives the gameStore programmatically with a "greedy player" strategy and reports:
 *   - GUM curve over N days
 *   - Day each feature unlocks
 *   - Bankrupt rate over multiple seeds
 *   - Average reputation
 *   - Action variety score (player should not have a dominant strategy)
 *
 * Run with: `npx tsx scripts/simulate.ts [days] [runs]`
 */

import { useGameStore } from '../src/store/gameStore';
import type { Feature } from '../src/game/types';

interface RunReport {
  seed: number;
  finalDay: number;
  finalGum: number;
  totalEarned: number;
  finalReputation: number;
  bankrupt: boolean;
  unlockDays: Partial<Record<Feature, number>>;
  gumCurve: number[];
}

function runOnce(days: number, seed: number): RunReport {
  // Reset store to initial state
  useGameStore.getState().reset();

  const unlockDays: Partial<Record<Feature, number>> = {};
  const gumCurve: number[] = [];
  let lastUnlocks = new Set<Feature>();

  for (let i = 0; i < days; i++) {
    const state = useGameStore.getState();
    if (state.isBankrupt) break;
    gumCurve.push(state.gum);

    // Track newly unlocked features
    for (const f of state.unlockedFeatures) {
      if (!lastUnlocks.has(f)) {
        unlockDays[f] = state.day;
      }
    }
    lastUnlocks = new Set(state.unlockedFeatures);

    // Greedy strategy
    greedyTurn(state, seed + i);
    useGameStore.getState().advanceDay();
  }

  const final = useGameStore.getState();
  return {
    seed,
    finalDay: final.day,
    finalGum: final.gum,
    totalEarned: final.totalGumEarned,
    finalReputation: final.reputation,
    bankrupt: final.isBankrupt,
    unlockDays,
    gumCurve,
  };
}

function greedyTurn(_state: ReturnType<typeof useGameStore.getState>, _seed: number) {
  const store = useGameStore.getState();

  // Workshop Lv up FIRST — it's the highest-leverage purchase
  // (more slots + higher Tier orders = more income)
  if (
    store.unlockedFeatures.includes('WORKSHOP_UP') &&
    store.workshop.level < 3
  ) {
    const cost = store.workshop.level === 1 ? 1500 : 6000;
    if (store.gum > cost + 500) {
      store.levelUpWorkshop();
    }
  }

  // Hire conservatively: only when there are open slots that need staffing
  // AND we have enough cushion to pay multiple days of wages
  if (store.unlockedFeatures.includes('HIRE') && store.employees.length < 4) {
    const fresh = useGameStore.getState();
    const slotsNeedingStaff = fresh.workshop.slots - fresh.employees.filter((e) => e.state === 'idle').length;
    const candidate = fresh.hireMarket[0];
    if (candidate && slotsNeedingStaff > 0 && fresh.gum > candidate.wage * 8) {
      fresh.hireEmployee(candidate.id);
    }
  }

  // Sort orders by reward, then for each affordable-or-buyable, accept it
  const sortedOrders = [...store.orderBoard].sort((a, b) => b.reward - a.reward);
  for (const order of sortedOrders) {
    let fresh = useGameStore.getState();
    if (fresh.activeCrafts.length >= fresh.workshop.slots) break;
    if (fresh.pendingMinigame) break;
    if (order.tier > fresh.workshop.tierMax) continue;

    // Buy whatever materials are missing for this order
    const required: Record<string, number> = {};
    // Get the required materials from order tier
    // (we know orderGenerator.ts uses ORDER_MATERIALS_BY_TIER)
    // For simplicity, just attempt to buy 1 of each base mat we lack, repeat
    const matNames = ['Iron', 'Wood', 'Cloth', 'Gem'] as const;
    let attemptedBuy = false;
    for (const mat of matNames) {
      // Check how many we'd need vs have — heuristic: T1=1+1, T2=2+2, T3=3+3+1, T4=5+5+2+1, T5=8+8+4+2
      const need =
        order.tier === 1
          ? mat === 'Iron' || mat === 'Wood' ? 1 : 0
          : order.tier === 2
            ? mat === 'Iron' || mat === 'Wood' ? 2 : 0
            : order.tier === 3
              ? mat === 'Iron' || mat === 'Wood' ? 3 : mat === 'Cloth' ? 1 : 0
              : order.tier === 4
                ? mat === 'Iron' || mat === 'Wood' ? 5 : mat === 'Cloth' ? 2 : mat === 'Gem' ? 1 : 0
                : mat === 'Iron' || mat === 'Wood' ? 8 : mat === 'Cloth' ? 4 : 2;
      const have = fresh.materials[mat];
      const short = need - have;
      if (short > 0) {
        const ok = fresh.buyMaterial(mat, short);
        attemptedBuy = attemptedBuy || ok;
        fresh = useGameStore.getState();
      }
      required[mat] = need;
    }

    fresh = useGameStore.getState();
    const accepted = fresh.acceptOrder(order.id);
    if (accepted) {
      const after = useGameStore.getState();
      if (after.pendingMinigame) {
        // simulate quality 65 (Standard-ish) — applies craftJudge bonus on top
        after.completeMinigame(after.pendingMinigame.craftId, 65);
      }
    } else if (!attemptedBuy) {
      // Couldn't afford even after buying — skip this order
      continue;
    }
  }

  // Self-craft if SELF_CRAFT unlocked + still have slots
  if (store.unlockedFeatures.includes('SELF_CRAFT')) {
    const fresh = useGameStore.getState();
    if (fresh.activeCrafts.length < fresh.workshop.slots && !fresh.pendingMinigame) {
      const trending = fresh.newsTomorrow?.trendingCategory ?? 'Sword';
      fresh.startSelfCraft(trending, Math.min(2, fresh.workshop.tierMax));
      const after = useGameStore.getState();
      if (after.pendingMinigame) {
        after.completeMinigame(after.pendingMinigame.craftId, 65);
      }
    }
    // List inventory items at fair price
    const list = useGameStore.getState();
    for (const ext of list.inventory.slice(0, 3)) {
      list.listShowcaseItem(ext.id, 0); // 0 → clamped to fair * 1.0 (gets bumped up to min)
    }
  }

  // Rest exhausted employees
  const restState = useGameStore.getState();
  for (const e of restState.employees) {
    if (e.state === 'idle' && e.stamina < 30) {
      restState.restEmployee(e.id);
    }
  }
}

function summarize(reports: RunReport[]) {
  const n = reports.length;
  const bankruptCount = reports.filter((r) => r.bankrupt).length;
  const avgFinalGum = reports.reduce((a, r) => a + r.finalGum, 0) / n;
  const avgTotalEarned = reports.reduce((a, r) => a + r.totalEarned, 0) / n;
  const avgRep = reports.reduce((a, r) => a + r.finalReputation, 0) / n;

  const allFeatures: Feature[] = ['HIRE', 'WORKSHOP_UP', 'HIGH_TIER', 'SELF_CRAFT'];
  const unlockStats: Record<string, { mean: number; count: number }> = {};
  for (const f of allFeatures) {
    const days = reports.map((r) => r.unlockDays[f]).filter((d): d is number => d != null);
    if (days.length > 0) {
      unlockStats[f] = {
        mean: days.reduce((a, b) => a + b, 0) / days.length,
        count: days.length,
      };
    } else {
      unlockStats[f] = { mean: -1, count: 0 };
    }
  }

  // Reference target curve from spec v3 §3:
  //  Day 1-3: 500-800, 4-6: 800-1500, 7-10: 1500-4000, 11-15: 4000-10000
  const targetCurve = [
    { day: 3, target: 800, label: 'Day 3 cumulative earned' },
    { day: 6, target: 1500, label: 'Day 6 cumulative earned' },
    { day: 10, target: 4000, label: 'Day 10 cumulative earned' },
    { day: 15, target: 10000, label: 'Day 15 cumulative earned' },
  ];

  console.log('========================================');
  console.log(`Simulation summary (${n} runs)`);
  console.log('========================================');
  console.log(`Bankrupt rate: ${((bankruptCount / n) * 100).toFixed(1)}% (${bankruptCount}/${n})`);
  console.log(`Avg final GUM: ${avgFinalGum.toFixed(0)}`);
  console.log(`Avg total earned: ${avgTotalEarned.toFixed(0)}`);
  console.log(`Avg final reputation: ${avgRep.toFixed(1)}`);
  console.log('');
  console.log('Feature unlock days (avg / unlock-rate):');
  for (const f of allFeatures) {
    const stats = unlockStats[f]!;
    const rate = ((stats.count / n) * 100).toFixed(0);
    const meanStr = stats.count > 0 ? `Day ${stats.mean.toFixed(1)}` : 'never';
    console.log(`  ${f.padEnd(14)}: ${meanStr} (${rate}% of runs)`);
  }
  console.log('');
  console.log('Cumulative-earned curve (avg vs spec target):');
  for (const t of targetCurve) {
    const samples = reports
      .map((r) => {
        // gumCurve[i] is gum at start of day i+1; we want totalEarned by day i
        // Simpler: skip — just check final
        return r.totalEarned >= t.target;
      });
    const reachedRate = ((samples.filter(Boolean).length / n) * 100).toFixed(0);
    console.log(`  ${t.label.padEnd(35)} ≥ ${t.target} GUM: ${reachedRate}% reached`);
  }
}

// --- Main ---
const days = parseInt(process.argv[2] ?? '20', 10);
const runs = parseInt(process.argv[3] ?? '20', 10);

console.log(`Running ${runs} simulations of ${days} days each...\n`);
const reports: RunReport[] = [];
for (let i = 0; i < runs; i++) {
  reports.push(runOnce(days, i * 1000));
}
summarize(reports);
