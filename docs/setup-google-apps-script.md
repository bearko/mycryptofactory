# MyCryptoFactory ランキング機能 セットアップ手順

> **エンドユーザーの方へ**: 通常はこの手順は **不要** です。本ゲームには既定のランキング API URL が組み込まれており、起動するだけでランキング機能を利用できます。本手順は **独自のランキングサーバーを立てたい開発者向け / 配布者向け** です。

MyCryptoFactory のランキング機能を独自サーバーで動かしたい場合、または公式 URL を初回設定する場合の手順。所要時間 10 分程度。

## 概要

ランキング機能は **Google Spreadsheet + Google Apps Script (GAS) ウェブアプリ** で実装されています。設計は MyCryptoTactics と同様で、payload schema のみ MCF 用に拡張。

| 役割 | 担当 |
|---|---|
| スコア保存先 | Google Spreadsheet |
| スコア送信 / 取得 API | GAS ウェブアプリ |
| ゲーム側 | `js/factory-ranking-client.js` (POST/GET) |

### スコア計算式 (Phase 1D-26)

```
base       = state.gum
craftMult  = 1 + craftCount / 50           (例: 25 craft → 1.5x)
hireMult   = 1 + max(0, 20 - hireCount) / 20  (少ない雇用ほど高倍率)
factoryMult= 1 + (factoryLevel - 1) * 0.5     (Lv 5 → 3.0x)
appraisalMult = 1 + (best Common 査定 score) / 50  (50 点満点 → 2.0x)

score = round(base × craftMult × hireMult × factoryMult × appraisalMult)
```

10 年エンディング時に `gatherFactoryStats` がこれらを集計し、ランキング登録モーダルに送られます。

## ステップ 1: Spreadsheet を作成

