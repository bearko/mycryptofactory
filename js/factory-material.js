/**
 * factory-material.js — クラフト素材の定数 + アイコン URL
 *
 * MCH 由来の素材アイコンをそのままリンクで参照する (画像をリポジトリに置かない)。
 * カテゴリ:
 *   normal  — クエスト・ショップで通常入手 (鉄/銅/亜鉛)
 *   land    — ギルド枠のクエスト or ショップで割高入手 (9 種の鉱石)
 *   highTier— クエスト高ランク帯 or 高クラフトレベル shop (クロム/チタン/タングステン)
 */

const MCH_NUXT_BASE = "https://www.mycryptoheroes.net/_nuxt/img";

/** 全素材定義。id がプロジェクト内で安定する key。 */
export const MATERIALS = {
  // ── 通常素材 ──
  iron:   { id: "iron",   category: "normal", nameJa: "鉄",   nameEn: "Iron",   imgUrl: `${MCH_NUXT_BASE}/101.ee2a0c5.webp` },
  copper: { id: "copper", category: "normal", nameJa: "銅",   nameEn: "Copper", imgUrl: `${MCH_NUXT_BASE}/102.33ac4fa.webp` },
  zinc:   { id: "zinc",   category: "normal", nameJa: "亜鉛", nameEn: "Zinc",   imgUrl: `${MCH_NUXT_BASE}/103.1588f93.webp` },

  // ── 高ランク素材 ──
  chromium: { id: "chromium", category: "highTier", nameJa: "クロム",      nameEn: "Chromium", imgUrl: `${MCH_NUXT_BASE}/111.f54364e.webp` },
  titanium: { id: "titanium", category: "highTier", nameJa: "チタン",      nameEn: "Titanium", imgUrl: `${MCH_NUXT_BASE}/112.5c811d5.webp` },
  tungsten: { id: "tungsten", category: "highTier", nameJa: "タングステン", nameEn: "Tungsten", imgUrl: `${MCH_NUXT_BASE}/113.e5170cc.webp` },

  // ── ランド素材 (9 種) ──
  aquamarine: { id: "aquamarine", category: "land", nameJa: "アクアマリン",   nameEn: "Aquamarine", imgUrl: `${MCH_NUXT_BASE}/201.eaf54fd.webp` },
  rhodochrosite: { id: "rhodochrosite", category: "land", nameJa: "インカローズ", nameEn: "Rhodochrosite", imgUrl: `${MCH_NUXT_BASE}/202.a872b37.webp` },
  topaz:    { id: "topaz",    category: "land", nameJa: "トパーズ",       nameEn: "Topaz",      imgUrl: `${MCH_NUXT_BASE}/203.dcea29e.webp` },
  peridot:  { id: "peridot",  category: "land", nameJa: "ペリドット",     nameEn: "Peridot",    imgUrl: `${MCH_NUXT_BASE}/204.9a93dab.webp` },
  onyx:     { id: "onyx",     category: "land", nameJa: "オニキス",       nameEn: "Onyx",       imgUrl: `${MCH_NUXT_BASE}/205.652c498.webp` },
  amethyst: { id: "amethyst", category: "land", nameJa: "アメジスト",     nameEn: "Amethyst",   imgUrl: `${MCH_NUXT_BASE}/206.f507b43.webp` },
  jade:     { id: "jade",     category: "land", nameJa: "ジェイド",       nameEn: "Jade",       imgUrl: `${MCH_NUXT_BASE}/207.c6ac40e.webp` },
  lapis:    { id: "lapis",    category: "land", nameJa: "ラピスラズリ",   nameEn: "Lapis Lazuli", imgUrl: `${MCH_NUXT_BASE}/208.d772281.webp` },
  garnet:   { id: "garnet",   category: "land", nameJa: "ガーネット",     nameEn: "Garnet",     imgUrl: `${MCH_NUXT_BASE}/209.f0f01b9.webp` },
};

export const NORMAL_MATERIAL_IDS    = ["iron", "copper", "zinc"];
export const HIGH_TIER_MATERIAL_IDS = ["chromium", "titanium", "tungsten"];
export const LAND_MATERIAL_IDS      = [
  "aquamarine", "rhodochrosite", "topaz", "peridot", "onyx",
  "amethyst", "jade", "lapis", "garnet",
];

/** 全素材 id (normal + highTier + land の連結) */
export const ALL_MATERIAL_IDS = [
  ...NORMAL_MATERIAL_IDS,
  ...HIGH_TIER_MATERIAL_IDS,
  ...LAND_MATERIAL_IDS,
];

/** 初期在庫 (Phase 1B 仮置き) を生成する。
 *  Phase 1B では素材入手手段がまだ無いので、全種類同数で持たせて
 *  クラフトの足場として動かす。Phase 1C 以降でクエスト/ショップが
 *  実装されたら state.materials を 0 始まりに切替予定。
 *
 *  @param {number} qty  各素材の初期所持数 (default 10)
 */
export function buildInitialInventory(qty = 10) {
  const inv = {};
  for (const id of ALL_MATERIAL_IDS) inv[id] = qty;
  return inv;
}

/** 表示用名前を i18n を見て返す。lang === "en" なら nameEn、それ以外は nameJa。 */
export function materialName(id, lang) {
  const m = MATERIALS[id];
  if (!m) return id;
  return lang === "en" ? m.nameEn : m.nameJa;
}

export function materialIcon(id) {
  return MATERIALS[id]?.imgUrl || "";
}
