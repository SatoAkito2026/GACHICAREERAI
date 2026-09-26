import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/LegalPage";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "利用規約 — インタビアAI｜AI面接・採用支援ツール" },
      { name: "description", content: "インタビアAI｜AI面接・採用支援ツールの利用規約" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage title="利用規約">
      <p>
        本利用規約（以下「本規約」）は、合同会社AKITOグループ（以下「当社」）が提供する
        「インタビアAI」（以下「本サービス」）の利用条件を定めるものです。
        本サービスをご利用いただく前に、本規約をよくお読みください。
      </p>

      <LegalSection heading="第1条（適用）">
        <p>
          本規約は、本サービスの利用に関する当社と利用者との間の一切の関係に適用されます。
          本サービスにアクセスまたは利用した時点で、本規約に同意したものとみなします。
        </p>
      </LegalSection>

      <LegalSection heading="第2条（サービス内容）">
        <p>本サービスは、以下の機能を提供するAI採用・面接支援ツールです。</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>AIによるリアルタイム面接質問生成・回答分析</li>
          <li>書類選考AI（履歴書PDFの自動評価・ランキング）</li>
          <li>面接URL発行・AIアバター面接（Phase 3提供予定）</li>
          <li>面接レポートのPDF出力</li>
          <li>面接・書類選考履歴の保存・管理</li>
        </ul>
        <p>各機能の利用可否はご契約プランによって異なります。</p>
      </LegalSection>

      <LegalSection heading="第3条（プランと料金）">
        <p>本サービスは以下のプランを提供します。</p>
        <p className="mt-2" style={{ color: "#F0F0F0", fontWeight: 600 }}>
          【個人・受験生向け】
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>無料プラン：0円・AI面接2回/月</li>
          <li>ライトプラン：¥2,200/月（税込）・AI面接15回/月</li>
          <li>プロプラン：¥5,500/月（税込）・AI面接25回/月</li>
        </ul>
        <p className="mt-2" style={{ color: "#F0F0F0", fontWeight: 600 }}>
          【企業・学校向け】
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>従量課金プラン：月額なし・AI面接¥2,200/回（税込）</li>
          <li>ライトプラン：¥33,000/月（税込）・AI面接20回/月込み・超過¥330/回（税込）</li>
          <li>プロプラン：¥55,000/月（税込）・AI面接50回/月込み・超過¥330/回（税込）</li>
        </ul>
        <p>書類選考AIは企業・学校向け全プランで無料・無制限でご利用いただけます。</p>
        <p className="mt-2" style={{ color: "#F0F0F0", fontWeight: 600 }}>
          独自AIアバター初期費用
        </p>
        <p>従量課金¥110,000・ライト¥77,000・プロ¥55,000（いずれも税込）</p>
        <p>料金は予告なく変更される場合があります。</p>
      </LegalSection>

      <LegalSection heading="第4条（支払い）">
        <p>
          月額プランの料金は、Stripe（Stripe, Inc.）を通じてクレジットカードにて決済されます。
          毎月自動更新となります。 従量課金プランは月末締めで翌月に請求されます。
          支払いに関する問題はinfo@akitogroup.jpまでお問い合わせください。
        </p>
      </LegalSection>

      <LegalSection heading="第5条（解約）">
        <p>
          いつでも解約できます。解約後は当月末まで本サービスをご利用いただけます。
          日割り返金は行っておりません。
        </p>
      </LegalSection>

      <LegalSection heading="第6条（禁止事項）">
        <p>利用者は以下の行為を行ってはなりません。</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>法令または公序良俗に違反する行為</li>
          <li>当社または第三者の知的財産権を侵害する行為</li>
          <li>本サービスを不正に利用する行為</li>
          <li>他の利用者・第三者に迷惑をかける行為</li>
          <li>本サービスのシステムに過度の負荷をかける行為</li>
        </ul>
      </LegalSection>

      <LegalSection heading="第7条（免責事項）">
        <p>
          当社は、本サービスを通じて生成されるAIの出力内容について、
          その正確性・完全性・有用性を保証しません。
          採用・不採用の最終判断は必ず人間が行ってください。
          本サービスの利用により生じた損害について、当社は責任を負いません。
        </p>
      </LegalSection>

      <LegalSection heading="第8条（個人情報）">
        <p>個人情報の取扱いについては、別途定めるプライバシーポリシーに従います。</p>
      </LegalSection>

      <LegalSection heading="第9条（規約の変更）">
        <p>
          当社は、必要に応じて本規約を変更することがあります。
          変更後の規約は本サービス上に掲載した時点から効力を生じます。
        </p>
      </LegalSection>

      <LegalSection heading="第10条（準拠法・管轄）">
        <p>
          本規約は日本法に準拠します。
          本サービスに関する紛争は、東京地方裁判所を第一審の専属的合意管轄裁判所とします。
        </p>
      </LegalSection>

      <p className="mt-6 text-sm" style={{ color: "#888888" }}>
        制定日：2026年6月25日
        <br />
        運営：合同会社AKITOグループ
      </p>
    </LegalPage>
  );
}
