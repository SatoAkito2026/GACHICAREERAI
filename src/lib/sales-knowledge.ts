/**
 * 営業ロープレの「営業の知識」（場面ごと）
 * - SALES_PLAYBOOK：はじめから組み込んでいる型（流れ・効く技・NG・よくある断り文句と切り返し・守るべき法律）
 * - sales_knowledge：週に1回、AI がネットで調べて足す最新のコツ（runSalesKnowledgeJob、毎時の Cron から呼ぶ）
 * 先生の助言と評価に使う。お客さん役には「よくある断り文句」だけを渡す（営業の正解は知らないふりをさせる）
 */
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractJson, lastTextBlock } from "@/lib/ai-json";
import { serviceClient } from "@/lib/talent";
import type { SalesScenario } from "@/lib/sales-roleplay";

type Playbook = { flow: string; skills: string; ng: string; objections: string; law: string };

export const SALES_PLAYBOOK: Record<SalesScenario, Playbook> = {
  door: {
    flow: "①名乗り（会社名・自分の名前・訪問の目的をはじめに言う）→ ②警戒を解く（短く・明るく・ご近所で〇〇をしている等の理由）→ ③相手の暮らしの困りごとを質問で聞く → ④困りごとに合わせて商品のよさを1〜2点だけ → ⑤具体的なイメージ（金額・効果・事例）→ ⑥クロージング（契約、または見積もり・説明の続きの日時）",
    skills:
      "最初の15秒で「何の用か・相手にどんな得があるか」を言い切る／インターホンでは長く話さず、質問で相手に話してもらう／「〇〇でお困りではないですか？」と相手の話題にする／断られても一度は理由を聞き、相手の言葉を受け止めてから返す（イエス・バット、フィール・フェルト・ファウンド）／選べる形で約束をとる（「明日と土曜ならどちらが」）／帰り際の印象も大事にする",
    ng: "名乗らない・目的を隠す（特定商取引法違反）／断られたのに同じ日に勧誘を続ける（再勧誘の禁止）／うそ・大げさな言い方（「今日だけ」「絶対得」など根拠のないもの）／不安をあおる／相手の話をさえぎって説明し続ける／長居する",
    objections:
      "「今忙しいので」「間に合ってます」「うちはいいです」「セールスはお断り」「主人（家族）に聞かないと」「高いでしょ」「考えておきます」「チラシだけ置いていって」",
    law: "特定商取引法：はじめに会社名・氏名・勧誘の目的を告げる。断られたら再勧誘しない。うそ・重要なことを隠すのは禁止。契約したら書面を渡し、クーリング・オフ（8日間）を説明する",
  },
  inbound: {
    flow: "①名乗り＋資料請求（問い合わせ）のお礼 → ②今話してよいか確かめる → ③問い合わせのきっかけを聞く → ④今の状況・困りごと・希望・いつまでに・予算・決める人を聞く（ヒアリングが7割）→ ⑤聞いた内容に合わせて提案（全部ではなく合うところだけ）→ ⑥不安・疑問を聞いて解消 → ⑦次の一歩（申し込み・来店・面談・見積もり）を日時まで決める",
    skills:
      "反響はスピードが命（問い合わせからすぐ電話）／最初に相手の名前を呼び、お礼を言う／「なぜ今調べたのか」を必ず聞く（本当の理由がそこにある）／相手の言葉をくり返して確かめる／ほかと比べているかを聞き、比べ方を一緒に整理する／決める人・いつまでに・予算を自然に聞く／次の約束を「〇日の〇時」まで決める",
    ng: "いきなり商品の説明を始める／資料に書いてあることを読み上げるだけ／相手の希望を聞かずに一番高いものを勧める／決めつける／次の約束を決めずに「また連絡します」で終わる／しつこい追いかけ",
    objections:
      "「とりあえず資料が欲しかっただけ」「まだ情報収集の段階で」「ほかの会社とも比べている」「高い」「家族（上の人）と相談します」「また連絡します」",
    law: "電話での勧誘は特定商取引法の電話勧誘販売：はじめに会社名・氏名・目的を告げる、断られたら再勧誘しない、うそは禁止",
  },
  teleapo: {
    flow: "①受付突破（名乗り＋要件を短く。担当部署や担当者を聞く）→ ②担当者に名乗り＋電話の目的を15秒で → ③相手の得になる一言（同業の事例・数字）→ ④関心を確かめる質問 → ⑤断り文句への切り返し（1回）→ ⑥面談の約束（候補日を2つ出して選んでもらう）→ ⑦日時・場所・相手の名前と連絡先を確認してお礼",
    skills:
      "最初の一言で何の電話かを伝える（ごまかさない）／相手の時間を気にする一言（「1分だけよろしいですか」）／売るのではなく「会う理由」をつくる（情報提供・事例紹介）／質問は答えやすい形で（「〇〇はどうされていますか」）／断られたら理由を聞き、一度だけ切り返す／二択で日程をとる／最後に約束を復唱する",
    ng: "名乗らない・目的をぼかして取り次がせる／早口で一方的に話す／電話で商品の説明を全部してしまう（会う理由がなくなる）／何度断られても食い下がる／相手が忙しいと言っているのに話し続ける",
    objections:
      "受付：「担当者は不在です」「どういったご用件ですか」「営業のお電話はお断りしています」「資料を送ってください」／担当者：「今忙しい」「間に合っている」「興味ない」「ほかと取引している」「予算がない」",
    law: "相手が会社でも、うその名乗り・うその用件で取り次がせない。断られたら再度かけ続けない",
  },
  b2b: {
    flow: "①アイスブレイク＋今日の目的と時間の確認（アジェンダ）→ ②相手の会社の状況・課題を聞く（SPIN：状況→問題→その影響→解決したときの価値）→ ③決め方を聞く（BANT：予算・決める人・必要な理由・時期）→ ④課題に合わせた提案（事例・数字・費用対効果）→ ⑤懸念点を聞いて解消 → ⑥次のステップを決める（見積もり・上の人との打ち合わせ・試用・日時と宿題）",
    skills:
      "最初に今日のゴールと時間を合意する／質問で相手に話してもらう（話す割合は相手7：自分3）／課題の「影響（お金・時間・人）」を数字で聞く／決める人と決め方・時期を聞く／提案は相手の言葉を使って、課題ごとに解決策を示す／ほかの会社との違いを1つに絞る／懸念は先に聞き出す／次の一歩を、誰が・いつまでに・何をするかまで決める",
    ng: "会社案内を長々と話す／相手の課題を聞かずに機能の説明をする／値引きをすぐに出す／決める人・時期を聞かない／「ご検討ください」で終わる（次の約束がない）／競合の悪口",
    objections:
      "「今のところで間に合っている」「予算がない」「上に確認しないと」「ほかの会社とも比べています」「時期がまだ」「導入の手間が心配」「前に似たもので失敗した」",
    law: "うそ・大げさな効果の約束はしない。値段・条件は正確に伝える",
  },
};

