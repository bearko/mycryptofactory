import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { Category, Employee, MiniGameResult } from '../game/types';

/**
 * Helm ミニゲーム — 4拍リズム連打型
 *
 * 仕様: SPEC-002 / SCRUM-14
 * - マーカーが一定テンポでトラック上を進行する
 * - プレイヤーは Space キー or クリックで4拍に合わせてタップ
 * - 各タップは Perfect / Good / Miss で判定
 *   - Perfect: ±60ms
 *   - Good:    ±150ms
 *   - Miss:    それ以外、または無タップ
 * - Tier が高いほどテンポが速い (Tier1 ≈ 800ms / Tier5 ≈ 400ms)
 */

export type BeatJudgment = 'Perfect' | 'Good' | 'Miss';

const BEAT_COUNT = 4;
const PERFECT_WINDOW_MS = 60;
const GOOD_WINDOW_MS = 150;

/**
 * Tier (1-5) -> ビート間隔(ms)。Tier1=800ms, Tier5=400ms を線形補間。
 */
export function tierToIntervalMs(tier: number): number {
  const clamped = Math.min(5, Math.max(1, Math.floor(tier)));
  // Tier1 -> 800, Tier5 -> 400 (steps of -100)
  return 800 - (clamped - 1) * 100;
}

/**
 * 判定の重み付け平均で生 quality を出し、ルールに従って範囲に丸める純粋関数。
 *
 * - 4 Perfect → 95-100
 * - 3+ Perfect, 残り Good → 80-94
 * - All Good or better (Perfect/Good 混在で 3 Perfect 未満) → 60-79
 * - Miss を含む → 比例して減点 (4 Miss → 0)
 */
export function calculateHelmQuality(judgments: BeatJudgment[]): number {
  if (judgments.length !== BEAT_COUNT) {
    throw new Error(`calculateHelmQuality: expected ${BEAT_COUNT} judgments, got ${judgments.length}`);
  }

  const perfect = judgments.filter((j) => j === 'Perfect').length;
  const good = judgments.filter((j) => j === 'Good').length;
  const miss = judgments.filter((j) => j === 'Miss').length;

  // 全Miss
  if (miss === BEAT_COUNT) return 0;

  // Miss を含む場合: 比例減点。Perfect=25, Good=15, Miss=0 で算出 (max=100)
  if (miss > 0) {
    const raw = perfect * 25 + good * 15;
    return Math.max(0, Math.min(100, Math.round(raw)));
  }

  // Miss なし
  if (perfect === BEAT_COUNT) {
    // 4 Perfect: 95-100。基準値 98、Good 0 なので 98 を返す（範囲内）
    return 98;
  }

  if (perfect >= 3) {
    // 3 Perfect + 1 Good: 80-94 範囲。Good 1 個 = 87
    // 3 Perfect + 1 Good (good=1, perfect=3) -> 87
    return 80 + perfect * 2 + good * 1; // 3*2 + 1 = 7 -> 87
  }

  // All Good or better, 3 Perfect 未満: 60-79
  // perfect=2,good=2 -> 76 / perfect=1,good=3 -> 70 / perfect=0,good=4 -> 64
  return 60 + perfect * 6 + good * 1;
}

interface HelmProps {
  tier: number;
  employee: Employee;
  category: 'Helm';
  onComplete: (result: MiniGameResult) => void;
  onCancel?: () => void;
}

interface BeatRecord {
  index: number;
  judgment: BeatJudgment;
  deltaMs: number;
}

/**
 * 経過時間と次のビート目標時刻から判定を導く。エクスポートはしないがテストの観点で純粋。
 */
function judgeTap(deltaMs: number): BeatJudgment {
  const abs = Math.abs(deltaMs);
  if (abs <= PERFECT_WINDOW_MS) return 'Perfect';
  if (abs <= GOOD_WINDOW_MS) return 'Good';
  return 'Miss';
}

/**
 * Helm — React コンポーネント
 *
 * - tier から interval を決定し、4拍ぶんのターゲット時刻を計算
 * - スペースキーまたはトラックのクリックでタップ判定
 * - 4拍終了後に calculateHelmQuality で集計し onComplete を呼ぶ
 */
