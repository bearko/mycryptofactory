/**
 * heroes.js — ヒーローマスタ (data/heroes.json から runtime fetch)
 *
 * 旧 sync_csv_json.js による静的生成は廃止。data/heroes.json が唯一の正本。
 * GAS Spreadsheet sync で heroes.json が更新されると、次回起動時に runtime が
 * fetch して反映される (.js ファイルの再生成不要)。
 *
 * HERO_ROSTER / HERO_DEFS は loadHeroes() が呼ばれるまで空配列 / 空オブジェクト。
 * main.js init() で `await loadHeroes()` してから利用する。
 */
import { img } from "./constants.js";

/** ヒーロー配列 (JSON 順序を保つ。loadHeroes() 後に populated) */
export const HERO_ROSTER = [];
/** ID 検索用ルックアップ {String(heroId): hero} */
export const HERO_DEFS = {};

let _loadingPromise = null;

/** data/heroes.json を fetch して HERO_ROSTER / HERO_DEFS に展開。idempotent。 */
export function loadHeroes() {
  if (_loadingPromise) return _loadingPromise;
  _loadingPromise = fetch("./data/heroes.json")
    .then(r => {
      if (!r.ok) throw new Error(`heroes.json fetch failed: ${r.status}`);
      return r.json();
    })
    .then(arr => {
      // 既存配列を mutate (export const のため reference は保持)
      HERO_ROSTER.length = 0;
      for (const h of arr) {
        const hero = { ...h, img: () => img(`Image/Heroes/${h.heroId}.png`) };
        HERO_ROSTER.push(hero);
        HERO_DEFS[String(h.heroId)] = hero;
      }
      return HERO_ROSTER;
    });
  return _loadingPromise;
}
