import { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { featureLabel } from '../game/featureUnlocks';
import { playSE } from './AudioManager';
import type { Feature } from '../game/types';

const FEATURE_DETAILS: Record<Feature, { title: string; description: string }> = {
  HIRE: {
    title: '🆕 雇用機能 解放！',
    description: '従業員を雇って工房を拡張できるようになりました。\n従業員部屋の「雇用ボード」から候補者を確認できます。',
  },
  WORKSHOP_UP: {
    title: '🆕 工房レベルアップ 解放！',
    description: '工房を拡張して同時クラフト数と Tier 上限を上げられます。\nクラフト台の「工房 Lv up」ボタンから。',
  },
  HIGH_TIER: {
    title: '🆕 高Tier受注 解放！',
    description: 'Tier 3 以上の高報酬オーダーが受注ボードに登場します。\n競合との入札勝負になりますが、評判で勝ちやすくなります。',
  },
  SELF_CRAFT: {
    title: '🆕 採集 + 自作モード 解放！',
    description: '採集マップで素材を集めて、自分で EXT を作って市場で売れます。\nフッターの「🛠 自作する」と、ハブの「採集マップ / ショーケース」へ。',
  },
};

export function UnlockModal() {
  const queue = useGameStore((s) => s.unlockQueue);
  const dismiss = useGameStore((s) => s.dismissUnlockNotice);

  const current = queue[0];

  // Play fanfare when a new unlock is shown
  useEffect(() => {
    if (current) {
      playSE('fanfare');
    }
  }, [current]);

  if (!current) return null;

  const detail = FEATURE_DETAILS[current];

  return (
    <div className="modal-backdrop unlock-backdrop" role="alertdialog" aria-modal="true" aria-label={detail.title}>
      <div className="modal modal-unlock">
        <div className="unlock-header">
          <span className="unlock-emoji">✨</span>
          <h2>{detail.title}</h2>
        </div>
        <p className="unlock-desc">{detail.description}</p>
        <p className="unlock-feature-tag">{featureLabel(current)}</p>
        <button type="button" className="btn-primary unlock-ok" onClick={() => dismiss(current)}>
          OK
        </button>
      </div>
    </div>
  );
}
