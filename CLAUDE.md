# CLAUDE.md

Interview Copilot AI（ガチキャリアAI）— AI面接練習・面接支援・書類選考の Web アプリ。
本番: https://gachicareer-ai.akitogroup.jp（旧URL interview-copilot-ai.akitogroup.jp は `src/server.ts` で新URLへ転送。`/api/` は転送せず旧URLでも動く）

## スタック

- **フレームワーク**: TanStack Start（React 19 + TanStack Router のファイルベースルーティング、SSR）
- **実行環境**: Cloudflare Workers（`@cloudflare/vite-plugin`、設定は `wrangler.jsonc`）
- **DB / 認証**: Supabase（プロジェクト `lcqpihitxmqaygriuhao`）。スキーマは `supabase/migrations/`
- **UI**: Tailwind CSS v4（画面部品は各コンポーネントに直接書く。通知は `sonner`（`src/components/ui/sonner.tsx`）、グラフは `recharts`、アイコンは `lucide-react`）
- **AI**: Anthropic（`@anthropic-ai/sdk`、会話・生成全般）、OpenAI（Whisper 文字起こし・TTS）。面接官アバターは外部サービスを使わない自前実装（`src/components/InterviewerAvatar.tsx`）。写真（`public/avatar/base.webp`）の顔に478点の網目（リグ `public/avatar/rig.json`）を入れて WebGL で変形させる。口は音声から母音（あいうえお）を判定した口の形（`src/lib/lipsync.ts`、再生は `src/lib/avatar-voice.ts`）に合わせ、参考動画から学習した「口を開けた・横に広げたときの顔全体の動き」で網目を動かす。首の傾き・位置は参考動画の動きの数値。口の中は `mouth-inside.webp`。まばたきは目のまわりだけを `eyes-closed.webp` に0.14秒で切り替える。リグは `scripts/avatar/build_rig.py` で作る。`/avatar-lab` は録音した声で口の動きを確かめる試作ページ
- **決済**: Stripe / **メール**: Resend

## 人材プロフィール（求人メディア型）

練習 → 評価 → プロフィール公開 → オファー の流れ。職業紹介にならないよう、運営は推薦・仲介をせず、料金は閲覧のコインとAI面接の従量課金だけ（成功報酬なし）。法務の下書きは `docs/legal/`。

