import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Category, Employee, MiniGameResult } from '../game/types';

// =============================================================================
// Pure logic (testable without React)
// =============================================================================

/** Tier 1 fills 100% in 1500ms, Tier 5 fills in 700ms. Linearly interpolated. */
export function fillRateForTier(tier: number): number {
  const clamped = Math.min(5, Math.max(1, Math.round(tier)));
  // ms to fill 100% → percent per ms
  const fillMs = 1500 - (clamped - 1) * 200; // 1500, 1300, 1100, 900, 700
  return 100 / fillMs;
}

/** The critical zone stays the same width across tiers; only fill speed changes. */
export const CRITICAL_ZONE = { min: 85, max: 95 } as const;
export const GREAT_LOW_ZONE = { min: 70, max: 85 } as const;
export const GREAT_HIGH_ZONE = { min: 95, max: 100 } as const;
export const STANDARD_HIGH_ZONE = { min: 40, max: 70 } as const;
export const STANDARD_LOW_ZONE = { min: 20, max: 40 } as const;
export const FAIL_THRESHOLD = 20;
export const OVERHEAT_THRESHOLD = 100;

/**
 * Pure quality calculation for the Armor mini-game.
 *
 * @param releasePercent - Position the player released the gauge at (0-100+).
 * @param overheated - Whether the gauge passed the 100% threshold (explosion).
 * @returns Integer quality in [0, 100]. 0 indicates failure.
 */
export function calculateArmorQuality(releasePercent: number, overheated: boolean): number {
  if (overheated || releasePercent > OVERHEAT_THRESHOLD) {
    return 0;
  }
  if (releasePercent < FAIL_THRESHOLD) {
    return 0;
  }

  // Critical zone: 85-95% → quality 90-100 (peak at 90% release).
  if (releasePercent >= CRITICAL_ZONE.min && releasePercent <= CRITICAL_ZONE.max) {
    // distance from the sweet spot at 90 (linear, max 5 away)
    const distanceFromCenter = Math.abs(releasePercent - 90);
    const quality = 100 - distanceFromCenter * 2; // 90→100, 85/95→90
    return clamp(Math.round(quality), 90, 100);
  }

  // Great low: 70-85 → quality 70-89 (closer to 85 = better)
  if (releasePercent >= GREAT_LOW_ZONE.min && releasePercent < GREAT_LOW_ZONE.max) {
    const t = (releasePercent - GREAT_LOW_ZONE.min) / (GREAT_LOW_ZONE.max - GREAT_LOW_ZONE.min);
    const quality = 70 + t * 19; // 70→89
    return clamp(Math.round(quality), 70, 89);
  }

  // Great high: 95-100 → quality 70-89 (closer to 95 = better; risk of overheat)
  if (releasePercent > GREAT_HIGH_ZONE.min && releasePercent <= GREAT_HIGH_ZONE.max) {
    const t = (releasePercent - GREAT_HIGH_ZONE.min) / (GREAT_HIGH_ZONE.max - GREAT_HIGH_ZONE.min);
    // Closer to 95 → 89, closer to 100 → 70 (high overheat risk penalty)
    const quality = 89 - t * 19;
    return clamp(Math.round(quality), 70, 89);
  }

  // Standard high: 40-70 → quality 40-69
  if (releasePercent >= STANDARD_HIGH_ZONE.min && releasePercent < STANDARD_HIGH_ZONE.max) {
    const t = (releasePercent - STANDARD_HIGH_ZONE.min) / (STANDARD_HIGH_ZONE.max - STANDARD_HIGH_ZONE.min);
    const quality = 40 + t * 29; // 40→69
    return clamp(Math.round(quality), 40, 69);
  }

  // Standard low: 20-40 → quality 20-39
  if (releasePercent >= STANDARD_LOW_ZONE.min && releasePercent < STANDARD_LOW_ZONE.max) {
    const t = (releasePercent - STANDARD_LOW_ZONE.min) / (STANDARD_LOW_ZONE.max - STANDARD_LOW_ZONE.min);
    const quality = 20 + t * 19; // 20→39
    return clamp(Math.round(quality), 20, 39);
  }

  // Defensive fallback (should not be reached for valid input ranges).
  return 0;
}

/**
 * Pure success determination. Failure = below 20% release OR overheated past 100%.
 */
