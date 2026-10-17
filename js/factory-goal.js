// 期限 8 年・クリア（工房 Lv.5）・途中の節目（SPEC-001）。DOM に触れない純関数だけ (= tests/goal.test.mjs)
// 週数はすべて「ゲーム開始（2018 年 12 月 1 週）からの週数」（platform.js の weeksSinceStart と同じ物差し）

export const WEEKS_PER_MONTH = 4;
export const WEEKS_PER_YEAR = 12 * WEEKS_PER_MONTH; // 48
export const DEADLINE_YEARS = 8;
export const DEADLINE_WEEKS = DEADLINE_YEARS * WEEKS_PER_YEAR; // 384 = 2026/12/1 になった瞬間

/** 各年の終わり（開始から 48 週ごと、1〜8 年）なら "year1"〜"year8"、それ以外は null */
export function yearEndMilestone(weeks) {
  if (!Number.isInteger(weeks) || weeks <= 0 || weeks % WEEKS_PER_YEAR !== 0) return null;
  const year = weeks / WEEKS_PER_YEAR;
  return year <= DEADLINE_YEARS ? `year${year}` : null;
}

/** 工房 Lv 2〜4 → "lv2"〜"lv4"、Lv 5 → "clear"、それ以外は null */
export function levelMilestone(lv) {
  if (lv >= 2 && lv <= 4) return `lv${lv}`;
  if (lv === 5) return "clear";
  return null;
}

/** 期限の内側か (= 384 週目に入った瞬間に期限) */
export function isWithinDeadline(weeks) {
  return weeks < DEADLINE_WEEKS;
}

/** 週数を { years, months, weeks } に分ける */
export function splitWeeks(total) {
  const t = Math.max(0, Math.floor(total || 0));
  return {
    years: Math.floor(t / WEEKS_PER_YEAR),
    months: Math.floor((t % WEEKS_PER_YEAR) / WEEKS_PER_MONTH),
    weeks: t % WEEKS_PER_MONTH,
  };
}

/** 期限までの残り（過ぎたら 0） */
export function remainingTime(weeks) {
  return splitWeeks(DEADLINE_WEEKS - weeks);
}
