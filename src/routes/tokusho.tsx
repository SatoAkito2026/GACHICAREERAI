import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/LegalPage";

export const Route = createFileRoute("/tokusho")({
  head: () => ({
    meta: [
      { title: "特定商取引法に基づく表記 — インタビアAI｜AI面接・採用支援ツール" },
      { name: "description", content: "特定商取引法に基づく表記" },
    ],
  }),
  component: TokushoPage,
});

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[13px]" style={{ color: "#888888" }}>
        {label}
      </div>
      <div className="mt-0.5" style={{ color: "#F0F0F0" }}>
        {children}
      </div>
    </div>
  );
}

function TokushoPage() {
  return (
    <LegalPage title="特定商取引法に基づく表記">
      <LegalSection heading="事業者情報">
        <Item label="販売業者名">合同会社AKITOグループ</Item>
        <Item label="代表者名">佐藤光彪</Item>
        <Item label="所在地">東京都豊島区東池袋2丁目62番8号BIGオフィスプラザ池袋1206</Item>
        <Item label="電話番号">080-2420-4900（受付時間：平日10:00〜18:00）</Item>
        <Item label="メールアドレス">info@akitogroup.jp</Item>
      </LegalSection>

      <LegalSection heading="サービス名">
        <p>インタビアAI</p>
      </LegalSection>

      <LegalSection heading="サービスURL">
        <p>https://interview-copilot-ai.akitogroup.jp</p>
      </LegalSection>

      <LegalSection heading="サービス内容">
        <p>AIを活用した採用面接・書類選考支援ツール</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>AIによるリアルタイム面接質問生成・分析</li>
          <li>書類選考AI（履歴書の自動評価）</li>
          <li>面接レポートPDF出力</li>
          <li>面接・書類選考履歴管理</li>
        </ul>
      </LegalSection>

      <LegalSection heading="販売価格">
        <p style={{ color: "#F0F0F0", fontWeight: 600 }}>【個人・受験生向け】</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>無料プラン：0円</li>
          <li>ライトプラン：¥3,300/月（税込）</li>
          <li>プロプラン：¥5,500/月（税込）</li>
        </ul>
        <p className="mt-2" style={{ color: "#F0F0F0", fontWeight: 600 }}>
          【企業・学校向け】
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>従量課金プラン：¥2,200/回（税込）</li>
          <li>ライトプラン：¥33,000/月（税込）・AI面接20回/月込み・超過¥330/回（税込）</li>
          <li>プロプラン：¥55,000/月（税込）・超過¥330/回（税込）</li>
        </ul>
        <p className="mt-2" style={{ color: "#F0F0F0", fontWeight: 600 }}>
          独自AIアバター初期費用
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>従量課金：¥110,000（税込）</li>
          <li>ライト：¥77,000（税込）</li>
          <li>プロ：¥55,000（税込）</li>
        </ul>
        <p className="mt-2 text-[13px]" style={{ color: "#888888" }}>
          ※表示価格はすべて税込です。
        </p>
      </LegalSection>

      <LegalSection heading="支払方法">
        <p>クレジットカード（Visa・Mastercard・American Express・JCB）</p>
        <p>Stripe（Stripe, Inc.）を通じて安全に処理されます。</p>
      </LegalSection>

      <LegalSection heading="支払時期">
        <p>月額プラン：ご登録時に初回請求。以降毎月同日に自動更新。</p>
        <p>従量課金プラン：月末締め・翌月初旬に請求。</p>
      </LegalSection>

      <LegalSection heading="サービス提供時期">
        <p>お申し込み・決済完了後、即時ご利用いただけます。</p>
      </LegalSection>

      <LegalSection heading="返品・キャンセルについて">
        <p>
          デジタルコンテンツの性質上、原則として返金・返品はお受けしておりません。
          解約はマイページからいつでも行えます。
          解約後は当月末日までご利用いただけます。日割り返金はございません。
        </p>
      </LegalSection>

      <LegalSection heading="動作環境">
        <p>
          最新版のChrome・Safari・Firefox・Edgeにて動作確認済み。 インターネット接続環境が必要です。
        </p>
      </LegalSection>
    </LegalPage>
  );
}