export function isArmorSuccess(releasePercent: number, overheated: boolean): boolean {
  if (overheated || releasePercent > OVERHEAT_THRESHOLD) return false;
  if (releasePercent < FAIL_THRESHOLD) return false;
  return true;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// =============================================================================
// React component
// =============================================================================

interface ArmorMiniGameProps {
  tier: number;
  employee: Employee;
  category: 'Armor';
  onComplete: (result: MiniGameResult) => void;
  onCancel?: () => void;
}

type Phase = 'idle' | 'filling' | 'released' | 'exploded';

export function Armor({ tier, employee, category, onComplete, onCancel }: ArmorMiniGameProps): JSX.Element {
  // Validate category at runtime to satisfy SPEC-002 §5 ("agentが間違えないため").
  if (category !== 'Armor') {
    // Surface a developer-facing error rather than silently miscategorising.
    console.warn(`[Armor] Received non-Armor category: ${category}`);
  }

  // Clamp tier to [1, 5] per SPEC-002 §5 error conditions.
  const safeTier = Math.min(5, Math.max(1, Math.round(tier)));
  if (safeTier !== tier) {
    console.warn(`[Armor] tier ${tier} out of range, clamped to ${safeTier}`);
  }

  const [phase, setPhase] = useState<Phase>('idle');
  const [percent, setPercent] = useState(0);
  const [finalRelease, setFinalRelease] = useState<number | null>(null);
  const [finalQuality, setFinalQuality] = useState<number | null>(null);

  const startTimeRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const hasCompletedRef = useRef(false);

  const fillRate = fillRateForTier(safeTier); // percent per ms

  // ---- Animation loop -----------------------------------------------------
  const tick = useCallback(
    (now: number) => {
      const elapsed = now - startTimeRef.current;
      const next = elapsed * fillRate;
      if (next > 100) {
        // Overheat — treat the moment we crossed 100 as the release point.
        setPercent(next);
        setFinalRelease(next);
        setPhase('exploded');
        return;
      }
      setPercent(next);
      rafRef.current = requestAnimationFrame(tick);
    },
    [fillRate],
  );

  const startHold = useCallback(() => {
    if (phase !== 'idle') return;
    hasCompletedRef.current = false;
    startTimeRef.current = performance.now();
    setPercent(0);
    setPhase('filling');
    rafRef.current = requestAnimationFrame(tick);
  }, [phase, tick]);

  const releaseHold = useCallback(() => {
    if (phase !== 'filling') return;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const elapsed = performance.now() - startTimeRef.current;
    const release = Math.min(100, elapsed * fillRate);
    setFinalRelease(release);
    setPhase('released');
  }, [phase, fillRate]);

  // ---- Cleanup raf on unmount --------------------------------------------
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  // ---- Keyboard input -----------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Space') {
        e.preventDefault();
        startHold();
      } else if (e.key === 'Escape' && onCancel) {
        e.preventDefault();
        onCancel();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        releaseHold();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [startHold, releaseHold, onCancel]);

  // ---- Resolve result after a short feedback animation -------------------
  useEffect(() => {
    if (phase !== 'released' && phase !== 'exploded') return;
    if (finalRelease === null) return;
    if (hasCompletedRef.current) return;

    const overheated = phase === 'exploded';
    const quality = calculateArmorQuality(finalRelease, overheated);
    const success = isArmorSuccess(finalRelease, overheated);
    setFinalQuality(quality);

    // Brief feedback window so the player sees the explosion / glow.
    const feedbackMs = overheated ? 1100 : 800;
    const timeout = window.setTimeout(() => {
      hasCompletedRef.current = true;
      const durationMs = Math.round(performance.now() - startTimeRef.current);
      onComplete({ quality, success, durationMs });
    }, feedbackMs);

    return () => window.clearTimeout(timeout);
  }, [phase, finalRelease, onComplete]);

  // ---- Visual helpers -----------------------------------------------------
  const overheated = phase === 'exploded';
  const displayPercent = Math.min(percent, 105);
  const zoneLabel = labelForRelease(finalRelease, overheated);

  return (
    <div className="armor-minigame" aria-label={`Armor crafting mini-game, tier ${safeTier}`}>
      <header className="armor-header">
        <h2>Armor Forge</h2>
        <div className="armor-meta">
          <span>Tier {safeTier}</span>
          <span>{employee.name}</span>
        </div>
      </header>

      <div className="armor-stage">
        <div
          className={`armor-gauge ${overheated ? 'is-overheated' : ''}`}
          role="progressbar"
          aria-valuenow={Math.round(percent)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          {/* Zone markers (color + text + dashed border for accessibility) */}
          <div className="armor-zone armor-zone-standard-low" style={zoneStyle(20, 40)}>
            <span className="armor-zone-label">Low</span>
          </div>
          <div className="armor-zone armor-zone-standard-high" style={zoneStyle(40, 70)}>
            <span className="armor-zone-label">Std</span>
          </div>
          <div className="armor-zone armor-zone-great-low" style={zoneStyle(70, 85)}>
            <span className="armor-zone-label">Great</span>
          </div>
          <div className="armor-zone armor-zone-critical" style={zoneStyle(85, 95)}>
            <span className="armor-zone-label">CRIT</span>
          </div>
          <div className="armor-zone armor-zone-great-high" style={zoneStyle(95, 100)}>
            <span className="armor-zone-label">!!</span>
          </div>

          {/* Fill bar */}
          <motion.div
            className="armor-fill"
            style={{ width: `${displayPercent}%` }}
            animate={{
              backgroundColor: overheated ? '#ff3b30' : displayPercent > 95 ? '#f39c12' : '#4caf50',
            }}
            transition={{ duration: 0.15 }}
          />

          {/* Release marker */}
          <AnimatePresence>
            {finalRelease !== null && !overheated && (
              <motion.div
                className="armor-marker"
                style={{ left: `${Math.min(100, finalRelease)}%` }}
                initial={{ opacity: 0, scaleY: 0.5 }}
                animate={{ opacity: 1, scaleY: 1 }}
                exit={{ opacity: 0 }}
              />
            )}
          </AnimatePresence>

          {/* Explosion overlay */}
          <AnimatePresence>
            {overheated && (
              <motion.div
                className="armor-explosion"
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: [0, 1, 0.7, 0], scale: [0.4, 1.6, 1.2, 0.9] }}
                transition={{ duration: 1, times: [0, 0.2, 0.6, 1] }}
                aria-hidden
              >
                BOOM
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="armor-percent" aria-live="polite">
          {Math.min(100, Math.round(percent))}%
          {overheated && <span className="armor-overheat-tag"> OVERHEAT</span>}
        </div>
      </div>

      <div className="armor-controls">
        {phase === 'idle' && (
          <button
            type="button"
            className="armor-button"
            onMouseDown={startHold}
            onMouseUp={releaseHold}
            onMouseLeave={releaseHold}
            onTouchStart={(e) => {
              e.preventDefault();
              startHold();
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              releaseHold();
            }}
          >
            Hold (Space) to Heat
          </button>
        )}
        {phase === 'filling' && (
          <button
            type="button"
            className="armor-button is-active"
            onMouseUp={releaseHold}
            onMouseLeave={releaseHold}
            onTouchEnd={(e) => {
              e.preventDefault();
              releaseHold();
            }}
          >
            Release at the green zone!
          </button>
        )}
        {(phase === 'released' || phase === 'exploded') && (
          <div className="armor-result" aria-live="polite">
            <strong>{zoneLabel}</strong>
            {finalQuality !== null && <span> · quality {finalQuality}</span>}
          </div>
        )}
      </div>

      {onCancel && phase === 'idle' && (
        <button type="button" className="armor-cancel" onClick={onCancel}>
          Cancel (Esc)
        </button>
      )}
    </div>
  );
}

function zoneStyle(from: number, to: number): React.CSSProperties {
  return {
    left: `${from}%`,
    width: `${to - from}%`,
  };
}

function labelForRelease(release: number | null, overheated: boolean): string {
  if (release === null) return '';
  if (overheated || release > OVERHEAT_THRESHOLD) return 'OVERHEAT — Failed';
  if (release < FAIL_THRESHOLD) return 'Too cold — Failed';
  if (release >= CRITICAL_ZONE.min && release <= CRITICAL_ZONE.max) return 'CRITICAL!';
  if (
    (release >= GREAT_LOW_ZONE.min && release < GREAT_LOW_ZONE.max) ||
    (release > GREAT_HIGH_ZONE.min && release <= GREAT_HIGH_ZONE.max)
  ) {
    return 'Great';
  }
  if (release >= STANDARD_HIGH_ZONE.min && release < STANDARD_HIGH_ZONE.max) return 'Standard';
  if (release >= STANDARD_LOW_ZONE.min && release < STANDARD_LOW_ZONE.max) return 'Standard (low)';
  return '';
}

// Re-export the category-narrowed prop type for callers if useful.
export type { ArmorMiniGameProps };
// Touch the import so unused-vars stays clean if Category becomes irrelevant later.
export type _ArmorCategoryAssertion = Category extends 'Armor' ? true : never;

export default Armor;
