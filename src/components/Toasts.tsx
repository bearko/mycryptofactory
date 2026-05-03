import { useGameStore } from '../store/gameStore';

/**
 * One-shot transient notifications (e.g., bidding losses).
 * Auto-cleared on advanceDay; user can dismiss individually.
 */
export function Toasts() {
  const messages = useGameStore((s) => s.transientMessages);
  const dismiss = useGameStore((s) => s.dismissTransientMessage);

  if (messages.length === 0) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {messages.map((msg, i) => (
        <div key={`${i}-${msg}`} className="toast">
          <span className="toast-text">{msg}</span>
          <button
            type="button"
            className="toast-close"
            onClick={() => dismiss(i)}
            aria-label="通知を閉じる"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
