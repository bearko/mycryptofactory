import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { canAffordMaterials, materialsForOrder } from '../game/orderGenerator';
import { TIER_TABLE } from '../data/balance';
import type { Category, MaterialType } from '../game/types';

const CATEGORY_LABEL: Record<Category, string> = {
  Sword: '剣',
  Helm: '兜',
  Armor: '鎧',
  Acc: '装飾',
};

const CATEGORIES: Category[] = ['Sword', 'Helm', 'Armor', 'Acc'];

const MATERIAL_LABEL: Record<MaterialType, string> = {
  Iron: '鉄',
  Wood: '木',
  Cloth: '布',
  Gem: '宝石',
  Mithril: 'ミスリル',
  Orichalcum: 'オリハルコン',
};

interface SelfCraftModalProps {
  onClose: () => void;
}

export function SelfCraftModal({ onClose }: SelfCraftModalProps) {
  const workshop = useGameStore((s) => s.workshop);
  const materials = useGameStore((s) => s.materials);
  const employees = useGameStore((s) => s.employees);
  const startSelfCraft = useGameStore((s) => s.startSelfCraft);

  const [category, setCategory] = useState<Category>('Sword');
  const [tier, setTier] = useState(1);

  const required = materialsForOrder(tier);
  const affordable = canAffordMaterials(required, materials);
  const idleAvailable = employees.some((e) => e.state === 'idle' && e.stamina >= 30);
  const tierDef = TIER_TABLE[tier];
  const canStart = affordable && idleAvailable && tierDef != null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="自作">
      <div className="modal" style={{ maxWidth: 520 }}>
        <header className="modal-header">
          <h2>🛠 自作</h2>
          <button type="button" className="btn-text" onClick={onClose} aria-label="閉じる">
            ✕ 閉じる
          </button>
        </header>
        <div className="modal-body">
          <div className="self-craft-row">
            <label>カテゴリ:</label>
            <div className="self-craft-cats">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`btn-secondary ${category === c ? 'btn-active' : ''}`}
                  onClick={() => setCategory(c)}
                >
                  {CATEGORY_LABEL[c]}
                </button>
              ))}
            </div>
          </div>
          <div className="self-craft-row">
            <label>Tier:</label>
            <div className="self-craft-cats">
              {Array.from({ length: workshop.tierMax }, (_, i) => i + 1).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`btn-secondary ${tier === t ? 'btn-active' : ''}`}
                  onClick={() => setTier(t)}
                >
                  ★{t}
                </button>
              ))}
            </div>
          </div>
          <div className="self-craft-info">
            <p>製造日数: {tierDef?.craftDays} 日 / 参考売値: {tierDef?.selfPrice.toLocaleString()} GUM</p>
            <div className="order-card-mats">
              {Object.entries(required).map(([mat, qty]) => {
                const have = materials[mat as MaterialType] ?? 0;
                const ok = have >= (qty ?? 0);
                return (
                  <span key={mat} className={`mat-chip ${ok ? '' : 'mat-chip-short'}`}>
                    {MATERIAL_LABEL[mat as MaterialType]} {qty} ({have})
                  </span>
                );
              })}
            </div>
          </div>
          <div className="price-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              キャンセル
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!canStart}
              onClick={() => {
                if (startSelfCraft(category, tier)) onClose();
              }}
            >
              {!affordable ? '素材不足' : !idleAvailable ? '従業員不足' : '開始'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