- 評価：`save-interview.ts` が面接ごとに7つの力を1〜5で評価し、根拠として本人の発言を引用する。引用が実際の発言にないものは `src/lib/talent.ts` の `sanitizeCompetencies` で捨てる（根拠なしは評価しない）
- 人物まとめ：`refreshCandidateSummary`（点数は計算、文章だけAI）。練習後に `summary_stale` を立て、毎時の Cron で作り直す
- DB：`candidate_profiles`（初期値は非公開）/ `profile_unlocks`（閲覧権）/ `contact_requests` / `contact_messages` / `coin_lots`（企業のコイン）/ `point_ledger`（本人のポイント）
- API：`src/routes/api/talent/*`
- コイン：企業はコインをまとめ買い（`/api/talent/coins`、Stripe PaymentIntent。支払い後にサーバーで確認して `coin_lots` に記録、Webhook は保険）。有効期限6か月（資金決済法の届出の対象外にするため）。パック・人材ごとの値段（評価の平均の段階＋見られた回数で上乗せ）は `src/lib/coins.ts`。企業は面接の結果ごとに買う（`/api/talent/unlock` の `interviewId`）。SQL 関数 `spend_coins_for_unlock` が、期限の近いコインから減らして閲覧権（`profile_unlocks.interview_id`）を記録し、円換算の1/4を本人の `point_ledger` に入れる。`interview_id` が空の行は「その人の結果すべて」（以前の購入・求人への応募）。どれか1つ買えば名前と面談の申し込みが開く（`getUnlockAccess`）
- ポイント：1pt＝1円。今はライト・プロの月額の支払いだけ（`/api/points` の apply、申し込み時は `create-subscription` の `usePoints`）。Stripe の顧客残高（クレジット）に入れて次の請求から差し引く（`src/lib/points.ts`）。現金・ギフトカードとの交換は労働局の確認が取れるまでしない
- 画面：ユーザー `/private/individual/talent`・`/offers`、企業 `/business/company/talent`・`/messages`
- 企業に見える面接結果は本人が選ぶ（`interviews.shown_to_companies`）。上限はプランの「結果の数」（無料5・ライト10・プロ上限なし）。新しい練習は枠が空いていれば自動で入る（`autoShowNewInterview`）。選ぶ画面は公開ページの `MyInterviewCards`、API は `/api/talent/my-interviews`。人材検索は公開中の結果を1つずつ別のカードにする（同じ人でも結果ごとに評価・値段が別で、複数の結果を平均しない。`loadShownResults`）。人物まとめも公開中の面接だけから作るが、企業の画面には出していない
- 練習の録画は本人が許可したときだけ、ブラウザから Storage へ直接アップロード（1人3本まで）
- 企業に見せる評価は本人向けと分ける：`save-interview.ts` が同じAI呼び出しで採用担当者向けの見立て（`recruiter_view`、`sanitizeRecruiterView`）も作る。企業側（`loadCompanyInterviews`・`CompanyInterviewBlock`）は本人向けの点数・改善点・模範回答を返さず、7つの力と見立て・会話・録画だけ。企業側の点数は「7つの力の平均（5点満点）」
- 企業メニュー：人材を探す・面談メッセージ・書類選考・書類選考履歴・購入した人材（`/business/company/purchased`）・求人掲載・設定。企業の料金はコイン（人材の閲覧）と、AI面接の従量課金（¥5,500/回、`COMPANY_INTERVIEW_PRICE_JPY`）だけ。月額プラン（ライト・プロ）は廃止。AI面接はカード登録（Stripe の従量課金の契約＝`plan: company_metered` と `stripe_subscription_id`）が済んだ企業だけURLを発行でき、候補者が面接を始めた最初の1回に `interview-turn.ts` が Stripe のメーター（`interview_usage`）に記録する。求人掲載は当面無料。書類選考AI（`/api/chat`）は求人を掲載中の企業だけ
- 面接ごとの設定（面接官のスタイル・職種・時間・応募先・聞いてほしい質問）は `save-interview.ts` が `interviews.practice_settings` に保存し、企業の面接ごとの評価に表示する。人材検索の絞り込みは、キーワード・状況・職種（練習した職種か希望職種）・エリア（希望勤務地）・並び順・評価の平均
- 求人：個人は `/private/individual/jobs` で見て応募（`/api/jobs/apply`）。応募すると0円の `profile_unlocks` と承諾済みの `contact_requests` を作り、企業が評価を見てメッセージできる（売上の集計は `amount > 0` だけ）
- 学校・塾：生徒の練習管理だけ（`/business/school/students`）。生徒がマイページで招待コード（`companies.join_code`）を入力すると `school_memberships` に入り、先生が練習結果を見られる
- 年齢・性別での絞り込みはしない。学校・塾／芸能の入口は隠している（`login.tsx` の `SHOW_SCHOOL_AND_ACTOR`）

## 個人プランの上限

- 数字はすべて `src/lib/plan-rules.ts`（`PRACTICE_RULES`）。無料 ¥0（月5回）／ライト ¥980（月15回）／プロ ¥2,980（月30回）。評価の中身・公開・オファーは全プラン同じで、変わるのは回数・時間・職種・結果の数だけ
- 回数と職種は `create-practice-session.ts` でチェック（AIと話し始めた練習だけ数える。日本時間で日・月を区切る。職種は月ごとに入れ替え可）
- 時間は `interview-turn.ts` で止める（上限で締めの指示、+3分でAIを呼ばずに終了）。開始時刻は `screening_data.practice_started_at`
- 結果は新しい順に上限まで表示し、古いものは消さずに隠す（`PracticeHistoryContent`）
- 企業研究AI（`research-target.ts`）はプロだけ・月5回（`RESEARCH_PER_MONTH_PRO`、`feature_usage_counters` の `company_research`）
- 練習の職種（受験生は学校）の選択は全プラン。それ以外の任意設定（応募先・学部・聞いてほしい質問・プロフィール優先・書類アップロード）はプロだけで、`create-practice-session.ts` でもプロ以外は無視する
- 書類生成AIの回数は `DOCUMENT_RULES`（無料 1日1・月3／ライト 1日2・月5／プロ 1日3・月15、種類は全プラン同じ）。`generate-document.ts` が `feature_usage_counters`（`doc_generation`）で数えるので、書類を消しても回数は戻らない
- Stripe は `STRIPE_PRICE_INDIVIDUAL_LIGHT` / `_PRO` があればその Price、なければ `PRICE_IDS` の Price（金額が違う・停止中なら同じ商品で値段だけ新しくして申し込む）

