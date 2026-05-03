import { useGameStore } from '../store/gameStore';

export function HUD() {
  const day = useGameStore((s) => s.day);
  const gum = useGameStore((s) => s.gum);
  const reputation = useGameStore((s) => s.reputation);

  return (
    <header className="hud" role="banner">
      <div className="hud-cell">
        <span className="hud-label">Day</span>
        <span className="hud-value">{day}</span>
      </div>
      <div className="hud-cell">
        <span className="hud-label">GUM</span>
        <span className="hud-value hud-gum">{gum.toLocaleString()}</span>
      </div>
      <div className="hud-cell">
        <span className="hud-label">Rep</span>
        <span className="hud-value">{reputation}/100</span>
      </div>
    </header>
  );
}
