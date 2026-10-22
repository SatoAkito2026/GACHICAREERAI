# Supabase の確認メールを日本語にする

Supabase の管理画面で **Authentication → Emails（Email Templates）** を開き、種類ごとに「Subject（件名）」と「Message body（本文）」を下のものに入れ替えて「Save」を押す。

- 本文の `{{ .ConfirmationURL }}` は Supabase が自動でリンクに置き換えるので、そのまま残す
- 送信元の名前・アドレスを「ガチキャリAI <info@akitogroup.jp>」にしたい場合は、**Authentication → Emails → SMTP Settings** で Resend の SMTP（host `smtp.resend.com`、port `465`、user `resend`、password は Resend の API キー）を設定する。Supabase の標準の送信は1時間あたりの通数が少ないので、利用者が増える前に設定しておくのがよい

## Confirm signup（登録の確認）

件名：`【ガチキャリAI】メールアドレスの確認`

```html
<div style="font-family:sans-serif;background:#f5f5f5;padding:24px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;color:#222;font-size:14px;line-height:1.7">
<p style="font-weight:bold;font-size:16px;margin:0 0 16px">ガチキャリAIへようこそ</p>
<p style="margin:0 0 12px">ご登録ありがとうございます。</p>
<p style="margin:0 0 12px">下のボタンを押して、メールアドレスの確認を完了してください。</p>
<p style="margin:24px 0"><a href="{{ .ConfirmationURL }}" style="background:#111;color:#C8FF00;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">メールアドレスを確認する</a></p>
<p style="color:#888;font-size:12px;margin:0">このメールに心当たりがない場合は、何もせずに削除してください。</p>
<p style="color:#888;font-size:12px;margin:8px 0 0">ガチキャリAI（合同会社AKITOグループ）</p>
</div></div>
```

## Invite user（招待）

件名：`【ガチキャリAI】招待が届いています`

```html
<div style="font-family:sans-serif;background:#f5f5f5;padding:24px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;color:#222;font-size:14px;line-height:1.7">
<p style="font-weight:bold;font-size:16px;margin:0 0 16px">ガチキャリAIに招待されました</p>
<p style="margin:0 0 12px">ガチキャリAIへの招待が届いています。</p>
<p style="margin:0 0 12px">下のボタンを押して、アカウントを作成してください。</p>
<p style="margin:24px 0"><a href="{{ .ConfirmationURL }}" style="background:#111;color:#C8FF00;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">招待を受ける</a></p>
<p style="color:#888;font-size:12px;margin:0">このメールに心当たりがない場合は、何もせずに削除してください。</p>
<p style="color:#888;font-size:12px;margin:8px 0 0">ガチキャリAI（合同会社AKITOグループ）</p>
</div></div>
```

## Magic Link（ログインのリンク）

件名：`【ガチキャリAI】ログイン用のリンク`

```html
<div style="font-family:sans-serif;background:#f5f5f5;padding:24px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;color:#222;font-size:14px;line-height:1.7">
<p style="font-weight:bold;font-size:16px;margin:0 0 16px">ログイン用のリンク</p>
<p style="margin:0 0 12px">下のボタンを押すと、ガチキャリAIにログインできます。</p>
<p style="margin:0 0 12px">このリンクは一定時間で使えなくなります。</p>
<p style="margin:24px 0"><a href="{{ .ConfirmationURL }}" style="background:#111;color:#C8FF00;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">ログインする</a></p>
<p style="color:#888;font-size:12px;margin:0">ログインしようとしていない場合は、このメールを削除してください。</p>
<p style="color:#888;font-size:12px;margin:8px 0 0">ガチキャリAI（合同会社AKITOグループ）</p>
</div></div>
```

## Change Email Address（メールアドレスの変更）

件名：`【ガチキャリAI】メールアドレス変更の確認`

```html
<div style="font-family:sans-serif;background:#f5f5f5;padding:24px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;color:#222;font-size:14px;line-height:1.7">
<p style="font-weight:bold;font-size:16px;margin:0 0 16px">メールアドレス変更の確認</p>
<p style="margin:0 0 12px">メールアドレスの変更を受け付けました。</p>
<p style="margin:0 0 12px">下のボタンを押して、新しいメールアドレスを確認してください。</p>
<p style="margin:24px 0"><a href="{{ .ConfirmationURL }}" style="background:#111;color:#C8FF00;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">変更を確認する</a></p>
<p style="color:#888;font-size:12px;margin:0">心当たりがない場合は、このメールを削除し、パスワードを変更してください。</p>
<p style="color:#888;font-size:12px;margin:8px 0 0">ガチキャリAI（合同会社AKITOグループ）</p>
</div></div>
```

## Reset Password（パスワードの再設定）

件名：`【ガチキャリAI】パスワードの再設定`

```html
<div style="font-family:sans-serif;background:#f5f5f5;padding:24px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;color:#222;font-size:14px;line-height:1.7">
<p style="font-weight:bold;font-size:16px;margin:0 0 16px">パスワードの再設定</p>
<p style="margin:0 0 12px">パスワードの再設定を受け付けました。</p>
<p style="margin:0 0 12px">下のボタンを押して、新しいパスワードを設定してください。</p>
<p style="margin:24px 0"><a href="{{ .ConfirmationURL }}" style="background:#111;color:#C8FF00;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">パスワードを再設定する</a></p>
<p style="color:#888;font-size:12px;margin:0">パスワードの再設定を申し込んでいない場合は、このメールを削除してください。パスワードは変わりません。</p>
<p style="color:#888;font-size:12px;margin:8px 0 0">ガチキャリAI（合同会社AKITOグループ）</p>
</div></div>
```

## Reauthentication（本人確認）

件名：`【ガチキャリAI】確認コード`

```html
<div style="font-family:sans-serif;background:#f5f5f5;padding:24px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;color:#222;font-size:14px;line-height:1.7">
<p style="font-weight:bold;font-size:16px;margin:0 0 16px">確認コード</p>
<p style="margin:0 0 12px">次のコードを画面に入力してください。</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:4px;margin:16px 0">{{ .Token }}</p>
<p style="color:#888;font-size:12px;margin:0">心当たりがない場合は、このメールを削除してください。</p>
<p style="color:#888;font-size:12px;margin:8px 0 0">ガチキャリAI（合同会社AKITOグループ）</p>
</div></div>
```
