import { useGameStore } from '../store/gameStore';
import { canAffordMaterials, materialsForOrder } from '../game/orderGenerator';
import type { MaterialType, Order } from '../game/types';

const MATERIAL_LABEL: Record<MaterialType, string> = {
  Iron: '鉄',
  Wood: '木',
  Cloth: '布',
  Gem: '宝石',
  Mithril: 'ミスリル',
  Orichalcum: 'オリハルコン',
};

const CATEGORY_LABEL: Record<string, string> = {
  Sword: '剣',
  Helm: '兜',
  Armor: '鎧',
  Acc: '装飾',
};

interface OrderBoardProps {
  onClose: () => void;
}

export function OrderBoard({ onClose }: OrderBoardProps) {
  const orderBoard = useGameStore((s) => s.orderBoard);
  const materials = useGameStore((s) => s.materials);
  const employees = useGameStore((s) => s.employees);
  const activeCrafts = useGameStore((s) => s.activeCrafts);
  const workshop = useGameStore((s) => s.workshop);
  const acceptOrder = useGameStore((s) => s.acceptOrder);

  const idleCount = employees.filter((e) => e.state === 'idle').length;
  const slotsAvailable = workshop.slots - activeCrafts.length;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="受注ボード">
      <div className="modal modal-large">
        <header className="modal-header">
          <h2>受注ボード ({orderBoard.length} 件)</h2>
          <div className="modal-meta">
            空きクラフト枠: {slotsAvailable} / 待機中従業員: {idleCount}
          </div>
          <button type="button" className="btn-text" onClick={onClose} aria-label="閉じる">
            ✕ 閉じる
          </button>
        </header>
        <div className="modal-body">
          {orderBoard.length === 0 ? (
            <p className="placeholder">注文がありません。「次の日へ」で更新されます。</p>
          ) : (
            <ul className="order-list">
              {orderBoard.map((order) => (
                <OrderRow
                  key={order.id}
                  order={order}
                  materials={materials}
                  canTake={
                    slotsAvailable > 0 &&
                    idleCount > 0 &&
                    canAffordMaterials(materialsForOrder(order.tier), materials)
                  }
                  onAccept={() => {
                    acceptOrder(order.id);
                    onClose();
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

interface OrderRowProps {
  order: Order;
  materials: Record<MaterialType, number>;
  canTake: boolean;
  onAccept: () => void;
}

function OrderRow({ order, materials, canTake, onAccept }: OrderRowProps) {
  const required = materialsForOrder(order.tier);
  const hasBidding = order.bidders > 0;
  return (
    <li className="order-card">
      <div className="order-card-head">
        <span className="order-card-cat">{CATEGORY_LABEL[order.category] ?? order.category}</span>
        <span className="order-card-tier">{'★'.repeat(order.tier)}</span>
        <span className="order-card-deadline">残 {order.deadline}日</span>
      </div>
      <div className="order-card-body">
        <div className="order-card-row">
          <span>報酬</span>
          <strong className="order-card-reward">{order.reward.toLocaleString()} GUM</strong>
        </div>
        <div className="order-card-row">
          <span>評判+</span>
          <span>+{order.repBonus}</span>
        </div>
        <div className="order-card-row">
          <span>必要品質</span>
          <span>≥ {order.qualityRequired}</span>
        </div>
        {hasBidding && (
          <div className="order-card-row order-card-bidding">
            <span>競合</span>
            <span>
              {'★'.repeat(order.playerEdge) + '☆'.repeat(3 - order.playerEdge)}{' '}
              <span className="order-card-bidders">他 {order.bidders} 人入札</span>
            </span>
          </div>
        )}
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
      <button
        type="button"
        className="btn-primary order-card-accept"
        onClick={onAccept}
        disabled={!canTake}
        title={hasBidding ? '受注すると入札勝負（評判+運+優位度で判定）' : undefined}
      >
        {canTake ? (hasBidding ? '入札する' : '受ける') : '不可'}
      </button>
    </li>
  );
}
