# CLAUDE.md

Interview Copilot AI（ガチキャリアAI）— AI面接練習・面接支援・書類選考の Web アプリ。
本番: https://gachicareer-ai.akitogroup.jp（旧URL interview-copilot-ai.akitogroup.jp は `src/server.ts` で新URLへ転送。`/api/` は転送せず旧URLでも動く）

## スタック

- **フレームワーク**: TanStack Start（React 19 + TanStack Router のファイルベースルーティング、SSR）
- **実行環境**: Cloudflare Workers（`@cloudflare/vite-plugin`、設定は `wrangler.jsonc`）
- **DB / 認証**: Supabase（プロジェクト `lcqpihitxmqaygriuhao`）。スキーマは `supabase/migrations/`
- **UI**: Tailwind CSS v4（画面部品は各コンポーネントに直接書く。通知は `sonner`（`src/components/ui/sonner.tsx`）、グラフは `recharts`、アイコンは `lucide-react`）
- **AI**: Anthropic（`@anthropic-ai/sdk`、会話・生成全般）、OpenAI（Whisper 文字起こし・TTS）。面接官アバターは外部サービスを使わない自前実装（`src/components/InterviewerAvatar.tsx`）。写真（`public/avatar/base.webp`）の顔に478点の網目（リグ `public/avatar/rig.json`）を入れて WebGL で変形させる。声は OpenAI の gpt-4o-mini-tts（はっきり話す指示 `INTERVIEWER_VOICE_STYLE`）で作り、画面側で声の高さを変えずに1.5倍にする（`src/lib/time-stretch.ts`、WSOLA）。口は音声から母音（あいうえお）を判定した口の形（`src/lib/lipsync.ts`、再生は `src/lib/avatar-voice.ts`）に合わせ、参考動画から学習した「口を開けた・横に広げたときの顔全体の動き」で網目を動かす。首の傾き・位置は参考動画の動きの数値を6割に抑えたもの（話している動画の首の動きは揺れが大きいので使わない）。話している間は、話している動画（4つ目の引数）から学習した表情（口角を上げる・眉を上げる）を重ね、話し終わってもしばらくほほえむ（目を細める動きは黒目がつぶれて不自然なので使わない）。口の中は `mouth-inside.webp`。まばたきは目のまわりだけを `eyes-closed.webp` に0.14秒で切り替える。リグは `scripts/avatar/build_rig.py` で作る。`/avatar-lab` は録音した声で口の動きを確かめる試作ページ
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

## 提携先（POSPOS）の AI 一次面接

POSPOS（別アプリ・飲食店／夜のお店向け POS レジ）のお店が、アルバイト・キャストの応募者に AI の一次面接をしてもらう機能。ガチキャリAI の練習・企業の AI 面接・人材プロフィール・課金とは**完全に別物**（表は `partner_interviews` だけ。candidate_profiles・7つの力・recruiter_view・人材の公開・Stripe のメーターには一切つながない）。

