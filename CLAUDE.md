# CLAUDE.md

Interview Copilot AI（ガチキャリアAI）— AI面接練習・面接支援・書類選考の Web アプリ。
本番: https://interview-copilot-ai.akitogroup.jp

## スタック

- **フレームワーク**: TanStack Start（React 19 + TanStack Router のファイルベースルーティング、SSR）
- **実行環境**: Cloudflare Workers（`@cloudflare/vite-plugin`、設定は `wrangler.jsonc`）
- **DB / 認証**: Supabase（プロジェクト `lcqpihitxmqaygriuhao`）。スキーマは `supabase/migrations/`
- **UI**: Tailwind CSS v4 + shadcn/ui（`src/components/ui/`）
- **AI**: Anthropic（`@anthropic-ai/sdk`、会話・生成全般）、OpenAI（Whisper 文字起こし・TTS）。面接官アバターは写真（`public/avatar/interviewer.webp`、AI生成画像）を WebGL で動かす自前実装（`src/components/InterviewerAvatar.tsx`、口パク用の音声解析は `src/lib/avatar-voice.ts`）。写真を差し替えるときは同ファイルの `FACE`（目・口・あごの座標）も合わせる
- **決済**: Stripe / **メール**: Resend

## コマンド

```bash
npm install
npm run dev        # http://localhost:8080 （workerd 上で SSR が動く）
npm run build      # dist/ に出力
npm run typecheck
npm run lint
npm run deploy     # build + wrangler deploy
```

## ディレクトリ

- `src/routes/` — ページとAPI。ファイル名がそのままURLになる
  - `api/*.ts` — サーバー専用APIルート（`server.handlers` で POST などを定義）
  - `private/individual|student/` — 個人・学生向けマイページ
  - `business/company|school|actor/` — 法人向け（企業・学校・芸能）
  - `interview/$token.tsx`, `actor-interview/$token.tsx`, `chat-interview/$token.tsx` — 招待トークンで入る面接画面
- `src/routeTree.gen.ts` — **自動生成**。手で編集しない（dev/build で再生成される）
- `src/server.ts` — Worker エントリ。SSR エラーラッパー + Cron（毎時）の `scheduled` ハンドラ
- `src/lib/api-auth.ts` — APIの認証（`verifyApiUser`）、Supabase 接続情報、プラン別の利用上限チェック
- `src/integrations/supabase/` — Supabase クライアントと DB 型（`types.ts`）

## 実装ルール

- **秘密鍵はサーバー側だけで使う**。APIルート内で `process.env.XXX` から読む。ブラウザに出るコード（ページ・コンポーネント）に API キーを書かない
- ブラウザに渡してよい値は `VITE_` プレフィックス付き（`.env.production` / `.env.development`）のみ
- ログインユーザー向けAPIは `verifyApiUser(request)` でトークン検証してから処理する
- 招待トークン系API（面接画面から呼ばれるもの）は `interview_invitations` でトークンの有効性・期限を確認する
- DB 操作はサーバー側で `createClient(getSupabaseUrl(), getServiceRoleKey())`（RLSをバイパスするので、必ずユーザーIDで絞り込む）
- DB スキーマ変更は `supabase/migrations/` に SQL を追加し、`src/integrations/supabase/types.ts` も更新する
- UIテキストは日本語

## 環境変数

| 名前 | 用途 | 置き場所 |
|---|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PROJECT_ID` | ブラウザ用（ビルド時に埋め込み） | `.env.production` / `.env.development`（コミット済み） |
| `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `APP_URL` | サーバー用の公開値 | `wrangler.jsonc` の `vars` |
| `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY` | 秘密鍵 | ローカル: `.dev.vars` / 本番: `wrangler secret put` |

テンプレート: `.env.example`, `.dev.vars.example`

## 既知の課題

- `src/routes/business/company/candidates.tsx` の「録画を見る（購入）」リンク先 `/business/company/candidate-detail/$interviewId` のページが存在しない（typecheck エラーになる）
- ESLint に既存の警告・エラーが残っている（`no-explicit-any` が大半。`react-hooks/rules-of-hooks` 違反も数件あり）
