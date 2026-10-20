/**
 * 画面に出すエラーを日本語にする（Supabase の認証・サーバーのAPIは英語のメッセージを返すことがあるため）。
 * 日本語のメッセージはそのまま返す。知らない英語のメッセージは、一般的な日本語のメッセージにする。
 */
const RULES: [RegExp, string][] = [
  [
    /invalid login credentials/i,
    "メールアドレスかパスワードが違います。入力をもう一度確かめてください。",
  ],
  [
    /email not confirmed/i,
    "メールアドレスの確認がまだです。届いた確認メールのリンクを開いてください。",
  ],
  [
    /user already registered|already been registered/i,
    "このメールアドレスはすでに登録されています。ログインしてください。",
  ],
  [/password should be at least (\d+)/i, "パスワードは$1文字以上にしてください。"],
  [
    /password.*(weak|easy to guess|pwned)/i,
    "このパスワードは簡単すぎます。別のパスワードにしてください。",
  ],
  [
    /new password should be different/i,
    "新しいパスワードは、今のパスワードと違うものにしてください。",
  ],
  [
    /unable to validate email|invalid email|email address .* is invalid/i,
    "メールアドレスの形式が正しくありません。",
  ],
  [/signups? not allowed|signup is disabled/i, "現在、新規登録を受け付けていません。"],
  [
    /rate limit|too many requests|security purposes.*after (\d+) seconds/i,
    "短い時間に何度も試されています。少し時間をおいてからもう一度お試しください。",
  ],
  [
    /token has expired|otp.*expired|link is invalid or has expired/i,
    "リンクの有効期限が切れています。もう一度やり直してください。",
  ],
  [/user not found/i, "このメールアドレスのアカウントが見つかりません。"],
  [
    /jwt expired|session.*(expired|missing)|not authenticated|unauthorized/i,
    "ログインの有効期限が切れました。もう一度ログインしてください。",
  ],
  [
    /failed to fetch|network ?error|load failed/i,
    "通信に失敗しました。電波の良いところで、もう一度お試しください。",
  ],
  [
    /server config missing|internal server error|status 5\d\d/i,
    "サーバーでエラーが起きました。少し時間をおいてからもう一度お試しください。",
  ],
];

const HAS_JAPANESE = /[぀-ヿ一-龯]/;

export function toJapaneseError(
  message: unknown,
  fallback = "エラーが発生しました。もう一度お試しください。",
): string {
  const text =
    message instanceof Error ? message.message : typeof message === "string" ? message : "";
  if (!text) return fallback;
  if (HAS_JAPANESE.test(text)) return text;
  for (const [re, ja] of RULES) {
    const m = text.match(re);
    if (m) return ja.replace("$1", m[1] ?? "");
  }
  return fallback;
}