- 中身は `src/lib/partner-interview.ts`（選ぶ質問 `screeningQuestions`・`validateScreening`、AI への指示・まとめ・90日で消す処理 `runPartnerInterviewJob`）
- 流れ：同意とカメラの確認 → **選ぶ質問**（希望の出勤日数・曜日・時間帯（出勤0時〜23時・退勤1時〜翌12時・ラストまで）・勤務開始・通勤手段・通勤時間（片道・分を入力）・経験＋職種ごと。夜のお店は「18歳以上で高校生ではない」のチェックが必須。年齢そのものは聞かない。サーバーで選べる答えかを確かめて `partner_interviews.screening` に保存）→ AI と2〜3分の会話（自己紹介・職歴・やってみたい理由・趣味・お店の質問は3つまで。4分で締め、+1分で AI を呼ばずに終える）→ 終わりの画面。会話は screening を保存してからだけ始められる
- POSPOS のサーバーからの入口：`/api/partner/pospos/interviews`（POST で URL を作る・GET で一覧）、`/api/partner/pospos/interviews/<id>?storeId=`（GET で中身＝選ぶ質問の答え `answers`・まとめ・会話・写真・録画、DELETE で消す）。認証は `Authorization: Bearer <POSPOS_PARTNER_SECRET>`（Cloudflare の secret）。どの入口も `storeId` で絞り込み、違うお店は 404。入力は zod で確かめる。1店あたり日本時間の1か月で100回まで（消したものも数える）
- 応募者の画面：`/partner-interview/<合言葉>`（`PartnerInterviewPage`、会員登録なし）。API は `/api/partner-interview`（session・start・turn・media-url・media-done・finish）と `/api/partner-interview/transcribe`。合言葉は1回きり・14日。答えはじめてから閉じたら expired（まだ答えていなければやり直せる）
- 会話の録画（はじめから終わりまで・5分まで）と顔の写真3枚（はじめ・30秒後・おわり）は必須（同意しないと受けられない、カメラがないと受けられない）。非公開バケット `partner-interviews` の `pospos/<storeId>/<面接id>/` にブラウザから直接送る。お店には1時間の期限つき URL だけ
- AI の呼び出しは「会話の受け答え（3〜5回）」と「終わったあとの雰囲気のまとめ1回」だけ（最初のあいさつは決まった文）。まとめの availability は AI に書かせず、選ぶ質問の答えをつなぐ。見た目については AI は何も書かない。応募者には評価を見せず、終わりの画面は決まった文だけ。90日たったら録画・写真・会話・まとめを毎時の Cron で消す

## 営業ロープレ（企業の社員研修）

企業の社員が AI のお客さん役を相手に、訪問販売・反響営業・テレアポ・法人営業（商談）を声で練習する。面接の練習・人材プロフィール・7つの力とは別物。1社1か月100回まで無料（1人1日10回まで、`src/lib/sales-roleplay.ts`）。超えた分の課金は未実装。運営（`profiles.is_admin`）本人か、運営のアカウントがある会社は回数・資料の数の上限なし（`isSalesUnlimited`）。お客さん役の長い指示（資料・知識・スクリプト）と会話の履歴はプロンプトキャッシュで使い回す。

