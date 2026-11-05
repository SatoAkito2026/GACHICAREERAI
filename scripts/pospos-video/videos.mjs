// ポスポスの説明動画の台本（TikTok・Instagram のリール用。9:16）。動画を作り直すときは、その mp4 を消して push する
// 画面はデモのお店（キャバクラ Club Rose・居酒屋 まるよし）をそのまま撮る。お店・人の名前・数字は架空。
// 1本ずつ：id（ファイル名）・mode（night/day）・title（上に出す見出し）・hook（最初の一言）・steps（話す言葉と画面の動き）
// steps の動き：go（開くページ）・click（押す文字。{ text, exact } か { role, name }）・scroll（下へ何px）・prev（「← 前月」を押す）
// 最後の締め（今なら0円で始められる…）は render.mjs が全部の動画につける

export const VIDEOS = [
  {
    id: "night-01-tsukemawashi",
    mode: "night",
    title: "付け回しは4つ選んで押すだけ",
    hook: "キャバクラやホストの付け回し、まだホワイトボードで回していませんか？",
    steps: [
      { go: "/admin/seating", say: "ポスポスなら、付け回しは4つ選んで押すだけです。" },
      { click: { has: "button", text: "2名" }, say: "まず、付ける卓を選んで、" },
      { click: { has: "button", text: "あいり" }, say: "付けるキャストを選んで、" },
      { click: { has: "button", text: "場内指名" }, say: "付け方を選んで、" },
      { click: { has: "button", text: "15分" }, say: "何分付けるかを選ぶだけ。" },
      { click: { has: "button", text: "に付ける", before: true }, say: "あとは「付ける」を押せば完了です。" },
      { go: "/me", say: "付けたキャストのスマホには、今の席とあと何分かが、すぐに出ます。" },
    ],
  },
  {
    id: "night-02-encho",
    mode: "night",
    title: "セットの終わりを見のがさない",
    hook: "セットの時間、うっかり過ぎてしまうことはありませんか？",
    steps: [
      { go: "/admin/floor", say: "ポスポスは、もうすぐセットが終わる卓を、赤で知らせます。" },
      { scroll: 420, say: "卓ごとの残り時間と金額も、ひと目でわかります。" },
      { say: "延長するかお客さまに聞いて、そのままお会計へ進めます。" },
    ],
  },
  {
    id: "night-03-shukei",
    mode: "night",
    title: "閉店後の集計は確認だけ",
    hook: "閉店後の売上の集計に、毎日何十分もかかっていませんか？",
    steps: [
      { go: "/admin/slips", say: "ポスポスは、お会計をすると伝票が自動でできるので、その日の売上も自動で集計されます。" },
      { scroll: 300, say: "キャストのバックを入れた人件費も、" },
      { scroll: 220, say: "経費を引いた利益まで、自動で出ます。" },
      { say: "閉店後は、合っているか確かめるだけ。毎日1分もかかりません。" },
    ],
  },
  {
    id: "night-04-ranking",
    mode: "night",
    title: "ランキングも自動で出る",
    hook: "キャストのランキング、毎月手で集計していませんか？",
    steps: [
      { go: "/admin/ranking", prev: true, say: "ポスポスは、伝票からランキングを自動で出します。" },
      { scroll: 360, say: "売上・本指名・ドリンクなど、項目ごとに見られます。" },
      { go: "/me", scrollTo: "今月のランキング", say: "キャストも、自分のスマホで今の順位を見られます。" },
    ],
  },
  {
    id: "night-05-cast",
    mode: "night",
    title: "キャストはスマホで給料を確認",
    hook: "「今月いくらもらえる？」って、毎回キャストに聞かれていませんか？",
    steps: [
      { go: "/me", say: "ポスポスなら、キャストは自分のスマホで確認できます。" },
      { scroll: 520, say: "今月の稼ぎや、もらえる金額の予定も、いつでも見られます。" },
      { go: "/me/pay", say: "次の給料日と金額の予定も、いつでも見られます。" },
      { say: "アプリを入れなくても、ブラウザで開くだけで使えます。" },
    ],
  },
];

export const DEMO = {
  night: "https://pospos.akitogroup.jp/demo/cabaret",
  day: "https://pospos.akitogroup.jp/demo/izakaya",
};
