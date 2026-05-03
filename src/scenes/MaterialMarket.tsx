import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { BASE_MATERIALS, type MaterialType } from '../game/types';

const MATERIAL_LABEL: Record<MaterialType, string> = {
  Iron: '鉄',
  Wood: '木',
  Cloth: '布',
  Gem: '宝石',
  Mithril: 'ミスリル',
  Orichalcum: 'オリハルコン',
};

interface MaterialMarketProps {
  onClose: () => void;
}

export function MaterialMarket({ onClose }: MaterialMarketProps) {
  const materials = useGameStore((s) => s.materials);
  const marketPrices = useGameStore((s) => s.marketPrices);
  const gum = useGameStore((s) => s.gum);
  const buyMaterial = useGameStore((s) => s.buyMaterial);
  const sellMaterial = useGameStore((s) => s.sellMaterial);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="素材市場">
      <div className="modal">
        <header className="modal-header">
          <h2>素材市場</h2>
          <div className="modal-meta">所持 {gum.toLocaleString()} GUM</div>
          <button type="button" className="btn-text" onClick={onClose} aria-label="閉じる">
            ✕ 閉じる
          </button>
        </header>
        <div className="modal-body">
          <table className="market-table">
            <thead>
              <tr>
                <th>素材</th>
                <th>買値</th>
                <th>売値</th>
                <th>所持</th>
                <th>取引</th>
              </tr>
            </thead>
            <tbody>
              {BASE_MATERIALS.map((mat) => (
                <MarketRow
                  key={mat}
                  material={mat}
                  buyPrice={marketPrices[mat]}
                  sellPrice={Math.floor(marketPrices[mat] * 0.7)}
                  owned={materials[mat]}
                  canAfford={(qty) => gum >= marketPrices[mat] * qty}
                  onBuy={(qty) => buyMaterial(mat, qty)}
                  onSell={(qty) => sellMaterial(mat, qty)}
                />
              ))}
            </tbody>
          </table>
          <p className="market-note">※ 売値は買値の 70%。価格は3日サイクルで変動。</p>
        </div>
      </div>
    </div>
  );
}

interface MarketRowProps {
  material: MaterialType;
  buyPrice: number;
  sellPrice: number;
  owned: number;
  canAfford: (qty: number) => boolean;
  onBuy: (qty: number) => void;
  onSell: (qty: number) => void;
}

function MarketRow({ material, buyPrice, sellPrice, owned, canAfford, onBuy, onSell }: MarketRowProps) {
  const [qty, setQty] = useState(1);
  return (
    <tr>
      <td>{MATERIAL_LABEL[material]}</td>
      <td className="num">{buyPrice}</td>
      <td className="num">{sellPrice}</td>
      <td className="num">{owned}</td>
      <td className="market-actions">
        <button
          type="button"
          className="btn-step"
          onClick={() => setQty(Math.max(1, qty - 1))}
          aria-label="数量を減らす"
        >
          −
        </button>
        <span className="market-qty">{qty}</span>
        <button
          type="button"
          className="btn-step"
          onClick={() => setQty(qty + 1)}
          aria-label="数量を増やす"
        >
          +
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={!canAfford(qty)}
          onClick={() => onBuy(qty)}
        >
          買う
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={owned < qty}
          onClick={() => onSell(qty)}
        >
          売る
        </button>
      </td>
    </tr>
  );
}
