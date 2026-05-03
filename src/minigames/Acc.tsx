/**
 * Acc (Accessory) クラフトミニゲーム
 *
 * SPEC-002 (craft-minigame-contract) 準拠。
 * 3×3 グリッドに素材ピースを配置する「思考型」ミニゲーム。
 * 時間制限なし。上下左右に隣接する同一素材ペアの数で品質を決定する。
 *
 * 純粋関数 `countAdjacentMatches` / `calculateAccQuality` を export し、
 * Vitest からロジックを直接検証可能にしてある。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import seedrandom from 'seedrandom';
import type { Employee, MaterialType, MiniGameResult } from '../game/types';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export type CellMaterial = MaterialType;
/** 3×3, row-major。null は未配置セル */
export type Grid = (CellMaterial | null)[][];

interface AccProps {
  tier: number;
  employee: Employee;
  category: 'Acc';
  onComplete: (result: MiniGameResult) => void;
  onCancel?: () => void;
  /** テスト・再現用の任意 seed。未指定時は Date.now() ベース */
  seed?: string;
}

// ---------------------------------------------------------------------------
// 純粋ロジック (テスト対象)
// ---------------------------------------------------------------------------

const GRID_SIZE = 3;
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;

/**
 * Tier に応じた素材バリエーション。
 * Tier が上がるほど種類が増え、同一素材を隣接させにくくなる。
 *
 * - Tier 1   : 2 種 (Iron, Wood)
 * - Tier 2-3 : 3 種 (+ Cloth)
 * - Tier 4-5 : 4 種 (+ Gem)
 */
export function getMaterialPalette(tier: number): MaterialType[] {
  const t = Math.min(5, Math.max(1, tier));
  if (t <= 1) return ['Iron', 'Wood'];
  if (t <= 3) return ['Iron', 'Wood', 'Cloth'];
  return ['Iron', 'Wood', 'Cloth', 'Gem'];
}

/**
 * 上下左右に隣接する同一素材セルのペア数を数える。
 * - 対角は数えない
 * - 各ペアは 1 度だけカウント (右隣 / 下隣のみ走査)
 * - null セルは無視
 *
 * 3×3 で取りうる最大ペア数は 12 (横6 + 縦6)。
 */
export function countAdjacentMatches(grid: Grid): number {
  let count = 0;
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const cell = grid[row]?.[col];
      if (cell == null) continue;

      // 右隣
      if (col + 1 < GRID_SIZE) {
        const right = grid[row]?.[col + 1];
        if (right != null && right === cell) count++;
      }
      // 下隣
      if (row + 1 < GRID_SIZE) {
        const down = grid[row + 1]?.[col];
        if (down != null && down === cell) count++;
      }
    }
  }
  return count;
}

/**
 * 隣接ペア数 → quality (0-100 整数)
 *
 * - 0 ペア          → 30 (適当な配置)
 * - 1-3 ペア        → 50-65 (線形)
 * - 4-6 ペア        → 70-85 (線形)
 * - 7-12 ペア       → 90-100 (線形, 最大 12 で 100)
 */
export function calculateAccQuality(adjacentMatches: number): number {
  const m = Math.max(0, Math.floor(adjacentMatches));
  let q: number;
  if (m === 0) {
    q = 30;
  } else if (m <= 3) {
    // 1->50, 3->65 (1ペアあたり +7.5)
    q = 50 + (m - 1) * 7.5;
  } else if (m <= 6) {
    // 4->70, 6->85 (1ペアあたり +7.5)
    q = 70 + (m - 4) * 7.5;
  } else {
    // 7->90, 12->100 (1ペアあたり +2)
    q = Math.min(100, 90 + (m - 7) * 2);
  }
  return Math.round(q);
}

/**
 * Tier に応じて 9 個の素材ピース (手札) を生成する。
 * seedrandom で再現可能。
 */
export function generateHand(tier: number, seed: string): MaterialType[] {
  const rng = seedrandom(seed);
  const palette = getMaterialPalette(tier);
  const hand: MaterialType[] = [];
  for (let i = 0; i < TOTAL_CELLS; i++) {
    const idx = Math.floor(rng() * palette.length);
    // palette は length>=2 なので idx は必ず有効
    hand.push(palette[idx] as MaterialType);
  }
  return hand;
}

function emptyGrid(): Grid {
  return [
    [null, null, null],
    [null, null, null],
    [null, null, null],
  ];
}

// ---------------------------------------------------------------------------
// React コンポーネント
// ---------------------------------------------------------------------------

/**
 * インタラクションモデル: click-to-select-then-click-cell
 *  - 手札のピースをクリックして「選択」
 *  - グリッドの空きセルをクリックすると配置
 *  - 9 セル埋まった瞬間に自動で onComplete 発火
 */
