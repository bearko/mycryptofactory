# bearko.games 共通基盤の総合スコア

bearko.games の総合スコア（[bearko/mycryptoportfolio の SPEC-002](https://github.com/bearko/mycryptoportfolio/blob/claude/game-portfolio-page-4afqbc/docs/specs/SPEC-002-total-score.md) 3.9）に参加する。作者の決定（2026-10-16）で、**Lv 5 到達までの所要時間・設備（工房 Lv と同じ扱い）・クエスト攻略数・エクステンションの製作数と内訳** で測る。

| 送る成績 | 中身 | どこで増える |
|---|---|---|
| `factoryLevel` | 工房 Lv（1〜5） | 工房レベルアップ |
| `weeksToLv5` | Lv 5 に着くまでの週数（ゲーム開始の 2018 年 12 月 1 週から） | Lv 5 になったとき 1 回だけ記録（`state.lv5Weeks`） |
| `questsCleared` | 攻略したクエストの数（新設 `state.questClearCount`） | クエスト成功 |
| `crafted` | 作ったエクステンションのレアリティごとの数（新設 `state.craftedByRarity`。打ち直しは昇格後の rarity） | クラフト完了 |

- 点の計算は共通基盤：工房 Lv の節目（Lv 2 ＝ 1,000 〜 Lv 5 ＝ 5,000）＋ 2,000 × 156 ÷ Lv 5 までの週数 ＋ クエスト × 20 ＋ クラフト × レアリティの重み（Common 10 〜 Legendary 160）
- 工房 Lv が上がったときはすぐ送って自己ベストの通知を出す。クラフト・クエストは通知なしで 1 分に 1 回までにまとめる（`js/platform.js`）
- SDK（`https://bearko.games/sdk/v1.js`）が読めない・通信に失敗しても何もしない。ゲームの進行・pauseTime には触らない
- いまのゲームはセーブがないので、読み込み直すと最初から。共通基盤には自己ベストが残る
- テスト：`node --test tests/platform.test.mjs`
