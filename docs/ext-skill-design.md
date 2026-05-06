# エクステンション スキル設計 (Phase 2A 製品版)

クラフトしたエクステンションに「シリーズ共通スキル」を付与し、複数のエクステを倉庫に蓄えることで非デュエルモード (クラフト / クエスト / 雇用 / 取引) が有利になる仕組み。

## 用語

- **カテゴリ (category)**: 4 系統 (HP / PHY / INT / AGI)。ext.params の最大値で決まる
- **アーキタイプ (archetype)**: シリーズが属する「効果セット」。例: `phy-quest-lv` (クエスト Lv ブースト寄り) / `phy-mat-yield` (素材獲得寄り)
- **効果 (effect)**: 個別の効果ユニット。例: `questLvBoost` / `craftLvBoost` など

## カテゴリ判定

```
adjusted = { hp: hp × (1/6), phy, int, agi }
category = argmax(adjusted)
```

実データ (956 ext / 178 series):
| カテゴリ | シリーズ数 | 例 |
|---|---|---|
| HP / garuda | 8 | アーマー、ブーツ、エレファント、モアイ、アクアリウム、マンドラゴラ、サモンボード、バイナンスチャリティメダル |
| PHY / ifrit | 83 | ブレード、カタナ、シールド、アックス、ハルバード、… |
| INT / leviathan | 60 | マスケット、ペン、ブック、リング、スクロール、… |
| AGI / tiamat | 27 | ホース、ネックレス、ナイフ、ヴァイオリン、… |

## アーキタイプ (= シリーズの「効果プロファイル」)

シリーズ数が多い PHY/INT/AGI は複数アーキタイプを用意して多様性を確保。HP は 2 アーキタイプ程度。

### HP / garuda (8 series)
| Archetype | 効果 | 配属シリーズ |
|---|---|---|
| `hp-stamina` | 体力減少速度 -X% (= 編成時間が伸びる) | アーマー / ブーツ / マンドラゴラ / モアイ |
| `hp-rest` | 休憩時間 -X% (= 復帰が早い) + 体力減少 -小 | エレファント / アクアリウム / サモンボード / バイナンスチャリティメダル |

### PHY / ifrit (83 series → 5 archetype に分散)
| Archetype | 効果 | 想定 |
|---|---|---|
| `phy-quest-lv` | クエスト Lv +X% | 17-18 series |
| `phy-mat-yield` | 素材獲得量 +X% | 17-18 series |
| `phy-recipe` | 新規レシピ獲得率 +X% | 16-17 series |
| `phy-rare-mat` | レア素材獲得率 +X% (Rare 以上で発動) | 16-17 series |
| `phy-mixed` | 全 PHY 効果を弱め (= 万能) | 16 series |

### INT / leviathan (60 series → 3 archetype に分散)
| Archetype | 効果 | 想定 |
|---|---|---|
| `int-craft-lv` | クラフト Lv +X% | 20 series |
| `int-mat-cost` | 要求素材量 -X% | 20 series |
| `int-mixed` | 両効果を弱め | 20 series |

### AGI / tiamat (27 series → 4 archetype に分散)
| Archetype | 効果 | 想定 |
|---|---|---|
| `agi-hire-speed` | 採用スピード +X% | 7 series |
| `agi-hire-rare` | 高レア採用率 +X% | 7 series |
| `agi-trade-price` | 取引金額 +X% | 7 series |
| `agi-trade-speed` | 取引成立スピード +X% | 6 series |

## レアリティスケール

各効果値は base × rarity multiplier:
- Common 1.0
- Uncommon 1.4
- Rare 2.0
- Epic 3.0
- Legendary 4.5

加えて Rare 以上では **追加効果** が解放されるパターンも (例: `phy-rare-mat` は Common/Uncommon は通常素材ボーナスで、Rare 以上でレア素材ボーナス)。

## 効果集計 (= スタッキング)

倉庫の全 ext から効果を集計。 同種効果は **平方根スタッキング** で頭打ちを設ける:

```
effective(N items each contributing v) ≈ Σ(v_i × 1 / sqrt(rank_i))
```

ここで `rank_i` は同種効果内でソートしたときの順位 (1, 2, 3, ...)。
最大値はそのまま、2 位以降は徐々に弱める。

例: `questLvBoost` を持つ ext が 5 個あり、それぞれ 8% / 6% / 5% / 4% / 3%:
- effective = 8 + 6/√2 + 5/√3 + 4/√4 + 3/√5
- ≈ 8 + 4.24 + 2.89 + 2.0 + 1.34 = **18.5%**

これにより「同じシリーズを 10 個ストックすれば OP」 を防ぎ、 **シリーズ多様性に報酬** を与える。

## 各効果の wire 先 (game-loop hook)

