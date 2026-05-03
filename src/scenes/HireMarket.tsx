import { useGameStore } from '../store/gameStore';
import type { Category, Employee } from '../game/types';

const CATEGORY_LABEL: Record<Category, string> = {
  Sword: '剣',
  Helm: '兜',
  Armor: '鎧',
  Acc: '装飾',
};

interface HireMarketProps {
  onClose: () => void;
}

export function HireMarketScene({ onClose }: HireMarketProps) {
  const hireMarket = useGameStore((s) => s.hireMarket);
  const gum = useGameStore((s) => s.gum);
  const hireEmployee = useGameStore((s) => s.hireEmployee);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="雇用ボード">
      <div className="modal modal-large">
        <header className="modal-header">
          <h2>雇用ボード ({hireMarket.length} 名)</h2>
          <div className="modal-meta">所持 {gum.toLocaleString()} GUM</div>
          <button type="button" className="btn-text" onClick={onClose} aria-label="閉じる">
            ✕ 閉じる
          </button>
        </header>
        <div className="modal-body">
          {hireMarket.length === 0 ? (
            <p className="placeholder">候補者がいません。「次の日へ」で更新されます。</p>
          ) : (
            <ul className="hire-list">
              {hireMarket.map((c) => (
                <CandidateCard
                  key={c.id}
                  candidate={c}
                  canAfford={gum >= c.wage}
                  onHire={() => {
                    if (hireEmployee(c.id)) onClose();
                  }}
                />
              ))}
            </ul>
          )}
          <p className="market-note">
            ※ 雇用時に初日分の日給を前払い。以降毎日「次の日へ」で日給が引かれます。
          </p>
        </div>
      </div>
    </div>
  );
}

interface CandidateCardProps {
  candidate: Employee;
  canAfford: boolean;
  onHire: () => void;
}

function CandidateCard({ candidate, canAfford, onHire }: CandidateCardProps) {
  return (
    <li className="hire-card">
      <div className="hire-card-head">
        <span className="hire-card-name">{candidate.name}</span>
        <span className="hire-card-rarity">{candidate.rarity}</span>
      </div>
      <div className="hire-card-body">
        <div className="hire-card-row">
          <span>得意</span>
          <span>{CATEGORY_LABEL[candidate.affinity]}</span>
        </div>
        <div className="hire-card-row">
          <span>クラフトLv</span>
          <span>{candidate.craftLv}</span>
        </div>
        <div className="hire-card-row">
          <span>スタミナ</span>
          <span>{candidate.stamina} / 100</span>
        </div>
        <div className="hire-card-row">
          <span>日給</span>
          <strong className="hire-card-wage">{candidate.wage} GUM</strong>
        </div>
      </div>
      <button
        type="button"
        className="btn-primary hire-card-accept"
        onClick={onHire}
        disabled={!canAfford}
      >
        {canAfford ? '雇う' : 'GUM不足'}
      </button>
    </li>
  );
}
