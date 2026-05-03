import { useState } from 'react';
import { HUD } from '../components/HUD';
import { MinigameModal } from '../components/MinigameModal';
import { OrderBoard } from './OrderBoard';
import { MaterialMarket } from './MaterialMarket';
import { useGameStore } from '../store/gameStore';
import type { ActiveCraft, Feature } from '../store/gameStore';

type ModalScene = 'orders' | 'market' | null;

interface ZoneProps {
  title: string;
  subtitle?: string;
  locked?: boolean;
  unlockHint?: string;
  onClick?: () => void;
  children?: React.ReactNode;
}

function Zone({ title, subtitle, locked, unlockHint, onClick, children }: ZoneProps) {
  const clickable = !!onClick && !locked;
  return (
    <section
      className={`zone ${locked ? 'zone-locked' : ''} ${clickable ? 'zone-clickable' : ''}`}
      aria-label={title}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      <header className="zone-header">
        <h2 className="zone-title">{title}</h2>
        {subtitle && <p className="zone-subtitle">{subtitle}</p>}
      </header>
      <div className="zone-body">
        {locked ? <p className="locked-hint">🔒 {unlockHint ?? 'まだ解放されていません'}</p> : children}
      </div>
    </section>
  );
}

function CraftSlot({ index, active, craft }: { index: number; active: boolean; craft?: ActiveCraft }) {
  if (!active) {
    return (
      <div className="craft-slot craft-slot-locked">
        <span className="craft-slot-num">#{index + 1}</span>
        <span className="craft-slot-state">🔒</span>
      </div>
    );
  }
  if (craft) {
    return (
      <div className="craft-slot craft-slot-busy">
        <span className="craft-slot-num">#{index + 1}</span>
        <span className="craft-slot-cat">{craft.category} ★{craft.tier}</span>
        <span className="craft-slot-meta">残{craft.daysRemaining}日 / Q{craft.quality}</span>
      </div>
    );
  }
  return (
    <div className="craft-slot craft-slot-active">
      <span className="craft-slot-num">#{index + 1}</span>
      <span className="craft-slot-state">空き</span>
    </div>
  );
}

function DayLogPanel() {
  const log = useGameStore((s) => s.lastDayLog);
  if (!log || log.events.length === 0) return null;
  return (
    <aside className="day-log" aria-label="昨日の出来事">
      <header>Day {log.day} の出来事</header>
      <ul>
        {log.events.map((ev, i) => (
          <li key={i}>{ev}</li>
        ))}
      </ul>
    </aside>
  );
}

function BankruptModal({ onReset }: { onReset: () => void }) {
  return (
    <div className="modal-backdrop" role="alertdialog" aria-modal="true" aria-label="ゲームオーバー">
      <div className="modal modal-bankrupt">
        <h2>💀 工房閉鎖</h2>
        <p>3日連続赤字で運転資金が尽きました。</p>
        <button type="button" className="btn-primary" onClick={onReset}>
          最初から始める
        </button>
      </div>
    </div>
  );
}

export function Workshop() {
  const workshop = useGameStore((s) => s.workshop);
  const employees = useGameStore((s) => s.employees);
  const materials = useGameStore((s) => s.materials);
  const orderBoard = useGameStore((s) => s.orderBoard);
  const inventory = useGameStore((s) => s.inventory);
  const activeCrafts = useGameStore((s) => s.activeCrafts);
  const unlockedFeatures = useGameStore((s) => s.unlockedFeatures);
  const isBankrupt = useGameStore((s) => s.isBankrupt);
  const advanceDay = useGameStore((s) => s.advanceDay);
  const reset = useGameStore((s) => s.reset);
  const pendingMinigame = useGameStore((s) => s.pendingMinigame);

  const [scene, setScene] = useState<ModalScene>(null);

  const has = (f: Feature) => unlockedFeatures.includes(f);
  const totalMaterials = Object.values(materials).reduce((a, b) => a + b, 0);
  const closeScene = () => setScene(null);
  const canAdvance = !isBankrupt && !pendingMinigame;

  return (
    <div className={`workshop workshop-lv-${workshop.level}`}>
      <HUD />

      <main className="hub">
        <Zone
          title="受注ボード"
          subtitle={`${orderBoard.length} 件`}
          onClick={() => setScene('orders')}
        >
          <p className="placeholder">クリックして注文を見る</p>
        </Zone>

        <Zone
          title="クラフト台"
          subtitle={`Lv${workshop.level}・${activeCrafts.length}/${workshop.slots} 稼働中`}
        >
          <div className="craft-slots">
            {[0, 1, 2].map((i) => (
              <CraftSlot
                key={i}
                index={i}
                active={i < workshop.slots}
                craft={activeCrafts[i]}
              />
            ))}
          </div>
        </Zone>

        <Zone
          title="素材庫"
          subtitle={`計 ${totalMaterials} 個 — 市場へ`}
          onClick={() => setScene('market')}
        >
          <ul className="material-list">
            {Object.entries(materials).map(([name, count]) => (
              <li key={name} className="material-row">
                <span>{name}</span>
                <span className="material-count">{count}</span>
              </li>
            ))}
          </ul>
        </Zone>

        <Zone title="従業員部屋" subtitle={`${employees.length} 人`}>
          <ul className="employee-list">
            {employees.map((e) => (
              <li key={e.id} className="employee-row">
                <span className="employee-name">{e.name}</span>
                <span className="employee-meta">
                  {e.rarity} / {e.affinity} Lv{e.craftLv} / {e.state}
                </span>
              </li>
            ))}
          </ul>
        </Zone>

        <Zone title="採集マップ" locked={!has('SELF_CRAFT')} unlockHint="累計 10,000 GUM で解放" />

        <Zone
          title="ショーケース"
          subtitle={has('SELF_CRAFT') ? `${inventory.length} 個陳列可能` : undefined}
          locked={!has('SELF_CRAFT')}
          unlockHint="累計 10,000 GUM で解放"
        />
      </main>

      <DayLogPanel />

      <footer className="footer">
        <button
          type="button"
          className="btn-primary"
          aria-label="次の日へ進む"
          onClick={advanceDay}
          disabled={!canAdvance}
        >
          {pendingMinigame ? 'クラフト中…' : '次の日へ'}
        </button>
      </footer>

      {scene === 'orders' && <OrderBoard onClose={closeScene} />}
      {scene === 'market' && <MaterialMarket onClose={closeScene} />}
      <MinigameModal />
      {isBankrupt && <BankruptModal onReset={reset} />}
    </div>
  );
}
