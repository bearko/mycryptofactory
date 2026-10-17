# SPEC-002 — セーブ（月ごとの自動保存・つづきから）

| 項目 | 内容 |
|---|---|
| 状態 | Approved（作者の決定 2026-10-16・Issue #94、方式の確認 2026-10-17） |
| 関連 | Issue #94、SPEC-001（期限・クリア）、SPEC-003（RTA） |

## 1. 背景

期限が 8 年（時間が止まっている時間を除いて約 45 分）あり、一度に遊びきれない。いまは読み込み直すと最初からになる。

## 2. 決めたこと

| 項目 | 決定 |
|---|---|
| 方式 | **自動だけ**。月の初めごとに保存する（手動のセーブ・スロットは作らない） |
| 保存先 | localStorage の `mcf.save`（1 つだけ） |
| 版 | セーブに版（`v`）を入れる。読めない・版が違うセーブは**捨てて最初から** |
| タイトル | セーブがあれば「つづきから」と「はじめから」。はじめからはセーブを消す前に確認を挟む |

## 3. 仕様

### 3.1 何を保存するか

`state` をまるごと保存し、次のものだけ外す。

- 表示のための一時的なもの：`pauseFlags`・`notifications`・`spriteFloats`・`heroFlavors`・`popupHeroId`・`endgameStats`・`endgameScore`・`timeSpeed20x`
- 画面の途中の選択：`craftScreen`・`craftPickedExtId`・`craftPickedRemakeIdx`・`craftPickedCommissionId`・`firePendingId`・`pendingHireCandIdx`・`sellPickedIdx`・`heroReturnTo`

`Set`（`landPasses`・`unlockedExtIds`・`unlockedSeries`・`factoryLvPrompted`・`spontaneousGumHits`・`monthlyEventsFired`）は `{ "__set": [...] }` に直して保存し、読むときに `Set` に戻す。関数（ヒーローの `img`）は保存せず、読むときに `heroId` から付け直す。

### 3.2 純ロジック（`js/factory-save.js`）

DOM に触れない関数だけを置き、`tests/save.test.mjs` でテストする。localStorage は引数で受け取る（テストで差し替えるため）。

| 名前 | 中身 |
|---|---|
| `SAVE_KEY` / `SAVE_VERSION` | `"mcf.save"` / `1` |
| `encodeState(state)` | 3.1 の形に直した、JSON にできるオブジェクト |
| `decodeState(data, { reviveObject })` | `Set` に戻す。`reviveObject(obj)` は全オブジェクトに 1 回ずつ呼ぶ（`img` を付け直すため） |
| `writeSave(storage, state, now)` | `{ v, savedAt, state }` を書く。失敗（容量・プライベートモード）しても例外を出さず `false` |
| `readSave(storage)` | 読めれば `{ savedAt, state }`。ない・壊れている・版が違うときは `null`（壊れている・版が違うものは消す） |
| `clearSave(storage)` | 消す |
| `saveSummary(save)` | タイトルに出す `{ year, month, week, factoryLevel, cleared }` |

### 3.3 いつ保存するか

- 月の初め（`advanceWeek` で週が 1 に戻ったとき）・工房レベルアップ・クリアのときに「保存の予約」をする
- 予約は、次に時間が進んでいる tick（`onTick` の先頭。モーダルが開いていない）で、表示待ちのもの（`pendingCompletion`・`pendingAppraisal`・`pendingQuestResult`・`pendingContest`・`pendingSalaryReport`・`pendingMarcoPolo` と並行スロットの `pending*Extra`）が空のときに書く。空でなければ次の tick に回す（モーダルの途中を保存しない）
- ヒーローが 0 名でゲームオーバーになったら、セーブを消す（次は最初から）

### 3.4 読み込み

- 「つづきから」：既定の `state` の上にセーブを重ねる（あとから足した項目は既定値のまま）。モジュールの ID 採番（受注クラフト・出品）を、セーブの中の一番大きい ID の次から再開する。チュートリアルの既読もセーブのとおり
- 期限・節目・クリア・総合スコアの停止（SPEC-001）はセーブの値に従う
- RTA（SPEC-003）は読み込み直すと続かない（計測は「はじめから」で始めたその場かぎり）

### 3.5 タイトル画面

- セーブがないとき：いままでどおり、画面を押すと始まる
- セーブがあるとき：画面を押しても始まらず、ボタンを 2 つ出す
  - 「つづきから」（下に「2021 年 4 月 2 週・工房 Lv.3」、クリア済みなら「クリア済み」）
  - 「はじめから」→ 確認のダイアログ（「セーブを消して最初から始めます。よろしいですか？」「消して始める」「やめる」。`role="dialog"`・Esc で閉じる。`confirm()` は使わない）
- β の注記「リロードすると初期化されます」を「月の初めに自動で保存します」に直す

## 4. 受け入れ基準

- [ ] 月が変わったあとに読み込み直すと、「つづきから」でその月の初めから続く（GUM・ヒーロー・倉庫・Lv・解放済みのシリーズ・期限の進み）
- [ ] 版の違うセーブ・壊れたセーブは捨てられ、タイトルは「押して始める」だけになる
- [ ] 「はじめから」は確認のあと、セーブを消して最初から始まる。「やめる」で何も起きない
- [ ] localStorage が使えなくても遊べる（保存されないだけ）
- [ ] 読み込んだあとヒーローの画像が出る

## 5. テスト

- `node --test tests/save.test.mjs`：`Set` が戻る（入れ子も）・関数と一時的なキーを保存しない・版が違う／壊れた JSON は `null` で消える・`setItem` が例外を出しても `false`・`reviveObject` が全オブジェクトに呼ばれる・`saveSummary`
- ブラウザ：`?debug=1` で月をまたいで読み込み直し、「つづきから」で戻ること、「はじめから」の確認