/** お客さん役に渡す（よくある断り文句だけ） */
export function customerHints(scenario: SalesScenario): string {
  return SALES_PLAYBOOK[scenario].objections;
}

/** 先生（助言・評価）に渡す：組み込みの型＋ネットで学んだ最新のコツ */
export async function trainerKnowledge(
  supabase: SupabaseClient,
  scenario: SalesScenario,
): Promise<string> {
  const p = SALES_PLAYBOOK[scenario];
  const { data } = await supabase
    .from("sales_knowledge")
    .select("content")
    .eq("scenario", scenario)
    .maybeSingle();
  return `・よい流れ：${p.flow}
・効く技：${p.skills}
・やってはいけないこと：${p.ng}
・よくある断り文句：${p.objections}
・ピッチ（どの場面でも大事）：相手との雰囲気合わせ。相手の話す速さ・声の大きさ・テンションに合わせる、自然な相づち、おうむ返し（相手の言葉をそのままくり返して受け止める）、相手が話し終わるまで待つ。こちらだけ早口・一方的だと押し売りに感じられる
・守るべき法律：${p.law}${data?.content ? `\n・最近のコツ（ネットで調べたもの）：\n${data.content}` : ""}`;
}

// ---- 週に1回、ネットで調べて知識を更新する ----