export function Helm({ tier, employee, category, onComplete, onCancel }: HelmProps) {
  // category は agent の取り違え防止用に props で受け取る (将来チェックに使う)
  void category;
  void employee;

  const intervalMs = useMemo(() => tierToIntervalMs(tier), [tier]);

  // tier が範囲外の場合は警告
  useEffect(() => {
    if (tier < 1 || tier > 5) {
      console.warn(`Helm: tier ${tier} is out of range (1-5), clamped to ${Math.min(5, Math.max(1, tier))}`);
    }
  }, [tier]);

  const [phase, setPhase] = useState<'ready' | 'playing' | 'done'>('ready');
  const [beatIndex, setBeatIndex] = useState(0);
  const startedAtRef = useRef<number>(0);
  const judgmentsRef = useRef<BeatRecord[]>([]);
  const tappedRef = useRef<Set<number>>(new Set());
  const [feedback, setFeedback] = useState<BeatJudgment | null>(null);

  const finish = useCallback(() => {
    const judgments = judgmentsRef.current;
    // 未タップの拍は Miss として埋める
    const filled: BeatJudgment[] = [];
    for (let i = 0; i < BEAT_COUNT; i++) {
      const found = judgments.find((j) => j.index === i);
      filled.push(found ? found.judgment : 'Miss');
    }
    const quality = calculateHelmQuality(filled);
    const durationMs = performance.now() - startedAtRef.current;
    setPhase('done');
    onComplete({
      quality,
      success: quality > 0,
      durationMs,
    });
  }, [onComplete]);

  // 開始
  const start = useCallback(() => {
    judgmentsRef.current = [];
    tappedRef.current = new Set();
    setBeatIndex(0);
    setFeedback(null);
    startedAtRef.current = performance.now();
    setPhase('playing');
  }, []);

  // タップ処理
  const handleTap = useCallback(() => {
    if (phase !== 'playing') return;
    const now = performance.now();
    const elapsed = now - startedAtRef.current;
    // 一番近いビートインデックス
    const nearestIdx = Math.round(elapsed / intervalMs);
    if (nearestIdx < 0 || nearestIdx >= BEAT_COUNT) return;
    if (tappedRef.current.has(nearestIdx)) return; // 同一拍に2回打たない
    const targetTime = nearestIdx * intervalMs;
    const delta = elapsed - targetTime;
    const judgment = judgeTap(delta);
    tappedRef.current.add(nearestIdx);
    judgmentsRef.current.push({ index: nearestIdx, judgment, deltaMs: delta });
    setFeedback(judgment);
  }, [phase, intervalMs]);

  // 進行: setInterval でビートインデックスを進める。最終拍 + Good 窓 経過したら終了
  useEffect(() => {
    if (phase !== 'playing') return;
    const totalMs = (BEAT_COUNT - 1) * intervalMs + GOOD_WINDOW_MS + 50;
    const tickId = window.setInterval(() => {
      const elapsed = performance.now() - startedAtRef.current;
      const idx = Math.min(BEAT_COUNT - 1, Math.floor(elapsed / intervalMs));
      setBeatIndex(idx);
    }, 30);
    const endId = window.setTimeout(finish, totalMs);
    return () => {
      window.clearInterval(tickId);
      window.clearTimeout(endId);
    };
  }, [phase, intervalMs, finish]);

  // キーボード: Space で tap, Esc で cancel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (phase === 'ready') {
          start();
        } else if (phase === 'playing') {
          handleTap();
        }
      } else if (e.code === 'Escape') {
        if (onCancel) onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, start, handleTap, onCancel]);

  // フィードバック表示は短時間で消す
  useEffect(() => {
    if (!feedback) return;
    const id = window.setTimeout(() => setFeedback(null), 300);
    return () => window.clearTimeout(id);
  }, [feedback]);

  const trackTargets = useMemo(() => {
    return Array.from({ length: BEAT_COUNT }, (_, i) => ({
      index: i,
      leftPct: ((i + 1) / (BEAT_COUNT + 1)) * 100,
    }));
  }, []);

  return (
    <div
      role="application"
      aria-label="Helm rhythm minigame"
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 480,
        margin: '0 auto',
        padding: 24,
        textAlign: 'center',
        userSelect: 'none',
      }}
    >
      <h3 style={{ marginBottom: 8 }}>Helm — 4拍リズム</h3>
      <p style={{ marginBottom: 16, fontSize: 14, opacity: 0.8 }}>
        Tier {tier} / 拍間隔 {intervalMs}ms — Space または下のトラックをクリック
      </p>

      <div
        onClick={phase === 'playing' ? handleTap : phase === 'ready' ? start : undefined}
        style={{
          position: 'relative',
          height: 80,
          borderRadius: 8,
          background: '#1a1a2e',
          border: '2px solid #444',
          cursor: phase === 'done' ? 'default' : 'pointer',
          overflow: 'hidden',
        }}
      >
        {/* ターゲット位置 (4拍) */}
        {trackTargets.map((t) => (
          <div
            key={t.index}
            aria-label={`beat-target-${t.index}`}
            style={{
              position: 'absolute',
              top: '50%',
              left: `${t.leftPct}%`,
              transform: 'translate(-50%, -50%)',
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: '2px solid #888',
              background: t.index <= beatIndex && phase === 'playing' ? '#3a3a5e' : 'transparent',
            }}
          />
        ))}

        {/* マーカー (アニメーション) */}
        {phase === 'playing' && (
          <motion.div
            aria-label="marker"
            initial={{ left: '0%' }}
            animate={{ left: '100%' }}
            transition={{ duration: ((BEAT_COUNT - 1) * intervalMs) / 1000 + 0.1, ease: 'linear' }}
            style={{
              position: 'absolute',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: 16,
              height: 56,
              background: '#ffd166',
              borderRadius: 4,
              boxShadow: '0 0 12px rgba(255,209,102,0.7)',
            }}
          />
        )}

        {/* フィードバック */}
        {feedback && (
          <div
            aria-live="polite"
            style={{
              position: 'absolute',
              top: 4,
              right: 8,
              fontSize: 13,
              fontWeight: 700,
              color:
                feedback === 'Perfect' ? '#06d6a0' : feedback === 'Good' ? '#ffd166' : '#ef476f',
            }}
          >
            {feedback}
          </div>
        )}

        {phase === 'ready' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              color: '#eee',
            }}
          >
            Space / クリックでスタート
          </div>
        )}
      </div>

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          style={{ marginTop: 12, fontSize: 13, opacity: 0.7 }}
        >
          中断 (Esc)
        </button>
      )}
    </div>
  );
}

// 型エクスポート（互換のためのリエクスポート）
export type { Category };
