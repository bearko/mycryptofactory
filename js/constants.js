export const ASSET_BASE = "https://raw.githubusercontent.com/bearko/mycryptoheroes/main/";
export const img = (path) => ASSET_BASE + path;
export const audioUrl = (relPath) => ASSET_BASE + relPath;

/** 選択可能ヒーロー一覧（data/heroes.json から runtime fetch）
 *  loadHeroes() を呼ぶまで HERO_ROSTER / HERO_DEFS は空。 */
export { HERO_DEFS, HERO_ROSTER, loadHeroes } from "./heroes.js";

/** リーダー基礎ステ。loadHeroes() 後に initLeader(HERO_ROSTER[0]) で初期化する。
 *  ヒーロー選択で setLeader() により書き換わる。
 *  export object reference は固定 (consumers が import 後に持ち続けても値は追従)。 */
export const LEADER = {};

/** ヒーローを選択して LEADER を更新する */
export function setLeader(hero) {
  // 既存キーをクリアしてから上書き (前ヒーローのフィールドが残らないように)
  for (const k of Object.keys(LEADER)) delete LEADER[k];
  Object.assign(LEADER, hero);
}

export const ENEMY_IMG = (id) => img("Image/Enemies/" + id + ".png");
export const EXT_IMG = (id) => img("Image/Extensions/" + id + ".png");
export const BATTLE_BG = (fileId) => img("Image/Backgrounds/" + fileId + ".png");

/** バトル用スプライトシート（Data/Effects/battle_effect_sprites.json と対応） */
export const BATTLE_EFFECT_SPRITE = {
  singleDamage: () => img("Image/Effects/Battle/01_single_damage.png"),
  areaDamage: () => img("Image/Effects/Battle/02_area_damage.png"),
  heal: () => img("Image/Effects/Battle/03_heal_resurrection.png"),
  buff: () => img("Image/Effects/Battle/04_buff.png"),
  debuff: () => img("Image/Effects/Battle/05_debuff_status_effect.png"),
};

/** cutins.json のジングル */
export const AUDIO_URLS = {
  bgmMap: () => audioUrl("Audio/BGM/pve.mp3"),
  bgmPvp: () => audioUrl("Audio/BGM/pvp.mp3"),
  seClear: () => audioUrl("Audio/SE/clear.wav"),
  seBattleSingleDamage: () => audioUrl("Audio/SE/Battle/1_single_damage.mp3"),
  seBattleAreaDamage: () => audioUrl("Audio/SE/Battle/2_area_damage.mp3"),
  seBattleHeal: () => audioUrl("Audio/SE/Battle/3_heal_resurrection.mp3"),
  seBattleBuff: () => audioUrl("Audio/SE/Battle/4_buff.mp3"),
  seBattleDebuff: () => audioUrl("Audio/SE/Battle/5_debuff_status_effect.mp3"),
  jingleWin: () => audioUrl("Audio/SE/Jingles/win.mp3"),
  jingleLose: () => audioUrl("Audio/SE/Jingles/lose.mp3"),
};
