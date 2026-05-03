import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { GATHER_NODES } from '../game/gatherEngine';
import type { Employee } from '../game/types';

interface GatherMapProps {
  onClose: () => void;
}

export function GatherMap({ onClose }: GatherMapProps) {
  const employees = useGameStore((s) => s.employees);
  const dispatches = useGameStore((s) => s.gatherDispatches);
  const dispatchGather = useGameStore((s) => s.dispatchGather);

  const [selectedEmp, setSelectedEmp] = useState<string>('');
  const idleEmployees = employees.filter((e) => e.state === 'idle');

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="採集マップ">
      <div className="modal modal-large">
        <header className="modal-header">
          <h2>採集マップ</h2>
          <div className="modal-meta">
            派遣中 {dispatches.length} 名 / 待機中 {idleEmployees.length} 名
          </div>
          <button type="button" className="btn-text" onClick={onClose} aria-label="閉じる">
            ✕ 閉じる
          </button>
        </header>
        <div className="modal-body">
          <div className="gather-emp-picker">
            <label htmlFor="gather-emp-select">派遣する従業員:</label>
            <select
              id="gather-emp-select"
              value={selectedEmp}
              onChange={(e) => setSelectedEmp(e.target.value)}
              disabled={idleEmployees.length === 0}
            >
              <option value="">-- 選択してください --</option>
              {idleEmployees.map((e: Employee) => (
                <option key={e.id} value={e.id}>
                  {e.name} (Lv {e.craftLv})
                </option>
              ))}
            </select>
            {idleEmployees.length === 0 && <p className="placeholder">待機中の従業員がいません。</p>}
          </div>

          <ul className="gather-node-list">
            {GATHER_NODES.map((node) => (
              <li key={node.id} className="gather-node-card">
                <div className="gather-node-head">
                  <span className="gather-node-name">{node.name}</span>
                </div>
                <p className="gather-node-desc">{node.description}</p>
                <div className="gather-node-mats">
                  {Object.entries(node.baseDrops).map(([mat, w]) => (
                    <span key={mat} className="mat-chip">
                      {mat} {w}%
                    </span>
                  ))}
                  {node.rareDrops.map((r) => (
                    <span key={r.material} className="mat-chip mat-chip-rare">
                      ✨ {r.material} {(r.chance * 100).toFixed(0)}%
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn-primary gather-node-dispatch"
                  disabled={!selectedEmp}
                  onClick={() => {
                    if (dispatchGather(selectedEmp, node.id)) {
                      setSelectedEmp('');
                      onClose();
                    }
                  }}
                >
                  派遣する (1日)
                </button>
              </li>
            ))}
          </ul>

          {dispatches.length > 0 && (
            <div className="gather-active">
              <h3 className="gather-active-title">派遣中</h3>
              <ul>
                {dispatches.map((d) => {
                  const emp = employees.find((e) => e.id === d.employeeId);
                  const node = GATHER_NODES.find((n) => n.id === d.nodeId);
                  return (
                    <li key={d.id}>
                      {emp?.name ?? '?'} → {node?.name ?? '?'} (残 {d.daysRemaining} 日)
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