export function Acc({ tier, employee, category, onComplete, onCancel, seed }: AccProps) {
  const safeTier = Math.min(5, Math.max(1, Math.floor(tier)));

  // tier クランプ警告 (SPEC-002 §5)
  useEffect(() => {
    if (tier !== safeTier) {
      console.warn(`[Acc] tier ${tier} out of range, clamped to ${safeTier}`);
    }
  }, [tier, safeTier]);

  // 開始時刻 (durationMs 計測用)
  const startedAtRef = useRef<number>(performance.now());

  // 手札 (使用済みは null) / グリッド / 選択中インデックス
  const initialHand = useMemo(
    () => generateHand(safeTier, seed ?? `acc-${Date.now()}-${employee.id}`),
    [safeTier, seed, employee.id],
  );
  const [hand, setHand] = useState<(MaterialType | null)[]>(() => [...initialHand]);
  const [grid, setGrid] = useState<Grid>(() => emptyGrid());
  const [selectedHandIndex, setSelectedHandIndex] = useState<number | null>(null);

  // employee undefined ガード (SPEC-002 §5)
  if (!employee) {
    return (
      <div className="minigame-error" role="alert">
        <p>従業員が指定されていません。</p>
      </div>
    );
  }

  if (category !== 'Acc') {
    // 他カテゴリと取り違えていないかの自己診断
    console.warn(`[Acc] category mismatch: received ${category}`);
  }

  const placedCount = grid.flat().filter((c) => c !== null).length;

  function handleHandClick(index: number) {
    if (hand[index] == null) return;
    setSelectedHandIndex(index === selectedHandIndex ? null : index);
  }

  function handleCellClick(row: number, col: number) {
    if (selectedHandIndex == null) return;
    if (grid[row]?.[col] != null) return; // 配置済み
    const piece = hand[selectedHandIndex];
    if (piece == null) return;

    const nextGrid: Grid = grid.map((r) => [...r]);
    const targetRow = nextGrid[row];
    if (!targetRow) return;
    targetRow[col] = piece;

    const nextHand = [...hand];
    nextHand[selectedHandIndex] = null;

    setGrid(nextGrid);
    setHand(nextHand);
    setSelectedHandIndex(null);

    // 9 セル埋まったら自動完了
    const filled = nextGrid.flat().filter((c) => c !== null).length;
    if (filled === TOTAL_CELLS) {
      finish(nextGrid);
    }
  }

  function finish(finalGrid: Grid) {
    const matches = countAdjacentMatches(finalGrid);
    const quality = calculateAccQuality(matches);
    const durationMs = Math.round(performance.now() - startedAtRef.current);
    onComplete({ quality, success: true, durationMs });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape' && onCancel) {
      onCancel();
    }
  }

  return (
    <div
      className="minigame minigame-acc"
      role="application"
      aria-label="アクセサリー配置パズル"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <header className="minigame-header">
        <h2>アクセサリー組み立て (Tier {safeTier})</h2>
        <p className="minigame-hint">
          同じ素材を上下左右に隣接させるほど品質UP。{TOTAL_CELLS - placedCount} ピース残り。
        </p>
      </header>

      <div className="acc-grid" role="grid" aria-label="3x3 配置グリッド">
        {grid.map((rowArr, row) => (
          <div key={row} className="acc-grid-row" role="row">
            {rowArr.map((cell, col) => {
              const isEmpty = cell == null;
              const canPlace = isEmpty && selectedHandIndex != null;
              return (
                <button
                  key={col}
                  type="button"
                  role="gridcell"
                  className={
                    'acc-cell' +
                    (isEmpty ? ' acc-cell-empty' : ` acc-cell-${cell}`) +
                    (canPlace ? ' acc-cell-droppable' : '')
                  }
                  aria-label={
                    isEmpty
                      ? `空きセル row ${row + 1} col ${col + 1}`
                      : `${cell} row ${row + 1} col ${col + 1}`
                  }
                  disabled={!isEmpty}
                  onClick={() => handleCellClick(row, col)}
                >
                  {cell ?? ''}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="acc-hand" role="toolbar" aria-label="残りピース">
        {hand.map((piece, i) => {
          if (piece == null) return null;
          const selected = i === selectedHandIndex;
          return (
            <button
              key={i}
              type="button"
              className={`acc-piece acc-piece-${piece}${selected ? ' acc-piece-selected' : ''}`}
              aria-pressed={selected}
              aria-label={`${piece} ピース`}
              onClick={() => handleHandClick(i)}
            >
              {piece}
            </button>
          );
        })}
      </div>

      {onCancel && (
        <footer className="minigame-footer">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            キャンセル (ESC)
          </button>
        </footer>
      )}
    </div>
  );
}
