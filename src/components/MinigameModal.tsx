import { SwordMiniGame } from '../minigames/Sword';
import { Helm } from '../minigames/Helm';
import { Armor } from '../minigames/Armor';
import { Acc } from '../minigames/Acc';
import { useGameStore } from '../store/gameStore';

interface MinigameResultLike {
  quality: number;
  success: boolean;
  durationMs: number;
}

/**
 * Modal that dispatches to the right mini-game based on the pending category.
 * Reads pendingMinigame from store; closes itself by calling completeMinigame/cancelMinigame.
 */
export function MinigameModal() {
  const pending = useGameStore((s) => s.pendingMinigame);
  const employees = useGameStore((s) => s.employees);
  const activeCrafts = useGameStore((s) => s.activeCrafts);
  const completeMinigame = useGameStore((s) => s.completeMinigame);
  const cancelMinigame = useGameStore((s) => s.cancelMinigame);

  if (!pending) return null;

  const craft = activeCrafts.find((c) => c.id === pending.craftId);
  const employee = employees.find((e) => e.id === craft?.employeeId) ?? employees[0]!;

  const handleComplete = (result: MinigameResultLike) => {
    completeMinigame(pending.craftId, result.quality);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="クラフトミニゲーム">
      <div className="modal modal-minigame">
        <header className="modal-header">
          <h2>{pending.category} クラフト (Tier {pending.tier})</h2>
          <button type="button" className="btn-text" onClick={cancelMinigame} aria-label="キャンセル">
            キャンセル
          </button>
        </header>
        <div className="modal-body">
          {pending.category === 'Sword' && (
            <SwordMiniGame
              tier={pending.tier}
              employee={employee}
              category="Sword"
              onComplete={handleComplete}
              onCancel={cancelMinigame}
            />
          )}
          {pending.category === 'Helm' && (
            <Helm
              tier={pending.tier}
              employee={employee}
              category="Helm"
              onComplete={handleComplete}
              onCancel={cancelMinigame}
            />
          )}
          {pending.category === 'Armor' && (
            <Armor
              tier={pending.tier}
              employee={employee}
              category="Armor"
              onComplete={handleComplete}
              onCancel={cancelMinigame}
            />
          )}
          {pending.category === 'Acc' && (
            <Acc
              tier={pending.tier}
              employee={employee}
              category="Acc"
              onComplete={handleComplete}
              onCancel={cancelMinigame}
            />
          )}
        </div>
      </div>
    </div>
  );
}