1. [Google Drive](https://drive.google.com/) で「新規」→「Google スプレッドシート」を選択
2. シート名を `MCF Ranking` 等わかりやすい名前に
3. シート 1 の名前を `ranking` に変更（左下のタブをダブルクリック）
4. 1 行目にヘッダーを入力（GAS が自動投入するため省略可）:

| A: timestamp | B: playerName | C: score | D: gum | E: factoryLevel | F: craftCount | G: hireCount | H: saleCount | I: appraisalBest | J: yearWeek | K: version |
|---|---|---|---|---|---|---|---|---|---|---|

## ステップ 2: GAS スクリプトを設定

1. Spreadsheet メニューから「拡張機能」→「Apps Script」を開く
2. デフォルトの `Code.gs` の内容を全削除し、以下に置き換える:

```javascript
const SHEET_NAME = "ranking";
const HEADERS = [
  "timestamp", "playerName", "score", "gum",
  "factoryLevel", "craftCount", "hireCount", "saleCount",
  "appraisalBest", "yearWeek", "version",
];

/**
 * ranking シートを取得 / 自動生成。シートが無ければ作成し、ヘッダー行も投入する。
 */
function _ensureSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  const firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const headerMissing = firstRow.every((v) => v === "" || v === null);
  if (headerMissing) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = _ensureSheet();
    sheet.appendRow([
      new Date(),
      String(data.playerName || "anonymous").substring(0, 30),
      Number(data.score) || 0,
      Number(data.gum) || 0,
      Number(data.factoryLevel) || 1,
      Number(data.craftCount) || 0,
      Number(data.hireCount) || 0,
      Number(data.saleCount) || 0,
      Number(data.appraisalBest) || 0,
      String(data.yearWeek || ""),
      String(data.version || ""),
    ]);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    const sheet = _ensureSheet();
    const allRows = sheet.getDataRange().getValues();
    const rows = allRows.length > 1 ? allRows.slice(1) : []; // skip header
    let filtered = rows;
    // バージョンフィルタ (任意): ?version=1D-26
    const versionFilter = e.parameter.version;
    if (versionFilter) {
      filtered = filtered.filter(r => String(r[10]) === versionFilter);
    }
    filtered.sort((a, b) => Number(b[2]) - Number(a[2])); // by score desc
    const limit = Math.min(Number(e.parameter.limit) || 50, 200);
    const top = filtered.slice(0, limit).map((r, idx) => ({
      rank: idx + 1,
      timestamp: r[0],
      playerName: String(r[1]),
      score: Number(r[2]),
      gum: Number(r[3]),
      factoryLevel: Number(r[4]),
      craftCount: Number(r[5]),
      hireCount: Number(r[6]),
      saleCount: Number(r[7]),
      appraisalBest: Number(r[8]),
      yearWeek: String(r[9]),
      version: String(r[10]),
    }));
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, ranking: top }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * ダミーデータ投入（任意）。GAS エディタで実行ボタンから手動実行する。
 * 既存のランキングが空のときに、UI 動作確認用として 12 件を投入する。
 * 何度実行しても重複追加されるので、必要に応じて追加実行 / シート手動クリア。
 */
function seedDummyData() {
  const sheet = _ensureSheet();
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  // [playerName, score, gum, factoryLevel, craftCount, hireCount, saleCount, appraisalBest, yearWeek]
  // 注: 数値リテラルに `_` (numeric separator, ES2021) を使うと Apps Script
  //     V8 ランタイムでパースエラーになるため避ける。 4_800_000 ではなく
  //     4800000 のように区切り無しで書く。
  const samples = [
    ["MasterArtisan", 4800000, 800000,  5, 80, 12, 70, 48, "2028-12-1"],
    ["bearko",        3500000, 600000,  5, 65, 10, 55, 45, "2028-11-4"],
    ["GuildMaster",   2900000, 520000,  4, 60, 14, 48, 42, "2028-10-3"],
    ["CraftLord",     2400000, 460000,  4, 55, 16, 40, 40, "2028-09-2"],
    ["WorkshopOwner", 1950000, 380000,  4, 50, 18, 35, 38, "2028-08-1"],
    ["ApprenticeHero",1500000, 300000,  3, 42, 20, 28, 35, "2028-07-1"],
    ["NoviceArtisan", 1100000, 230000,  3, 35, 15, 22, 32, "2028-06-1"],
    ["RookieMaker",    800000, 180000,  2, 28, 12, 18, 28, "2028-05-1"],
    ["FirstYearBoss",  620000, 150000,  2, 22, 10, 14, 26, "2028-04-1"],
    ["SmallShop",      450000, 120000,  2, 18,  8, 11, 22, "2028-03-1"],
    ["Beginner",       280000,  85000,  1, 12,  6,  8, 18, "2028-02-1"],
    ["FreshStart",     150000,  50000,  1,  8,  4,  5, 14, "2028-01-1"],
  ];
  samples.forEach((s, i) => {
    const ts = new Date(now - (samples.length - i) * day);
    sheet.appendRow([
      ts, s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], s[8], "1D-26-seed",
    ]);
  });
  Logger.log("Seeded " + samples.length + " dummy rows.");
}
```

3. 「保存」（Ctrl+S）

## ステップ 3: ウェブアプリとしてデプロイ

1. 右上の「デプロイ」→「新しいデプロイ」を選択
2. 種類: 「ウェブアプリ」（歯車から選択）
3. 設定:
   - **説明**: MCF Ranking API
   - **次のユーザーとして実行**: 自分（あなた）
   - **アクセスできるユーザー**: **全員**（重要！匿名アクセス許可）
4. 「デプロイ」をクリック
5. Google アカウント認証ダイアログが出たら許可
6. 表示される「ウェブアプリの URL」をコピー（`https://script.google.com/macros/s/.../exec` 形式）

## ステップ 4: ゲーム側に URL を登録

### 利用者として URL を登録する場合

1. ゲームを起動
2. タイトル画面の「🏆 ランキング」ボタン → ランキング画面を開く
3. 画面下部の「**上級設定: 別のランキングサーバーを使う**」を展開
4. 「Apps Script URL」欄に上記 URL を貼り付け → 「保存」をクリック

ブラウザの localStorage (`mcf.rankingApiUrl`) に保存され、以後そのカスタム URL が使われます。空欄で「保存」を押すと既定 URL に戻ります。

### 配布者として既定 URL を埋め込む場合（フォーク開発者向け）

`js/factory-ranking-client.js` 内の `_DEFAULT_API_URL_ENC` 定数（base64 エンコード済み）を書き換えます:

```js
// ブラウザコンソールで生成
btoa("https://script.google.com/macros/s/<YOUR_SCRIPT_ID>/exec");
```

得られた文字列を `_DEFAULT_API_URL_ENC` に貼り付けてコミット。

> **セキュリティ注記**: クライアント側 JS に URL を埋め込んでも、ブラウザの DevTools / Network タブで容易に観察可能です。base64 エンコードはあくまで「ソースを casual に眺めただけでは見えない」程度の難読化であり、機密情報としては扱えません。本機能の URL は誰でも POST 可能な公開エンドポイントである前提で運用してください。

## 動作確認

1. ランキング画面を開く → 「ランキング取得」 → 空のリストが表示されれば API は動作中
2. 10 年エンディング到達時のスコア送信モーダルからテスト送信
3. 再度ランキング画面を開いて自分のスコアが先頭に来ていれば成功

## ダミーデータの投入（テスト用）

ランキング機能の UI 動作確認のため、12 件のダミーデータを投入できます:

1. GAS エディタで関数選択ドロップダウンから **`seedDummyData`** を選択
2. 「実行」ボタン（▶）をクリック
3. 初回実行時は権限承認ダイアログが出るので許可

完了後、Spreadsheet の `ranking` シートに 12 行のダミーデータが追加されます。ゲーム側のランキング画面でも反映を確認できます。

不要になったらシートの行を手動削除してください。

## トラブルシュート

### `TypeError: Cannot read properties of null (reading 'getDataRange')`

旧バージョンの GAS コードでは `ranking` という名前のシートが存在しない場合に出るエラー。**新バージョンの GAS コード（`_ensureSheet()` を含む）に置き換えてください**。

新コードはシートが無ければ自動で作成し、ヘッダー行も投入します。Spreadsheet 側で事前にシート作成や列ヘッダーを準備する必要はありません。

### `HTTP 401` エラー
- デプロイ時の「アクセスできるユーザー」が「全員」になっていない可能性
- デプロイをやり直してアクセス権限を確認

### `HTTP 302` リダイレクト
- ウェブアプリの URL が古い可能性。再デプロイで新 URL を取得

### CORS エラー
- GAS は通常 CORS を許可するが、ブラウザのセキュリティ設定で弾かれる場合あり
- `Content-Type: text/plain` で送信しているので preflight は発生しないはず
- それでも問題があれば、別ブラウザ／別端末で試す

### 名前は登録されたがランキングに表示されない
- スコア計算結果が極端に低く 50 位以下の可能性
- バージョンフィルタで弾かれた可能性 (= ランキング画面の `?version=` パラメータと送信時の version が一致しているか確認)

## Spreadsheet を公開して誰でも閲覧可能にする（オプション）

1. Spreadsheet 右上「共有」→「リンクを取得」
2. 「リンクを知っている全員」→「閲覧者」
3. 公開リンクを SNS 等で共有可能

## デプロイ更新（コード変更時）

GAS のコードを変更した場合:
1. 「デプロイ」→「デプロイを管理」→ 既存のデプロイの編集アイコン
2. バージョン: 「新しいバージョン」を選択
3. 「デプロイ」

URL は変わらないので、ゲーム側の設定変更は不要です。

## 不正対策について

クライアント送信型のため、スコアは技術的には偽装可能です。本ランキングは「カジュアルランキング」として位置づけ、対策はしていません。コミュニティで明らかな不正が問題化した場合は、GAS の `doPost` に異常値フィルタを追加することで対応可能です。

例:
```javascript
if (data.score > 100_000_000) return /* reject */;
if (data.craftCount < 1) return /* reject */;
if (data.factoryLevel < 1 || data.factoryLevel > 5) return /* reject */;
```