- 社員は個人で会員登録し、会社の招待コード（`companies.sales_join_code`、学校の `join_code` とは別）で参加（`sales_memberships`、1社だけ）。入口はマイページ →`/private/individual/sales`
- 会社の画面 `/business/company/sales`：招待コード・資料・社員ごとの回数と評価・最近のロープレ。資料（`sales_materials`）は種類（トークスクリプト／商品・料金／議事録／そのほか）と使う場面を選ぶ。PDF・Word・テキストと、それらをまとめた ZIP から読み込める（ブラウザで文字だけ取り出す `src/lib/material-files.ts`。ZIP はファイルごとに1件）
- 本番 `/sales/play`（`SalesPlayPage`）：お客さんが先に話す。進め方は「まずいところで止めて助言（3回まで、言い直す）」か「最後までやる」。電話の場面は電話の画面、それ以外は名札の画面（面接官の顔は使わない）。結果 `/sales/result/<id>` は本人と、参加中の会社の担当者が見られる
- AI：お客さん役と助言は `customerTurn`、評価は `evaluateRoleplay`（7つの観点1〜5。1つ目は「ピッチ」＝相づち・おうむ返し・話す速さ・雰囲気合わせ。根拠の引用が本人の発言にないものは捨てる）。お客さん役には商品資料・会社の教え（働きかけへの自然な反応用）・よくある断り文句を渡し、先生（助言・評価）にはさらにトークスクリプトと営業の知識を渡す
- 資料の種類「営業の教え・考え方」（`kind=training`。ピッチ・5インパルス・羊の法則など会社で教えていること）は、助言・評価のいちばん大事な基準。評価では教えの項目ごとに「できた／まだ」を出す（`methods`）
- 話す速さ：画面が営業の一言の秒数（話しはじめ〜最後に声が出たとき）を送り、お客さんの声は音声の長さから計る（`SalesLine.sec`、`charsPerSec`）。お客さん役と評価に1秒あたりの文字数で渡す
- 手数料・成果報酬・利益など社内だけの情報は AI に覚えさせない：資料を入れたときに `src/lib/sales-screen.ts` が AI（Haiku）で見つけて取り除いてから保存する（元の文は残さない。お客さんが払う値段・手数料は残す）。確かめ終わった資料（`sales_materials.screened`）だけをロープレの AI に渡し、確かめられなかったものは毎時の Cron（`runSalesScreenJob`）でやり直す。ZIP で社内向けらしいファイル名（`looksInternal`）は、はじめからチェックを外す。見分けは名前でなく「お金を誰が誰に払うか」（お客さんが払う・もらう＝残す／会社に入る＝消す）。会社ごとの「必ず残す言葉」「必ず消す言葉」（`companies.sales_keep_terms` / `sales_remove_terms`、会社の画面の「手数料の見分けルール」）を AI より優先し、消す言葉は AI によらず言葉で消す（保存したとき今ある資料からも消す。消した文は戻せない）
- 営業の知識は `src/lib/sales-knowledge.ts`：場面ごとの型（流れ・技・NG・断り文句・特定商取引法など）を組み込み、毎時の Cron の `runSalesKnowledgeJob` が週に1回、場面ごとに AI のウェブ検索で最新のコツを調べて `sales_knowledge` に入れる
- API：`src/routes/api/sales/*`（join・company・roleplay・result・transcribe）

## 個人プランの上限