## スマホ・アプリ化

- 通知：`src/lib/notify.ts` の `notify()` がアプリ内のお知らせ（`notifications`、ベルは `NotificationBell`）に残し、登録済みの端末（`push_subscriptions`）へプッシュを送る。プッシュは中身なしの合図だけで、`public/sw.js` が `/api/notifications/peek` から最新のお知らせを取って表示する。鍵は VAPID（公開鍵 `VAPID_PUBLIC_KEY`／`VITE_VAPID_PUBLIC_KEY`、秘密鍵 `VAPID_PRIVATE_KEY`）。対象：結果が買われた・面談の申し込み／承諾・メッセージ・応募（メールも従来どおり）と、練習のリマインド（毎時の Cron で日本時間19時台、3日練習していない人に7日に1回まで）

- 友だち紹介：`/login?ref=コード` から登録 → `/private/welcome` で `/api/referral` の claim。紹介された人が最初の練習を終えると（`save-interview.ts` の `rewardReferralOnFirstPractice`）両方に練習のボーナス+3回（`practice_bonus_ledger`、お金・ポイントは渡さない）。ボーナスは1日・1か月の上限を超えたときに `create-practice-session.ts` で1回ずつ使う。画面は `/private/invite`
- 評価のシェア：練習履歴の「結果を画像でシェア」（`ShareResultButton`、ブラウザで1080×1350の画像を作る。名前は入れず、文に招待リンクをつける）
- 受験生のスマホのホームは個人と同じ形（`StudentMobileHome`）。Supabase の確認メールの日本語の文面は `docs/supabase-email-templates.md`
- TikTok 動画：毎日17時（GitHub Actions `.github/workflows/tiktok-video.yml`）に `scripts/tiktok/render.mjs` が、`/api/studio/job`（台本はAI・音声は OpenAI TTS、`src/lib/studio.ts`）→ 撮影用の画面 `/studio/tiktok`（`TiktokScene`、時計を止めて1コマずつ撮る）→ ffmpeg → `/api/studio/upload` で `tiktok_videos` と Storage `tiktok-videos` に置く。合言葉 `STUDIO_SECRET`（Cloudflare と GitHub の両方）。管理画面の「TikTok」で見る・保存・投稿済みにする（`/api/tiktok-videos`）。受験者もAIの演技で、実在の利用者の面接は使わない
- 「今日の質問」とリマインドメールは廃止（DBのテーブルは残している）
- 端末ごとのレイアウト：スマホは下部メニュー（`PrivateNav`）、面接画面はスマホ・縦向きタブレットで縦積み（`useCompactLayout`）
- ホーム画面に追加できる（PWA）：`public/manifest.webmanifest`・`public/icons/`・`public/sw.js`（画面はキャッシュせず、電波がないときだけ `offline.html`）。案内は `InstallAppPrompt`
- ページは自動で分割して読み込む。ルートファイル（`src/routes/`）から `Route` 以外を export すると分割されなくなるので、共有する画面は `src/components/pages/` に置く

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
| `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `VAPID_PRIVATE_KEY`, `STUDIO_SECRET` | 秘密鍵 | ローカル: `.dev.vars` / 本番: `wrangler secret put` |

テンプレート: `.env.example`, `.dev.vars.example`

## 既知の課題

- ESLint に既存の指摘が残っている（`no-explicit-any` が大半。全角スペースの `no-irregular-whitespace` と `react-hooks/exhaustive-deps` の警告は意図的なものが多い）
