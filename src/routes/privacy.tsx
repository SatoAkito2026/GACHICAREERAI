import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/LegalPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "プライバシーポリシー — ガチキャリAI｜AI面接・採用支援ツール" },
      {
        name: "description",
        content: "ガチキャリAI｜AI面接・採用支援ツールのプライバシーポリシー",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage title="プライバシーポリシー">
      <p>
        合同会社AKITOグループ（以下「当社」）は、「ガチキャリAI」（以下「本サービス」）における
        利用者の個人情報の取扱いについて、以下のとおり定めます。
      </p>

      <LegalSection heading="1. 事業者情報">
        <p>会社名：合同会社AKITOグループ</p>
        <p>代表者：佐藤光彪</p>
        <p>所在地：東京都豊島区東池袋2丁目62番8号BIGオフィスプラザ池袋1206</p>
        <p>メール：info@akitogroup.jp</p>
      </LegalSection>

      <LegalSection heading="2. 取得する情報">
        <p>当社は以下の情報を取得します。</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>メールアドレス・パスワード（認証情報）</li>
          <li>会社名・学校名・業種等の組織情報</li>
          <li>面接・書類選考の利用履歴</li>
          <li>決済情報（Stripeを通じて処理。カード番号は当社サーバーに保存しません）</li>
          <li>アクセスログ・利用状況</li>
        </ul>
      </LegalSection>

      <LegalSection heading="3. 利用目的">
        <p>取得した情報は以下の目的で利用します。</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>本サービスの提供・運営・改善</li>
          <li>ご本人確認・認証</li>
          <li>料金の請求・決済処理</li>
          <li>お問い合わせ対応</li>
          <li>利用状況の分析・統計処理</li>
        </ul>
      </LegalSection>

      <LegalSection heading="4. 第三者提供">
        <p>
          法令に基づく場合を除き、ご本人の同意なく個人情報を第三者に提供しません。
          ただし以下のサービスを利用しており、各社のプライバシーポリシーが適用されます。
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Supabase（データベース・認証）</li>
          <li>Stripe（決済処理）</li>
          <li>Anthropic（AI処理）</li>
          <li>Cloudflare（ホスティング）</li>
        </ul>
      </LegalSection>

      <LegalSection heading="5. 保存期間">
        <p>
          個人情報は、利用目的の達成に必要な期間保存します。
          退会後は速やかに削除または匿名化します。
        </p>
      </LegalSection>

      <LegalSection heading="6. 安全管理">
        <p>
          当社は、個人情報の漏えい・滅失等を防止するため、
          適切な技術的・組織的安全管理措置を講じます。
        </p>
      </LegalSection>

      <LegalSection heading="7. 開示・訂正・削除">
        <p>
          ご自身の個人情報の開示・訂正・削除をご希望の場合は、 info@akitogroup.jp
          までお問い合わせください。 本人確認の上、合理的な期間内に対応します。
        </p>
      </LegalSection>

      <LegalSection heading="8. Cookieについて">
        <p>
          本サービスはセッション管理のためCookieを使用します。
          ブラウザの設定でCookieを無効にすることができますが、
          一部機能が利用できなくなる場合があります。
        </p>
      </LegalSection>

      <LegalSection heading="9. お問い合わせ">
        <p>個人情報の取扱いに関するお問い合わせは info@akitogroup.jp までご連絡ください。</p>
      </LegalSection>

      <p className="mt-6 text-sm" style={{ color: "#888888" }}>
        制定日：2026年6月25日
        <br />
        運営：合同会社AKITOグループ
      </p>
    </LegalPage>
  );
}