| 効果 ID | hook | 数式 |
|---|---|---|
| `staminaDecaySlow` | `tickActiveCraft` / `tickActiveQuest` の `staminaDecayPerTick` | `decay × (1 - X%)` |
| `restTimeShort` | `staminaRecoverPerTick` の倍率 | `recover × (1 + X%)` |
| `questLvBoost` | `startActiveQuest` の `teamLv` 計算 | `teamLv × (1 + X%)` |
| `matYieldBoost` | `rollQuestRewards` の各 drop qty | `qty × (1 + X%)` (round) |
| `recipeRateBoost` | `triggerQuestComplete` の 12% recipe チャンス | `0.12 × (1 + X%)` |
| `rareMatBoost` | `rollQuestRewards` の highTier proc 確率 | `prob × (1 + X%)` |
| `craftLvBoost` | `tickActiveCraft` の `totalCraftLv` | `totalCraftLv × (1 + X%)` |
| `matCostReduce` | `recipeFor` の qty | `qty × (1 - X%)` (ceil 1+) |
| `hireSpeedBoost` | `tickActiveHire` 内の進行 | `progress × (1 + X%)` |
| `hireRareBoost` | `rollHireCandidates` の rarity 抽選重み | rare 以上の重みを (1 + X%) |
| `tradePriceBoost` | `estimateSalePrice` の最終価格 | `gross × (1 + X%)` |
| `tradeSpeedBoost` | sale tick の進行 | 同様 |

## 効果値の base 範囲 (Common 基準)

各効果が単独でかかった場合の Common 基準値:

| 効果 | Common 基準 | Legendary (= ×4.5) |
|---|---|---|
| `staminaDecaySlow` | 4% | 18% |
| `restTimeShort` | 4% | 18% |
| `questLvBoost` | 3% | 13.5% |
| `matYieldBoost` | 5% | 22.5% |
| `recipeRateBoost` | 8% | 36% |
| `rareMatBoost` | 6% | 27% |
| `craftLvBoost` | 4% | 18% |
| `matCostReduce` | 3% | 13.5% |
| `hireSpeedBoost` | 5% | 22.5% |
| `hireRareBoost` | 3% | 13.5% |
| `tradePriceBoost` | 4% | 18% |
| `tradeSpeedBoost` | 5% | 22.5% |

これらは **シミュレーションで初期値**。後続 PR でバランス調整する。

## アーキタイプ → 効果マッピング (全 14 archetype)

各アーキタイプは 1〜3 効果の組み合わせ:

| Archetype | 効果 |
|---|---|
| `hp-stamina` | staminaDecaySlow |
| `hp-rest` | restTimeShort + staminaDecaySlow (弱) |
| `phy-quest-lv` | questLvBoost |
| `phy-mat-yield` | matYieldBoost |
| `phy-recipe` | recipeRateBoost |
| `phy-rare-mat` | rareMatBoost |
| `phy-mixed` | questLvBoost (弱) + matYieldBoost (弱) |
| `int-craft-lv` | craftLvBoost |
| `int-mat-cost` | matCostReduce |
| `int-mixed` | craftLvBoost (弱) + matCostReduce (弱) |
| `agi-hire-speed` | hireSpeedBoost |
| `agi-hire-rare` | hireRareBoost |
| `agi-trade-price` | tradePriceBoost |
| `agi-trade-speed` | tradeSpeedBoost |

## シリーズ → アーキタイプ割当

`SERIES_ARCHETYPE_MAP` (= 静的なマップ) を `js/factory-ext-skill.js` 内で定義。 178 シリーズすべてを手動で割り当て、 後続 PR でバランス調整する。

## UI 表示

- **倉庫リスト**: 各アイテムにスキル一行 (= 効果の短縮表現)
- **クラフト完成画面**: 完成 ext のスキルを大きく表示
- **クラフト確認画面**: 完成見込みのスキルをプレビュー
- **打ち直し確認画面**: before / after でスキル比較
- **レシピ獲得画面**: 解放したシリーズの代表スキル
- **アクティブ効果パネル** (新規): 現在倉庫から発動中の合計効果一覧 (= プレイヤー向け透明性)

## 実装フェーズ

- **PR-P1 (= 本 PR)**: 設計 doc + resolver + シリーズマップ全 178 + 4 効果 wire (questLv / craftLv / staminaDecay / hireSpeed) + 倉庫表示 + 完成画面表示 + sim スクリプト  
- **PR-P2**: 残り 8 効果 wire + 全画面表示 + シミュレーションでバランス調整
- **PR-P3**: 打ち直し前後比較 + アクティブ効果パネル + edge-case 整理

## デュエル機能との関係

デュエルではエクステを「ヒーローに装備」して効果発動 (別モード)。 本仕様の効果は デュエル外 (craft/quest/hire/trade) のみ。 `applicableInDuel: false` を全 effect に持たせて分岐可能にしておく。
