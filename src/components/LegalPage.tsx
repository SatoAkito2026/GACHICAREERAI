import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen"
      style={{ background: "#0F0F0F", fontFamily: "'Inter', sans-serif" }}
    >
      <nav
        className="fixed inset-x-0 top-0 z-30 flex h-[52px] items-center justify-between border-b bg-[#0F0F0F] px-6"
        style={{ borderColor: "#2A2A2A" }}
      >
        <div className="text-[15px]" style={{ fontWeight: 500, color: "#F0F0F0" }}>
          ガチキャリAI｜AI面接・採用支援ツール
        </div>
        <Link
          to="/mypage"
          className="flex items-center gap-1 text-[12px] transition-colors hover:text-[#F0F0F0]"
          style={{ color: "#888888", fontWeight: 500 }}
        >
          <ArrowLeft size={14} />
          戻る
        </Link>
      </nav>

      <main className="mx-auto max-w-2xl px-6 pb-24 pt-[84px]">
        <h1 className="text-[24px]" style={{ fontWeight: 600, color: "#F0F0F0" }}>
          {title}
        </h1>
        <div className="mt-6 space-y-6 text-[14px] leading-relaxed" style={{ color: "#C8C8C8" }}>
          {children}
        </div>
      </main>
    </div>
  );
}

export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 text-[15px]" style={{ color: "#C8FF00", fontWeight: 700 }}>
        {heading}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
