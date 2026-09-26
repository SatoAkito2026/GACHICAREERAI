# Interview Copilot AI（ガチキャリアAI）

AI面接練習・面接支援・書類選考の Web アプリ。TanStack Start + Cloudflare Workers + Supabase。

## セットアップ

```bash
npm install
cp .dev.vars.example .dev.vars  # サーバー側の秘密鍵を記入
npm run dev                     # http://localhost:8080
```

## デプロイ（Cloudflare Workers）

```bash
npx wrangler login
# 秘密鍵を登録（.dev.vars.example の各項目）
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put SIMLI_API_KEY
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put RESEND_API_KEY

npm run deploy
```

カスタムドメインは Cloudflare ダッシュボード → Workers → `gachicareerai` → Settings → Domains & Routes で設定。
ドメイン切り替え後は Stripe の Webhook URL（`/api/stripe-webhook`）と Supabase Auth の Redirect URLs も確認すること。

開発ガイドは [CLAUDE.md](./CLAUDE.md) を参照。
