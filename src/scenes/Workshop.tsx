import { HUD } from '../components/HUD';
import { useGameStore } from '../store/gameStore';
import type { Feature } from '../store/gameStore';

interface ZoneProps {
  title: string;
  subtitle?: string;
  locked?: boolean;
  unlockHint?: string;
  children?: React.ReactNode;
}

function Zone({ title, subtitle, locked, unlockHint, children }: ZoneProps) {
  return (
    <section className={`zone ${locked ? 'zone-locked' : ''}`} aria-label={title}>
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

function CraftSlot({ index, active }: { index: number; active: boolean }) {
  return (
    <div className={`craft-slot ${active ? 'craft-slot-active' : 'craft-slot-locked'}`}>
      <span className="craft-slot-num">#{index + 1}</span>
      <span className="craft-slot-state">{active ? '空き' : '🔒'}</span>
    </div>
  );
}

export function Workshop() {
  const workshop = useGameStore((s) => s.workshop);
  const employees = useGameStore((s) => s.employees);
  const materials = useGameStore((s) => s.materials);
  const orderBoard = useGameStore((s) => s.orderBoard);
  const inventory = useGameStore((s) => s.inventory);
  const unlockedFeatures = useGameStore((s) => s.unlockedFeatures);

  const has = (f: Feature) => unlockedFeatures.includes(f);
  const totalMaterials = Object.values(materials).reduce((a, b) => a + b, 0);

  return (
    <div className={`workshop workshop-lv-${workshop.level}`}>
      <HUD />

      <main className="hub">
        <Zone title="受注ボード" subtitle={`現在 ${orderBoard.length} 件`}>
          <p className="placeholder">クラフト依頼が表示されます（Day 3で実装）</p>
        </Zone>

        <Zone
          title="クラフト台"
          subtitle={`Lv${workshop.level}・${workshop.slots}/3 slots・Tier上限 ${workshop.tierMax}`}
        >
          <div className="craft-slots">
            {[0, 1, 2].map((i) => (
              <CraftSlot key={i} index={i} active={i < workshop.slots} />
            ))}
          </div>
        </Zone>

        <Zone title="素材庫" subtitle={`計 ${totalMaterials} 個`}>
          <ul className="material-list">
            {Object.entries(materials).map(([name, count]) => (
              <li key={name} className="material-row">
                <span>{name}</span>
                <span className="material-count">{count}</span>
              </li>
            ))}
          </ul>
        </Zone>

        <Zone
          title="従業員部屋"
          subtitle={`${employees.length} 人`}
        >
          <ul className="employee-list">
            {employees.map((e) => (
              <li key={e.id} className="employee-row">
                <span className="employee-name">{e.name}</span>
                <span className="employee-meta">
                  {e.rarity} / {e.affinity} Lv{e.craftLv} / Stamina {e.stamina}
                </span>
              </li>
            ))}
          </ul>
        </Zone>

        <Zone
          title="採集マップ"
          locked={!has('SELF_CRAFT')}
          unlockHint="累計 10,000 GUM で解放"
        />

        <Zone
          title="ショーケース"
          subtitle={has('SELF_CRAFT') ? `${inventory.length} 個陳列可能` : undefined}
          locked={!has('SELF_CRAFT')}
          unlockHint="累計 10,000 GUM で解放"
        />
      </main>

      <footer className="footer">
        <button type="button" className="btn-primary" aria-label="次の日へ進む">
          次の日へ
        </button>
      </footer>
    </div>
  );
}