const LABELS: Record<SalesScenario, string> = {
  door: "訪問販売",
  inbound: "反響営業（資料請求・問い合わせへの電話）",
  teleapo: "テレアポ（新規の電話でアポをとる）",
  b2b: "法人営業の商談",
};
const WEEK = 7 * 24 * 60 * 60 * 1000;

/** 毎時の Cron から呼ぶ。1回に1つの場面だけ、7日たったものを更新する（AI の呼び出しは週に4回だけ） */
export async function runSalesKnowledgeJob(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const supabase = await serviceClient();
  if (!apiKey || !supabase) return;
  const { data } = await supabase.from("sales_knowledge").select("scenario, updated_at");
  const updated = new Map((data ?? []).map((r) => [r.scenario, new Date(r.updated_at).getTime()]));
  const target = (Object.keys(LABELS) as SalesScenario[])
    .map((s) => ({ s, at: updated.get(s) ?? 0 }))
    .filter((x) => Date.now() - x.at > WEEK)
    .sort((a, b) => a.at - b.at)[0]?.s;
  if (!target) return;

  // 失敗しても毎時くり返さないよう、先に時刻だけ進める（中身がなければ組み込みの型だけで動く）
  const { data: prev } = await supabase
    .from("sales_knowledge")
    .select("content, sources")
    .eq("scenario", target)
    .maybeSingle();
  await supabase.from("sales_knowledge").upsert({
    scenario: target,
    content: prev?.content ?? "",
    sources: prev?.sources ?? [],
    updated_at: new Date().toISOString(),
  });

  const p = SALES_PLAYBOOK[target];
  const prompt = `あなたは日本の営業研修のトレーナーです。「${LABELS[target]}」で成果を出している営業のやり方を、ウェブで日本語の情報を調べて、研修で使えるコツにまとめてください。

すでに知っていること（これと同じことは書かない）：
${p.flow}
${p.skills}

【まとめ方】
- 実際に成果が出ているトーク・質問のしかた・断り文句への切り返し・クロージングの言い方など、すぐ使える具体的なコツを8〜12個
- それぞれ1〜2文。言い方の例があれば「」でつける
- 法律（特定商取引法・景品表示法など）に反するもの、うそ・不安をあおる・強引に押すやり方は入れない
- 出典のはっきりしない噂や、根拠のない数字は入れない
${prev?.content ? `\n前回のまとめ（よいものは残し、新しいものに入れかえてよい）：\n${prev.content}\n` : ""}
最後に、次のJSONだけを返してください：
{"tips": ["コツ1", "コツ2", …], "sources": ["参考にしたURL", …]}`;

  try {
    const anthropic = new Anthropic({ apiKey });
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
    let res: Anthropic.Message | null = null;
    // 検索が長いと途中で一度止まる（pause_turn）ので、そのときは続きを頼む（2回まで）
    for (let i = 0; i < 3; i++) {
      res = await anthropic.messages.create(
        {
          model: "claude-sonnet-4-6",
          max_tokens: 4000,
          tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }],
          messages,
        },
        { timeout: 120000, maxRetries: 1 },
      );
      if (res.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: res.content });
    }
    if (!res) return;
    const raw = extractJson(lastTextBlock(res.content)) as {
      tips?: unknown[];
      sources?: unknown[];
    };
    const tips = (Array.isArray(raw?.tips) ? raw.tips : [])
      .map((t) => String(t).trim().slice(0, 400))
      .filter(Boolean)
      .slice(0, 12);
    if (tips.length < 3) return;
    const sources = (Array.isArray(raw?.sources) ? raw.sources : [])
      .map((u) => String(u).slice(0, 300))
      .filter((u) => /^https?:\/\//.test(u))
      .slice(0, 10);
    await supabase.from("sales_knowledge").upsert({
      scenario: target,
      content: tips
        .map((t) => `- ${t}`)
        .join("\n")
        .slice(0, 8000),
      sources,
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[sales-knowledge] refresh failed", target, e);
  }
}
