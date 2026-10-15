# 会社ホームページ（akitogroup.jp）

WordPress から置き換える、合同会社AKITOグループのホームページ。HTML 1枚（`public/index.html`）だけで動き、文章・配置・アニメーションはすべてこのファイルの中で直せる。

- 色・文字・余白：ファイル先頭の `:root { ... }`
- アニメーション：`@keyframes`（見出しが下から出る `rise`、蛍光ペン `swipe`、評価バー `grow`、流れる帯 `marquee`）と、スクロールで出てくる `.rv`
- 動きを減らす設定の端末では、アニメーションは止まる

## 確認

`public/index.html` をブラウザで開くだけで見られる。

## 公開（Cloudflare）

```bash
cd corporate-site
npx wrangler deploy
```

初回は Cloudflare の管理画面で Worker `akitogroup-site` にカスタムドメイン `akitogroup.jp`（と `www.akitogroup.jp`）を付ける。今の WordPress を向いている DNS の A / CNAME レコードは、そのとき置き換わる。アプリ（`interview-copilot-ai.akitogroup.jp`）の DNS には触らないこと。
