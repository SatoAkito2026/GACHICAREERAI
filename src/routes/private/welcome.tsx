import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useAuth, registerDevice } from "@/hooks/use-auth";

export const Route = createFileRoute("/private/welcome")({
  head: () => ({ meta: [{ title: "登録完了｜インタビアAI" }] }),
  component: WelcomePage,
});

function WelcomePage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const registeredRef = useRef(false);

  // メール確認リンク経由でここに来た場合、ログインフォームを通らないため
  // どこからもregisterDeviceが呼ばれていない。ここで一度だけ呼んでおく。
  useEffect(() => {
    if (!registeredRef.current && session?.access_token) {
      registeredRef.current = true;
      void registerDevice(session.access_token);
    }
  }, [session?.access_token]);

  if (loading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: "#0F0F0F" }}
      >
        <p className="text-sm" style={{ color: "#888888" }}>
          読み込み中...
        </p>
      </div>
    );
  }
  if (!session) return <Navigate to="/login" />;

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6 text-center"
      style={{ background: "#0F0F0F", fontFamily: "'Inter', sans-serif" }}
    >
      <span
        style={{
          background: "#C8FF00",
          color: "#0F0F0F",
          fontSize: 12,
          fontWeight: 700,
          borderRadius: 999,
          padding: "6px 14px",
          letterSpacing: 0.5,
        }}
      >
        🎉 登録完了
      </span>
      <h1 className="mt-5 text-[28px]" style={{ fontWeight: 700, color: "#F0F0F0" }}>
        ようこそ、インタビアAIへ
      </h1>
      <p className="mt-3 max-w-md text-[14px] leading-relaxed" style={{ color: "#CCCCCC" }}>
        まずはどちらで使うか選んでください。
        <br />
        それぞれに合わせた質問でプロフィールを作ります。
      </p>

      <div className="mt-8 flex w-full max-w-sm flex-col gap-3">
        <button
          onClick={() => navigate({ to: "/private/individual/onboarding" })}
          className="rounded-full px-8 py-4 text-[15px] transition-opacity hover:opacity-90"
          style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
        >
          👤 個人（就活・転職）ではじめる
        </button>
        <button
          onClick={() => navigate({ to: "/private/student/onboarding" })}
          className="rounded-full px-8 py-4 text-[15px] transition-opacity hover:opacity-90"
          style={{
            background: "#1A1A1A",
            color: "#F0F0F0",
            border: "1px solid #2A2A2A",
            fontWeight: 700,
          }}
        >
          🎓 受験生（入試対策）ではじめる
        </button>
      </div>
    </div>
  );
}
