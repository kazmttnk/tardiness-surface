# 遅刻記録システム - Surface版

Surface + USBバーコードリーダー用の高速遅刻記録システム

## 特徴

- ✅ **超高速**：生徒検索 0.01秒、1人あたり1〜2秒で記録完了
- ✅ **バーコードリーダー対応**：スキャンするだけで自動検索
- ✅ **キーボードショートカット**：数字キー1〜9で理由選択、Enterで保存
- ✅ **確実な保存**：IndexedDBで即座にローカル保存、ブラウザを閉じてもデータ消失なし
- ✅ **バックグラウンド同期**：非同期でGoogle Sheetsに保存、待ち時間ゼロ
- ✅ **オフライン対応**：ネット接続なしでも記録可能、後で自動同期

---

## セットアップ手順

### 1. Apps Script の準備

既存の `コード.gs` に以下の関数を追加：

```javascript
// ─── 生徒マスター全データを取得（新規追加） ───
function getStudentMaster() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const studentSheet = ss.getSheetByName('生徒マスター');
    
    if (!studentSheet) {
      return { success: false, error: '生徒マスターシートが見つかりません' };
    }
    
    const data = studentSheet.getDataRange().getValues();
    
    return { success: true, data: data };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}
```

`handleAPIRequest` 関数に以下を追加：

```javascript
case 'getStudentMaster':
  result = getStudentMaster();
  break;
```

**保存して再デプロイ**（新バージョン）

---

### 2. config.js の設定

`config.js` の `API_URL` を実際のデプロイURLに変更：

```javascript
const API_URL = 'https://script.google.com/macros/s/YOUR_ACTUAL_SCRIPT_ID/exec';
```

---

### 3. GitHub にアップロード

以下のファイルを GitHub リポジトリにアップロード：

- index.html
- styles.css
- app.js
- db.js
- config.js
- manifest.json
- service-worker.js
- README.md

---

### 4. GitHub Pages 有効化

1. リポジトリの Settings → Pages
2. Source: `main` / `/ (root)`
3. Save

数分後、URLが表示されます：
```
https://YOUR_USERNAME.github.io/tardiness-surface/
```

---

### 5. Surface でアクセス

1. Chrome で GitHub Pages の URL を開く
2. 動作確認
3. **ホーム画面に追加**：
   - アドレスバーの右側の「インストール」アイコンをクリック
   - 「インストール」をクリック
   - デスクトップアプリのように使える

---

## 使い方

### 基本操作（バーコードリーダー）

1. **バーコードをスキャン**
   - 自動的に生徒情報が表示される
   
2. **遅刻理由を選択**
   - タッチで選択、または数字キー 1〜9
   
3. **Enter キーで保存**
   - 即座にローカル保存
   - バックグラウンドで Google Sheets に送信
   
4. **次の生徒をスキャン**
   - 自動的に入力欄がクリアされ、次の入力待機

### キーボードショートカット

| キー | 動作 |
|---|---|
| 1〜9 | 遅刻理由を選択 |
| Enter | 記録を保存 |
| Esc | キャンセル・リセット |

### バーコードリーダー設定

**BUSICOM BC-NL3000U II の推奨設定：**

1. **Enter キー送信を有効化**
   - バーコード読み取り後、自動的に Enter を送信
   - 取扱説明書の設定用バーコードをスキャン

2. **プレフィックス/サフィックスなし**
   - 読み取った数字のみを送信

---

## データの流れ

```
1. バーコードスキャン
   ↓
2. メモリ内検索（0.01秒）
   ↓
3. 理由選択・保存
   ↓
4. IndexedDB に即座保存（0.01秒）
   ↓
5. 画面に表示
   ↓
6. バックグラウンドで Apps Script に送信（非同期）
   ↓
7. Google Sheets に保存
   ↓
8. 送信成功 → IndexedDB から削除
```

---

## トラブルシューティング

### 生徒マスターが読み込まれない

- ブラウザのコンソールでエラー確認
- `localStorage` をクリア：
  - Chrome → F12 → Application → Local Storage → 削除

### 未送信データが残る

- 画面上部の「未送信: X件」をクリック
- または：F12 → Application → IndexedDB → TardinessDB を確認

### バーコードリーダーが反応しない

- USB接続を確認
- Enter キー送信が有効か確認
- メモ帳などでテスト

### 同期エラー

- Apps Script の URL が正しいか確認
- トークンが一致しているか確認
- ネット接続を確認

---

## パフォーマンス

| 項目 | 速度 |
|---|---|
| 生徒検索 | 0.01秒 |
| ローカル保存 | 0.01秒 |
| 1人あたり処理時間 | 1〜2秒 |
| 100人の処理時間 | 2〜3分 |

---

## 技術仕様

- **フロントエンド**: Vanilla JavaScript
- **ローカルDB**: IndexedDB
- **バックエンド**: Google Apps Script
- **データベース**: Google Sheets
- **PWA**: Service Worker + Manifest
- **同期**: バックグラウンド非同期

---

## ライセンス

学校内部用システム
