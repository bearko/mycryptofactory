import { useGameStore } from '../store/gameStore';
import { trendHeadline } from '../game/demandTrend';
import type { NewsItem } from '../game/types';

/**
 * Shows the next 1-2 days of demand trends.
 * Phase 4 sale simulation will use the same data for pricing.
 */
export function News() {
  const tomorrow = useGameStore((s) => s.newsTomorrow);
  const afterTomorrow = useGameStore((s) => s.newsAfterTomorrow);
  const day = useGameStore((s) => s.day);

  if (!tomorrow && !afterTomorrow) return null;

  return (
    <aside className="news" aria-label="マーケットニュース">
      <header className="news-header">📰 マーケット予報</header>
      <ul className="news-list">
        {tomorrow && (
          <NewsRow label={`Day ${tomorrow.date} (明日)`} item={tomorrow} highlight={tomorrow.date === day + 1} />
        )}
        {afterTomorrow && <NewsRow label={`Day ${afterTomorrow.date}`} item={afterTomorrow} />}
      </ul>
    </aside>
  );
}

function NewsRow({ label, item, highlight }: { label: string; item: NewsItem; highlight?: boolean }) {
  return (
    <li className={`news-row ${highlight ? 'news-row-highlight' : ''}`}>
      <span className="news-day">{label}</span>
      <span className="news-trend">{trendHeadline(item)}</span>
    </li>
  );
}
