# 会社ホームページ（akitogroup.jp）

WordPress から置き換える、合同会社AKITOグループのホームページ。

## ページ

| ファイル | 中身 | WordPress のときのURL |
|---|---|---|
| `index` | トップ | `/` |
| `about` | 会社概要・代表挨拶・代表経歴 | `/about-company/` |
| `intervia` | インタビアAI | `/interview-copilot-ai/` |
| `consultation` | 無料相談会・イベント | `/無料相談・イベント/` |
| `news` / `news-*` | お知らせ・ブログ | `/blog-2/`、`/2025/...` |
| `contact` | お問い合わせフォーム | `/contact/` |

古いURLに来た人は、新しいページへ自動で転送される（`worker/index.js` の `OLD_URLS`）。

## 直し方

- 文章・配置：`src/pages/<ページ名>.html` を直して `python3 build.py`（`public/` に書き出される）
- ヘッダー・フッター：`src/layout.html`、各ページ下のお問い合わせ帯：`src/cta.html`
- 色・文字・共通の動き：`public/assets/site.css` の先頭（ロゴの赤・黄・緑・紫）
- 相談会の次回開催日（毎月第2・第4火曜日）は `public/assets/site.js` が自動で計算する
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

初回は Cloudflare の管理画面で Worker `akitogroup-site` にカスタムドメイン `akitogroup.jp`（と `www.akitogroup.jp`）を付ける。今の WordPress を向いている DNS の A / CNAME レコードは、そのとき置き換わる。アプリ（`interview-copilot-ai.akitogroup.jp`）と、メール（MX・SPF・DKIM）のレコードには触らないこと。