- 数字はすべて `src/lib/plan-rules.ts`（`PRACTICE_RULES`）。無料 ¥0（月5回）／ライト ¥980（月15回）／プロ ¥2,980（月30回）。評価の中身・公開・オファーは全プラン同じで、変わるのは回数・時間・職種・結果の数だけ
- 回数と職種は `create-practice-session.ts` でチェック（管理者 `profiles.is_admin` は回数・時間・職種の上限なし。AIと話し始めた練習だけ数える。日本時間で日・月を区切る。職種は月ごとに入れ替え可）
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
- TikTok 動画：毎日11:13と11:43（GitHub の予約実行は数時間遅れることがあるので、17時の投稿に間に合うよう昼に予約。2回目は今日の分があれば作らない。GitHub Actions `.github/workflows/tiktok-video.yml`）に `scripts/tiktok/render.mjs` が、`/api/studio/job`（台本はAI・音声は OpenAI TTS、`src/lib/studio.ts`）→ 撮影用の画面 `/studio/tiktok`（`TiktokScene`、時計を止めて1コマずつ撮る）→ ffmpeg → `/api/studio/upload` で `tiktok_videos` と Storage `tiktok-videos` に置く。合言葉 `STUDIO_SECRET`（Cloudflare と GitHub の両方）。管理画面の「TikTok」で見る・保存・投稿済みにする（`/api/tiktok-videos`）。受験者もAIの演技で、実在の利用者の面接は使わない。台本は「伸びるショート動画の型」に沿い、最後に企業から面談の申し込みが届く演出（テーマに合わせる・架空の会社）。今は「言い換え型」（`writeRewriteScript`・`RewriteScene`：「◯◯と聞かれた時の最高な答え方」を、落ちる言い方→受かる言い方とAI面接官の点数の上がり方で見せる。伸びている面接動画を参考にした型。25〜30秒・2パターン。1コマ目は明るい黄色の画面に前ふりと1つ目の落ちる言い方・低い点数（暗い1コマ目は2秒で離れられていたため）。見出し①②と言い換えのポイントは読み上げず文字だけ）で作る。前の寸劇の型（`writeScript`・`TiktokScene`）も残している。毎日の動画は、言い換え型と「ランキング型」（`writeRankingScript`・`RankingScene`：掲示板風。面接AIを出さない就活・転職の話題のランキング（5位→1位、名前・絵文字・書き込み風のひとこと2つ）。最後にさりげなくガチキャリAI）からランダムに選ぶ（`/api/studio/job` の `DAILY_FORMATS`。Actions の手動実行で format に rewrite・ranking を選べば型を指定できる）。広告（決まった台本・約17秒、`adScript`・`AdScene`）は Actions の手動実行で format に ad、platform に tiktok（9:16）か instagram（4:5）を選ぶと作れる（毎日の動画の数には入れない）。1コマ目から顔と点数、大事なものは安全な範囲（9:16 は上130・下200・右74をあける）に置く。tiktok の広告はサイトの `public/videos/ad.mp4` にもコミットされる。動画は `tiktok_videos.platform` で分け、管理画面の「SNS動画」で TikTok／Instagram をタブで切り替え（1本1行、押すと開く）。動画の声の速さは `lineTempo`（全員1.75倍）。管理画面で投稿済みの動画に再生数・いいねを入れると、次の台本で伸びたテーマを7割選び、伸びたタイトルを参考にする
- 「今日の質問」とリマインドメールは廃止（DBのテーブルは残している）
- トップページ `/` は紹介ページ（`src/components/pages/LandingPage.tsx`、画面のイメージは `src/components/landing/Mockups.tsx`、広告動画は `public/videos/ad.mp4`）。記事などに埋め込む広告は `/embed/ad`（iframe 300×600）。旧LP akitogroup.jp/gachicareer-ai は Cloudflare のリダイレクトルールでここへ301。「無料ではじめる」は `/login?signup=1`。個人・受験生のホームはスマホ・パソコン共通（`MobileHome`）で、はじめての人には使い方のスライド（`WelcomeTour`、端末に見たことを保存）
- 練習の「話し方・態度」：答えの長さ・言いよどみは文字から数える（`src/lib/speech-stats.ts`）。間・声の波・目線はブラウザで測って数字だけ送る（`src/lib/delivery-tracker.ts`、目線は MediaPipe の顔の点を CDN から読み込む。映像は送らない）。保存は `practice_feedback.speech_stats` / `delivery`。企業の面接ごとの評価にも出す（`loadCompanyInterviews` → `CompanyInterviewBlock`、部品は `src/components/talent/ResultExtras.tsx`）。結果のいちばん上に「一次面接の目安」（7つの力の平均から `verdictOf`：3.8以上 通過ライン／3.0以上 あと一歩）。本人の画面の100点満点の内訳はたたんで表示し、見出しは5点満点にそろえる。回答の締めは、黙ってから3秒（よく話したあとは2.3秒）
- 上位何%：`/api/talent/my-rank`（SQL 関数 `practice_rank`、1人につき一番良い点数で比べる。20人未満は出さない）
- 端末ごとのレイアウト：スマホは下部メニュー（`PrivateNav`）、面接画面はスマホ・縦向きタブレットで縦積み（`useCompactLayout`）
- ホーム画面に追加できる（PWA）：`public/manifest.webmanifest`・`public/icons/`・`public/sw.js`（画面はキャッシュせず、電波がないときだけ `offline.html`）。案内は `InstallAppPrompt`
- ページは自動で分割して読み込む。ルートファイル（`src/routes/`）から `Route` 以外を export すると分割されなくなるので、共有する画面は `src/components/pages/` に置く

## 待ち時間バトル（akitogroup.jp/play/）

