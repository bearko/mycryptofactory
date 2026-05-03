import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';

const TUTORIAL_KEY = 'mcf-tutorial-seen-v1';

interface TutorialStep {
  forDay: number;
  message: string;
  cta: string;
}

const STEPS: TutorialStep[] = [
  {
    forDay: 1,
    message: '工房へようこそ！\n\nまずは「受注ボード」をクリックして注文を取ってみよう。素材があるオーダーを選んで「受ける」を押すとミニゲームが始まります。',
    cta: 'やってみる',
  },
  {
    forDay: 2,
    message: '注文をこなしたら、「次の日へ」で時間を進めましょう。\n\n素材が足りない時は「素材庫」から市場へ行って買えます。価格は3日サイクルで変動するので、安い日に仕入れるのがコツ。',
    cta: 'なるほど',
  },
  {
    forDay: 3,
    message: '累計 1,000 GUM で雇用と工房レベルアップが解放されます！\n\n稼いだ GUM を投資して効率を上げる、そして高 Tier の受注へ挑戦…成長を実感してください。',
    cta: 'プレイする',
  },
];

function getSeenSteps(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const stored = window.localStorage.getItem(TUTORIAL_KEY);
    return stored ? parseInt(stored, 10) : 0;
  } catch {
    return 0;
  }
}

function setSeenSteps(n: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TUTORIAL_KEY, String(n));
  } catch {
    // ignore
  }
}

export function Tutorial() {
  const day = useGameStore((s) => s.day);
  const [seenCount, setSeenCount] = useState<number>(() => getSeenSteps());

  // Compute current step: based on day, show STEPS[day-1] if not yet seen
  const stepIdx = day - 1;
  const step = STEPS[stepIdx];
  const shouldShow = step != null && stepIdx >= seenCount && day <= 3;

  useEffect(() => {
    // Re-check on day change
    setSeenCount(getSeenSteps());
  }, [day]);

  if (!shouldShow) return null;

  const handleNext = () => {
    const newCount = stepIdx + 1;
    setSeenSteps(newCount);
    setSeenCount(newCount);
  };

  const handleSkip = () => {
    setSeenSteps(STEPS.length);
    setSeenCount(STEPS.length);
  };

  return (
    <div className="tutorial-backdrop" role="dialog" aria-modal="true" aria-label="チュートリアル">
      <div className="tutorial-bubble">
        <header className="tutorial-header">
          <span className="tutorial-step">Day {day} / 3</span>
          <button type="button" className="btn-text tutorial-skip" onClick={handleSkip}>
            スキップ
          </button>
        </header>
        <p className="tutorial-message">{step.message}</p>
        <button type="button" className="btn-primary tutorial-next" onClick={handleNext}>
          {step.cta}
        </button>
      </div>
    </div>
  );
}
