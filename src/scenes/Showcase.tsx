import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { fairPriceForExt } from '../game/marketSimulator';
import { SHOWCASE_MAX_LISTED } from '../data/balance';
import type { Category, EXT } from '../game/types';

const CATEGORY_LABEL: Record<Category, string> = {
  Sword: '剣',
  Helm: '兜',
  Armor: '鎧',
  Acc: '装飾',
};

interface ShowcaseProps {
  onClose: () => void;
}

export function Showcase({ onClose }: ShowcaseProps) {
  const inventory = useGameStore((s) => s.inventory);
  const showcase = useGameStore((s) => s.showcase);
  const listShowcaseItem = useGameStore((s) => s.listShowcaseItem);
  const unlistShowcaseItem = useGameStore((s) => s.unlistShowcaseItem);

  const [pricingExt, setPricingExt] = useState<EXT | null>(null);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="ショーケース">
      <div className="modal modal-large">
        <header className="modal-header">
          <h2>ショーケース</h2>
          <div className="modal-meta">
            陳列 {showcase.length}/{SHOWCASE_MAX_LISTED} / 在庫 {inventory.length}
          </div>
          <button type="button" className="btn-text" onClick={onClose} aria-label="閉じる">
            ✕ 閉じる
          </button>
        </header>
        <div className="modal-body">
          <section>
            <h3 className="showcase-section-title">陳列中</h3>
            {showcase.length === 0 ? (
              <p className="placeholder">陳列中の商品はありません。</p>
            ) : (
              <ul className="showcase-list">
                {showcase.map((s) => (
                  <li key={s.id} className="showcase-card">
                    <div className="showcase-card-head">
                      <span>{CATEGORY_LABEL[s.ext.category]} ★{s.ext.tier}</span>
                      <span className="showcase-card-quality">Q {s.ext.quality}</span>
                    </div>
                    <div className="showcase-card-row">
                      <span>価格</span>
                      <strong className="showcase-price">{s.price.toLocaleString()} GUM</strong>
                    </div>
                    <div className="showcase-card-row">
                      <span>陳列日数</span>
                      <span>{s.daysListed} 日</span>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => unlistShowcaseItem(s.id)}
                    >
                      撤去（在庫へ戻す）
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section style={{ marginTop: '1.5rem' }}>
            <h3 className="showcase-section-title">在庫（陳列可能）</h3>
            {inventory.length === 0 ? (
              <p className="placeholder">在庫がありません。クラフト台で「自作」してください。</p>
            ) : (
              <ul className="inventory-list">
                {inventory.map((ext) => (
                  <li key={ext.id} className="inventory-card">
                    <span>{CATEGORY_LABEL[ext.category]} ★{ext.tier}</span>
                    <span className="inventory-quality">Q {ext.quality}</span>
                    <span className="inventory-fair">参考: {fairPriceForExt(ext).toLocaleString()} GUM</span>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={showcase.length >= SHOWCASE_MAX_LISTED}
                      onClick={() => setPricingExt(ext)}
                    >
                      陳列する
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {pricingExt && (
        <PriceModal
          ext={pricingExt}
          onCancel={() => setPricingExt(null)}
          onConfirm={(price) => {
            if (listShowcaseItem(pricingExt.id, price)) {
              setPricingExt(null);
            }
          }}
        />
      )}
    </div>
  );
}

function PriceModal({
  ext,
  onCancel,
  onConfirm,
}: {
  ext: EXT;
  onCancel: () => void;
  onConfirm: (price: number) => void;
}) {
  const fair = fairPriceForExt(ext);
  const min = Math.floor(fair * 0.5);
  const max = Math.ceil(fair * 1.5);
  const [price, setPrice] = useState(fair);

  const ratio = (price / Math.max(1, fair)).toFixed(2);

  return (
    <div className="modal-backdrop" style={{ zIndex: 150 }} role="dialog" aria-modal="true" aria-label="値付け">
      <div className="modal" style={{ maxWidth: 380 }}>
        <header className="modal-header">
          <h2>値付け: {CATEGORY_LABEL[ext.category]} ★{ext.tier}</h2>
        </header>
        <div className="modal-body">
          <p>品質: Q {ext.quality} / 参考価格 {fair.toLocaleString()} GUM</p>
          <input
            type="range"
            min={min}
            max={max}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            style={{ width: '100%' }}
          />
          <p className="price-display">
            <strong>{price.toLocaleString()} GUM</strong> (相場 ×{ratio})
          </p>
          <div className="price-actions">
            <button type="button" className="btn-secondary" onClick={onCancel}>
              キャンセル
            </button>
            <button type="button" className="btn-primary" onClick={() => onConfirm(price)}>
              この価格で陳列
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