ガチキャリAI とは関係のない、スマホで対戦するミニゲーム集（荒野バトル・カート・ジャンプ走は同じ招待コードなら何人でも一緒に遊べる（`matchPeers`・`humList`、ホストが先頭、ほかは cid の順）。ほかのゲームはふたり。荒野バトル（横画面のバトルロイヤル・5ステージ（草原・砂漠・雪山・港町・都市）と広さ（380m・600m・1km）を選べる。広いマップは区画ごとに遠くを描かない・木はインスタンス描画・道さがしは2mマス・海や池は泳げる（遅い・頭だけ出る）・車に乗れる（町のまわりに置く・乗っている人の画面が動かしホストが全員に送る・人をひくとダメージ・運転しながら撃てる・スティックをたおした方へ自動で曲がるかんたん操作）・着地から30秒は無敵（`e.inv`）・スコープとアタッチメント（拡張マガジン・サプレッサー・グリップ）は武器ごとにつく（`sl.sc`・`BR_ATT`。スコープの倍率は `it.zm`、`it.z` は置き場所なので使わない）・回復は救急箱・包帯・スポーツドリンク・スモーク（中はCPUも見えない）・単発／連射の切りかえ・倒れた人の持ち物と補給物資（赤い煙）の中身はホストが `S.dyn`（番号100000から）で全員に送る・レッドゾーン（爆撃、建物の中は安全。`S.rz`・`S.bm`、時計は `S.plane.t`）・観戦で見る人を切りかえ・伏せる・左右リーン（かべから頭と銃だけ出す）・服・髪・帽子を各10種類から選べる（見た目だけ、`brLook`）・ほかの人の頭の上に名前は出さない・2〜20人・空から降下・武器の強化・手榴弾・安全地帯・ボタン・地図・体力などの配置と大きさを変えられる（端末に保存）・町の家は大きくて中に入れる（ドア・部屋・家具・中にも物）・銃声・足音（30m、走ると45m、しゃがむと出ない）と撃たれた方向を地図と画面に表示・ドットサイトと2〜8倍スコープ・CPUの強さ（よわい・ふつう・つよい・鬼）・ゲーム中は全画面）・11人サッカー（3D・横画面・11対11（4-4-2）。オリジナル5チームから選ぶ（攻撃・守備・スピード・キック力・テクニックのゲージが試合に出る、`SC_TEAMS`）。4つのボタンはタップ・長押し・スワイプで使い分け（パス：近く・遠く・ロブ・パス＆ゴー、スルー：グラウンダー・ロブ、シュート：強さ・巻く・ループ・フェイント、自陣はクリア、ダッシュ＆スキル）、守るときはスライディング・2nd DF・切り替え・ダッシュ＆タックル（タップでタックル・長押しで寄せる）。ファウル→フリーキック（なぞって曲げるシュート、守る側は壁ジャンプ・壁突進・壁を左右に）、エリア内はPK。スローインは投げる人がボールを持って待ち（`S.ph === "ti"`）、パス・スルーで投げる。カメラは中継の角度に固定してボールに合わせて平行移動するだけ（見下ろさない）。ゴールはラインを越えた瞬間の位置で判定（速いボールも取りこぼさない）。パスは走る先に合わせ、通り道に相手がいれば浮かせる。シュートは押す長さで強さ・スティックですみを狙う。選手は加速・向きの変化に重さ、CPUはラインをそろえる・マーク・裏へ走る・クロス。キーパーはシュートごとに止められるかを決める（すみの強いシュートは決まりやすい）。ホストが全員とボールを計算し、あいては入力だけ送る。ひとりのときは相手チームはCPU。前後半で約5分）・PK対決（3D・横画面のスタジアム。ボールは速さ・重力・スピンで飛び、キーパーは蹴った瞬間に予想した場所へ飛ぶ。判定はこの計算で全員同じ `pkPath`・`pkKeeper`・`pkJudge`。スピンの曲がりは距離に比例（PKで最大0.8m）。ゴールラインのあとは物理（空気抵抗・バウンド・ポスト・ネット）で動き、ゴール前はスローモーション・白い軌跡。結果の文字と得点はボールの動きが終わってから出す。上から見下ろすカメラ）・かくれんぼ（3D・物に変身するタイプ、5ステージ、横画面・ダッシュ・物と重なったら近くのあいている所へ出す。Three.js を cdnjs から読む）・カートレース（3D・横画面・5コース（グランプリ・海岸ハイウェイ・雪の峠・ナイトシティ・ネオンクラブ（巨大モニター・光の柱・レーザー・ミラーボール））、コースは制御点の1.9倍の長さ・坂・トンネル・ダッシュパネル・ジャンプ台（空中でドリフトを押すとトリック）・大ジャンプ台（グライダーが開く）、コーナーの縁石・外側のかべ・オリジナルのカートと運転する人、アイテムはターボ・バナナ・ロケット・シールド・ジェット（自動で進み、ぶつかった相手をはね飛ばす）、スタート前にキャラ・色・カートを各10種類から選べる（見た目だけ・性能は同じ・端末に保存）、アイテムは2個まで（ロビーで「アイテムなし」も選べる・`me.m.noItem`）、空中はかべにぶつからずコースの上へ戻る・トンネルの上には行けない、順位は各自のゴールタイムで全員の画面で同じに計算（`finalRanks`）。全員がゴールするまで順位は出さない）・ジャンプ走・軍団ラン・木こりタイクーン・すもう・トランプ（大富豪・ババ抜き・七並べ・神経衰弱・ブラックジャック、1〜6人で足りない席はCPU）。以心伝心・クイズ・反射神経・4目並べ・数当てはメニューから外した（`GAMES` の `off: 1`。コードは残している））。会社ホームページ側の `corporate-site/public/play/index.html` 1枚の静的ページで、ログイン・DB は使わない。招待コード（4ケタ、URL の `#1234`）が同じ人どうしを Supabase Realtime のブロードキャスト（公開キー）でつなぐ（人数が多いほど送る間隔をあけて、メッセージの上限で遅れがたまらないようにする）。相手がいなければコンピューターと遊べる。送るたびに自分の時計をつけ、受けた側がホストの時計とのずれを測る（`hostNow()`）。カート・ジャンプ走はホストが決めたスタート時刻（`me.s.go`、ホストの時計）で全員同時にスタートし、タイムもこの時計で計る。感度設定（視点・スコープ・スティック・カートのハンドル）は全ゲーム共通で端末に保存（`SENS`）。ボタン配置は荒野・カート・かくれんぼ・サッカーで変えられる（保存した位置が画面の外なら中に戻す）（`layoutEditor`、ゲームごとに端末に保存）。CPUの数はカート（0〜7）・ジャンプ走（0〜5、ホストが動かして全員に送る）・かくれんぼ（0〜5）で選べる（`cpuCount`・`me.m.cpus`、試合の設定なので全員同じ。荒野は人数で選ぶ）。3Dの画質（自動・高・中・低、スマホは自動で中）と照準の色（赤・緑・黄・水色・白、黒いふちつき）も同じ設定画面。ゲーム中は2本指の拡大を止める。アプリは縦横どちらでも開ける（manifest の orientation は any）。荒野の音は武器ごとの銃声（遠いほど小さく・こもって・遅れて届く）・左右の向き・足音・リロード・風・車（`gunSnd`・`meSnd`・`brSndFrame`）。カート・ジャンプ走・連打すもう（3番勝負・立ち合い・ため・いなし・番付）・軍団ラン（3ステージ・ボス・決戦はホストが両軍の人数を計算）・木こりタイクーン（広いマップ・製材所・家具工房・トラック・目標18こ・CPUの相棒）・かくれんぼ（固まる・おとり・わらう・鬼のセンサー・得点制）は担当ごとに作り込んだ。効果音は全ゲーム共通の `SND`（音のファイルなし・その場で作る。`SND.play(種類)`、エンジンや観客は `SND.loop`。「感度」の画面でオン・オフ、勝ち負けの表示が出ると自動で鳴る）。検索には出さない（noindex）・サイトからリンクしていない

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
