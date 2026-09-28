# CLAUDE.md

Interview Copilot AI（ガチキャリアAI）— AI面接練習・面接支援・書類選考の Web アプリ。
本番: https://interview-copilot-ai.akitogroup.jp

## スタック

- **フレームワーク**: TanStack Start（React 19 + TanStack Router のファイルベースルーティング、SSR）
- **実行環境**: Cloudflare Workers（`@cloudflare/vite-plugin`、設定は `wrangler.jsonc`）
- **DB / 認証**: Supabase（プロジェクト `lcqpihitxmqaygriuhao`）。スキーマは `supabase/migrations/`
- **UI**: Tailwind CSS v4 + shadcn/ui（`src/components/ui/`）
- **AI**: Anthropic（`@anthropic-ai/sdk`、会話・生成全般）、OpenAI（Whisper 文字起こし・TTS）。面接官アバターは外部サービスを使わない自前実装（`src/components/InterviewerAvatar.tsx`）。写真（`public/avatar/base.webp`）の顔に478点の網目（リグ `public/avatar/rig.json`）を入れて WebGL で変形させる。口は音声から母音（あいうえお）を判定した口の形（`src/lib/lipsync.ts`、再生は `src/lib/avatar-voice.ts`）に合わせ、参考動画から学習した「口を開けた・横に広げたときの顔全体の動き」で網目を動かす。首の傾き・位置は参考動画の動きの数値。口の中は `mouth-inside.webp`。まばたきは目のまわりだけを `eyes-closed.webp` に0.14秒で切り替える。リグは `scripts/avatar/build_rig.py` で作る。`/avatar-lab` は録音した声で口の動きを確かめる試作ページ
- **決済**: Stripe / **メール**: Resend

## 人材プロフィール（求人メディア型）

練習 → 評価 → プロフィール公開 → オファー の流れ。職業紹介にならないよう、運営は推薦・仲介をせず、料金は閲覧チケットだけ（成功報酬なし）。法務の下書きは `docs/legal/`。

- 評価：`save-interview.ts` が面接ごとに7つの力を1〜5で評価し、根拠として本人の発言を引用する。引用が実際の発言にないものは `src/lib/talent.ts` の `sanitizeCompetencies` で捨てる（根拠なしは評価しない）
- 人物まとめ：`refreshCandidateSummary`（点数は計算、文章だけAI）。練習後に `summary_stale` を立て、毎時の Cron で作り直す
- DB：`candidate_profiles`（初期値は非公開）/ `profile_unlocks`（チケット）/ `contact_requests` / `contact_messages`
- API：`src/routes/api/talent/*`。チケットは Stripe PaymentIntent を作り、支払い後にサーバーで確認して記録（Webhook の `payment_intent.succeeded` は保険）。値段は `wrangler.jsonc` の `TALENT_TICKET_PRICE_JPY`
- 画面：ユーザー `/private/individual/talent`・`/offers`、企業 `/business/company/talent`・`/messages`
- 練習の録画は本人が許可したときだけ、ブラウザから Storage へ直接アップロード（1人3本まで）
- 年齢・性別での絞り込みはしない。学校・塾／芸能の入口は隠している（`login.tsx` の `SHOW_SCHOOL_AND_ACTOR`）

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

- ESLint に既存の指摘が残っている（`no-explicit-any` が大半。全角スペースの `no-irregular-whitespace` と `react-hooks/exhaustive-deps` の警告は意図的なものが多い）
