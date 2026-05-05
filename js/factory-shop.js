/**
 * factory-shop.js — Phase 1D-34: ショップアイテムマスター + ロード処理
 *
 * data/shop-items.json から読み込み、 SHOP_ITEMS / SHOP_ITEM_BY_ID で公開する。
 * 在庫管理 (state.shopStock) と購入処理は main.js 側で実装。
 */

/** @type {Array<object>} ショップアイテム master (loadShopItems 後に populated) */
export const SHOP_ITEMS = [];

/** @type {Record<string, object>} id ルックアップ */
export const SHOP_ITEM_BY_ID = {};

let _loadingPromise = null;

export function loadShopItems() {
  if (_loadingPromise) return _loadingPromise;
  _loadingPromise = fetch("./data/shop-items.json")
    .then(r => {
      if (!r.ok) throw new Error(`shop-items.json fetch failed: ${r.status}`);
      return r.json();
    })
    .then(arr => {
      SHOP_ITEMS.length = 0;
      for (const it of arr) {
        SHOP_ITEMS.push(it);
        SHOP_ITEM_BY_ID[it.id] = it;
      }
      return SHOP_ITEMS;
    });
  return _loadingPromise;
}

/** カテゴリ → アイテム配列 のマップを返す。 */
export function shopItemsByCategory() {
  const map = {};
  for (const it of SHOP_ITEMS) {
    const c = it.category || "misc";
    if (!map[c]) map[c] = [];
    map[c].push(it);
  }
  return map;
}

/** アイテムの工房 Lv に応じた表示用 icon パス + 価格 + 効果値を返す。
 *  - 魔石 (= category "magic-stone") は工房 Lv 1-5 でアイコン / 価格 / 効果が変化
 *  - それ以外は単一価格 + 単一アイコン
 *
 *  @param {object} item   SHOP_ITEMS の 1 つ
 *  @param {number} factoryLevel  state.factoryLevel (1-5)
 *  @returns {{ iconUrl: string, price: number, gain: number, lv: number }}
 */
export function shopItemViewData(item, factoryLevel) {
  const lv = Math.max(1, Math.min(5, factoryLevel || 1));
  const iconBase = item.iconBase || item.id;
  if (item.category === "magic-stone") {
    return {
      iconUrl: `./Image/Shop/${iconBase}-${lv}.webp`,
      price: (item.priceByLv?.[String(lv)]) ?? 0,
      gain: (item.effectByLv?.[String(lv)]?.gain) ?? 0,
      lv,
    };
  }
  return {
    iconUrl: `./Image/Shop/${iconBase}.webp`,
    price: item.price ?? 0,
    gain: 0,
    lv,
  };
}
