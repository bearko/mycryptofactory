import { useGameStore } from './store/gameStore';

function App() {
  const { day, gum, reputation } = useGameStore();

  return (
    <div className="workshop">
      <header className="hud">
        <div>Day {day}</div>
        <div>{gum} GUM</div>
        <div>Rep {reputation}/100</div>
      </header>
      <main className="hub">
        <p>マイクリ・クラフトマスター — scaffold</p>
      </main>
    </div>
  );
}

export default App;
