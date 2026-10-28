# 会社ホームページ（akitogroup.jp）

WordPress から置き換える、合同会社AKITOグループのホームページ。

## ページ

| ファイル | 中身 | WordPress のときのURL |
|---|---|---|
| `index` | トップ | `/` |
| `about` | 会社概要・役員挨拶・代表経歴 | `/about-company/` |
| `gachicareer-ai` | ガチキャリAI（個人の面接練習・企業向け） | `/interview-copilot-ai/` |
| `posupos` | ポスポスの入口（昼のお店／夜のお店を選ぶ） | — |
| `posupos-day` / `posupos-night` | ポスポスのLP（昼のお店用・夜のお店用）。`src/posupos/lp.html` の1つのひな形から `build.py` が2ページを作る。料金は載せず、お問い合わせで案内する | — |
| （トップへ転送） | 無料相談会（終了） | `/無料相談・イベント/` |
| `news` / `news-*` | お知らせ・ブログ | `/blog-2/`、`/2025/...` |
| `contact` | お問い合わせフォーム | `/contact/` |

`/play/` は「待ち時間バトル」（ふたりでスマホ対戦するミニゲーム集）。`public/play/index.html` 1枚で完結していて `build.py` は触らない（サイトマップにも入れず、noindex）。

古いURLに来た人は、新しいページへ自動で転送される（`worker/index.js` の `OLD_URLS`）。

## 直し方

- 文章・配置：`src/pages/<ページ名>.html` を直して `python3 build.py`（`public/` に書き出される）
- ヘッダー・フッター：`src/layout.html`、各ページ下のお問い合わせ帯：`src/cta.html`
- 色・文字・共通の動き：`public/assets/site.css` の先頭（ロゴの赤・黄・緑・紫）
- ガチキャリ・ポスポス（会計システム）はトップの「事業内容」に書いている
- 画像：`public/assets/img/`（webp）
- 新しいお知らせ：`src/pages/news-xxx.html` を作り、`news.html` とトップの一覧にカードを足す

`public/*.html` は `build.py` が作るので、直接は直さない。

## お問い合わせフォーム

`/api/contact` に送られた内容を、Resend で info@akitogroup.jp に届ける（返信先はお客さんのメールアドレス）。

```bash
cd corporate-site
npx wrangler secret put RESEND_API_KEY   # アプリと同じ Resend のキーでよい
```

## 公開（Cloudflare）

```bash
cd corporate-site
python3 build.py
npx wrangler deploy
```

初回は Cloudflare の管理画面で Worker `akitogroup-site` にカスタムドメイン `akitogroup.jp`（と `www.akitogroup.jp`）を付ける。今の WordPress を向いている DNS の A / CNAME レコードは、そのとき置き換わる。アプリ（`gachicareer-ai.akitogroup.jp`、旧 `interview-copilot-ai.akitogroup.jp`）と、メール（MX・SPF・DKIM）のレコードには触らないこと。
