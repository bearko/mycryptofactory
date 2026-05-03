import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useAnimationFrame } from 'framer-motion';

/**
 * Sword craft mini-game — timing-based pendulum stop.
 *
 * SPEC-002 contract:
 *   input  : { tier, employee, category, onComplete, onCancel? }
 *   output : MiniGameResult { quality, success, durationMs }
 *
 * The pendulum oscillates left↔right at a tier-dependent speed.
 * Player presses Space / clicks / taps to stop it.
 * Quality is derived from |position| at the moment of stop.
 *   - Critical (90–100): |pos| ≤ 0.05
 *   - Great    (70–89) : |pos| ≤ 0.15
 *   - Standard (30–69) : otherwise
 *   - Timeout (0, success: false) after 5s of inaction
 *
 * The quality formula is exposed as a pure function so it can be
 * unit-tested in isolation from React/Framer Motion.
 */

// ---------- Local type contract (mirrors SPEC-002) -----------------------

export interface Employee {
  id: string;
  name: string;
}

export interface MiniGameResult {
  quality: number; // 0-100 integer
  success: boolean;
  durationMs: number;
}

export interface SwordMiniGameProps {
  tier: number;
  employee: Employee;
  category: 'Sword';
  onComplete: (result: MiniGameResult) => void;
  onCancel?: () => void;
}

// ---------- Tunables -----------------------------------------------------

/** Window for Critical (perfect) stop, in pendulum units (-1..+1). */
export const CRITICAL_WINDOW = 0.05;
/** Window for Great stop, in pendulum units. */
export const GREAT_WINDOW = 0.15;
/** Auto-fail timeout in milliseconds. */
export const TIMEOUT_MS = 5_000;

/** Base oscillation speed in radians per second (Tier 1). */
const BASE_ANGULAR_SPEED = 2.4;
/** Speed multiplier per tier above 1. Tier 5 ≈ 2× base. */
const SPEED_PER_TIER = 0.25;

// ---------- Pure logic (unit-testable) -----------------------------------

/**
 * Map a pendulum stop position (-1..+1) to a 0–100 integer quality.
 *
 * Within a band, quality interpolates linearly so a closer stop
 * scores higher than a sloppier stop in the same band.
 */
export function calculateSwordQuality(position: number): number {
  // Clamp out-of-range and NaN to the legal interval.
  if (!Number.isFinite(position)) return 30;
  const abs = Math.min(1, Math.abs(position));

  if (abs <= CRITICAL_WINDOW) {
    // |pos| 0 → 100, |pos| CRITICAL_WINDOW → 90
    const t = abs / CRITICAL_WINDOW; // 0..1
    return Math.round(100 - t * 10);
  }

  if (abs <= GREAT_WINDOW) {
    // |pos| CRITICAL_WINDOW → 89, |pos| GREAT_WINDOW → 70
    const span = GREAT_WINDOW - CRITICAL_WINDOW;
    const t = (abs - CRITICAL_WINDOW) / span; // 0..1
    return Math.round(89 - t * 19);
  }

  // Standard: |pos| GREAT_WINDOW → 69, |pos| 1.0 → 30
  const span = 1 - GREAT_WINDOW;
  const t = (abs - GREAT_WINDOW) / span; // 0..1
  return Math.round(69 - t * 39);
}

/**
 * A craft attempt is a "success" iff the player actually stopped the
 * pendulum (i.e. did not time out). Timeouts are signalled by quality 0.
 */
export function isSwordSuccess(quality: number): boolean {
  return quality > 0;
}

/** Tier-scaled angular speed (radians/second). Tier clamped to 1..5. */
export function swordAngularSpeed(tier: number): number {
  const t = Math.max(1, Math.min(5, Math.floor(tier)));
  return BASE_ANGULAR_SPEED * (1 + (t - 1) * SPEED_PER_TIER);
}

// ---------- React component ---------------------------------------------

export function SwordMiniGame({
  tier,
  employee,
  category: _category,
  onComplete,
  onCancel,
}: SwordMiniGameProps) {
  const [position, setPosition] = useState(0); // -1..+1
  const [stopped, setStopped] = useState(false);
  const startedAtRef = useRef<number>(performance.now());
  const positionRef = useRef(0);
  const omega = swordAngularSpeed(tier);

  // Drive the pendulum with rAF so the same clock controls visuals + logic.
  useAnimationFrame((t) => {
    if (stopped) return;
    const elapsed = (t - startedAtRef.current) / 1000;
    // sin gives smooth oscillation in [-1, +1] crossing 0 at center.
    const next = Math.sin(elapsed * omega);
    positionRef.current = next;
    setPosition(next);
  });

  const finish = useCallback(
    (finalPos: number, didStop: boolean) => {
      if (stopped) return;
      setStopped(true);
      const durationMs = Math.round(performance.now() - startedAtRef.current);
      const quality = didStop ? calculateSwordQuality(finalPos) : 0;
      onComplete({
        quality,
        success: didStop && isSwordSuccess(quality),
        durationMs,
      });
    },
    [onComplete, stopped],
  );

  const stopNow = useCallback(() => {
    finish(positionRef.current, true);
  }, [finish]);

  // Keyboard: Space stops, Escape cancels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (stopped) return;
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        stopNow();
      } else if (e.key === 'Escape' && onCancel) {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stopNow, stopped, onCancel]);

  // Auto-fail after TIMEOUT_MS.
  useEffect(() => {
    const id = window.setTimeout(() => finish(positionRef.current, false), TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [finish]);

  // Convert pendulum position to a screen-space x offset (px).
  const swingPx = position * 140;

  return (
    <div
      className="sword-minigame"
      role="button"
      tabIndex={0}
      aria-label={`Sword craft for ${employee.name}, tier ${tier}. Press space or tap to stop the pendulum.`}
      onClick={stopNow}
      onTouchStart={stopNow}
      style={{
        position: 'relative',
        width: '320px',
        height: '180px',
        margin: '0 auto',
        userSelect: 'none',
        cursor: stopped ? 'default' : 'pointer',
      }}
    >
      {/* Target zone marker (center) */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: '50%',
          top: 24,
          width: 2,
          height: 132,
          background: 'rgba(255, 215, 0, 0.45)',
          transform: 'translateX(-1px)',
        }}
      />

      {/* Pendulum */}
      <motion.div
        aria-hidden
        animate={{ x: swingPx }}
        transition={{ type: false }}
        style={{
          position: 'absolute',
          left: '50%',
          top: 24,
          width: 8,
          height: 132,
          marginLeft: -4,
          background: stopped ? '#9c9c9c' : '#e0e0e0',
          borderRadius: 4,
          boxShadow: '0 0 8px rgba(255,255,255,0.4)',
        }}
      />

      <div style={{ position: 'absolute', bottom: 4, left: 0, right: 0, textAlign: 'center', fontSize: 12 }}>
        {stopped ? 'Crafting…' : 'Press SPACE / tap to strike'}
      </div>
    </div>
  );
}

export default SwordMiniGame;
