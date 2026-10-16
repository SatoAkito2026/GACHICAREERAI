/**
 * 生徒：学校・塾とつながる（マイページ）
 * 招待コードを入力すると、その学校の先生があなたの模擬面接の結果を見られるようになる。いつでも抜けられる。
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { talentApi } from "@/components/talent/TalentUI";

type School = { id: string; name: string; displayName: string; joinedAt: string };

export function SchoolLinkCard() {
  const [schools, setSchools] = useState<School[] | null>(null);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);

  const load = () =>
    void talentApi<{ schools: School[] }>("/api/school/join").then((r) => {
      if (r.ok) setSchools(r.data.schools);
    });
  useEffect(load, []);

  const join = async () => {
    setSending(true);
    const r = await talentApi<{ schoolName: string }>("/api/school/join", { code, name });
    setSending(false);
    if (!r.ok) {
      toast.error(r.data.error ?? "参加に失敗しました");
      return;
    }
    toast.success(`${r.data.schoolName} とつながりました`);
    setOpen(false);
    setCode("");
    load();
  };

  const leave = async (s: School) => {
    if (!window.confirm(`${s.name} から抜けます。先生はあなたの練習の結果を見られなくなります。`))
      return;
    const r = await talentApi("/api/school/join", { action: "leave", schoolId: s.id });
    if (r.ok) load();
  };

  const input = {
    background: "#0F0F0F",
    border: "1px solid #333",
    color: "#F0F0F0",
  } as const;

  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      <p className="text-[12px]" style={{ color: "#888888", lineHeight: 1.7 }}>
        学校・塾の招待コードを入力すると、先生があなたの模擬面接の回数・点数・フィードバックを見られるようになります。いつでも抜けられます。
      </p>
      {schools?.map((s) => (
        <div key={s.id} className="flex items-center justify-between gap-3">
          <span className="text-[14px]" style={{ color: "#F0F0F0" }}>
            {s.name}
            <span className="ml-2 text-[12px]" style={{ color: "#888888" }}>
              （{s.displayName} として参加中）
            </span>
          </span>
          <button
            type="button"
            onClick={() => void leave(s)}
            className="shrink-0 text-[12px]"
            style={{ color: "#FF6B6B" }}
          >
            抜ける
          </button>
        </div>
      ))}
      {open ? (
        <div className="flex flex-col gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="招待コード（例：AB3D5F）"
            maxLength={12}
            className="rounded-lg px-3 py-2.5 text-[14px] uppercase outline-none"
            style={input}
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="先生に表示する名前"
            maxLength={50}
            className="rounded-lg px-3 py-2.5 text-[14px] outline-none"
            style={input}
          />
          <button
            type="button"
            disabled={sending || !code.trim() || !name.trim()}
            onClick={() => void join()}
            className="rounded-lg py-2.5 text-[14px] disabled:opacity-50"
            style={{ background: "#C8FF00", color: "#0F0F0F", fontWeight: 700 }}
          >
            {sending ? "送信中..." : "つながる"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="self-start rounded-lg px-4 py-2 text-[13px]"
          style={{ border: "1px solid #333", color: "#C8FF00", fontWeight: 600 }}
        >
          ＋ 招待コードを入力する
        </button>
      )}
    </div>
  );
}
