import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMode } from "@/hooks/use-mode";
import { supabase } from "@/integrations/supabase/client";

const WARRIOR_STAGES = [
  { min: 0, label: "はじまったばかり" },
  { min: 5, label: "見習い戦士になった" },
  { min: 15, label: "戦士として成長中" },
  { min: 30, label: "騎士として頼れる存在に" },
  { min: 50, label: "剣士キング。専属コーチとして完成度アップ" },
] as const;

const SCHOLAR_STAGES = [
  { min: 0, label: "はじまったばかり" },
  { min: 5, label: "見習い学生になった" },
  { min: 15, label: "学者として成長中" },
  { min: 30, label: "賢者として頼れる存在に" },
  { min: 50, label: "大賢者キング。専属コーチとして完成度アップ" },
] as const;

function getStage(count: number, stages: readonly { min: number; label: string }[]) {
  let idx = 0;
  stages.forEach((s, i) => {
    if (count >= s.min) idx = i;
  });
  const current = stages[idx];
  const next = stages[idx + 1];
  return { current, next, stageIndex: idx };
}

/** 個人モード: 進化する剣士キャラクター */
function Warrior({ stage }: { stage: number }) {
  const armorGrad = stage >= 4 ? "url(#gb-metalGold)" : "url(#gb-metalSilver)";
  const hasSword = stage >= 1;
  const hasCape = stage >= 2;
  const hasArmor = stage >= 2;
  const hasFullArmor = stage >= 3;
  const hasAura = stage >= 4;
  const hasSparkles = stage >= 4;
  const capeGrad = stage >= 4 ? "url(#gb-capeCrimson)" : stage === 2 ? "url(#gb-capeBlue)" : null;
  const swordLen = stage === 1 ? 24 : stage === 2 ? 32 : stage === 3 ? 38 : 48;
  const bladeGrad = stage >= 4 ? "url(#gb-metalGold)" : "url(#gb-metalSilver)";

  return (
    <svg width="72" height="94" viewBox="0 0 100 130" className="gb-float">
      <defs>
        <linearGradient id="gb-metalSilver" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F0F2F5" />
          <stop offset="45%" stopColor="#9AA3AF" />
          <stop offset="100%" stopColor="#4A5160" />
        </linearGradient>
        <linearGradient id="gb-metalGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFF3C4" />
          <stop offset="45%" stopColor="#E8B923" />
          <stop offset="100%" stopColor="#8A5A0A" />
        </linearGradient>
        <linearGradient id="gb-capeCrimson" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8A1F2A" />
          <stop offset="100%" stopColor="#3A0A10" />
        </linearGradient>
        <linearGradient id="gb-capeBlue" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3A5A8A" />
          <stop offset="100%" stopColor="#152A4A" />
        </linearGradient>
        <radialGradient id="gb-auraGold" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFE066" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#FFE066" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="gb-skinShade" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#F0C9A0" />
          <stop offset="100%" stopColor="#D8A878" />
        </radialGradient>
      </defs>

      <ellipse cx="50" cy="120" rx="22" ry="5" fill="#000000" opacity="0.35" />

      {hasAura && <circle cx="50" cy="65" r="52" fill="url(#gb-auraGold)" className="gb-aura" />}

      {hasCape &&
        (capeGrad ? (
          <>
            <path
              className="gb-cape-l"
              d="M36 50 Q10 85 22 118 L42 105 Q38 75 40 52 Z"
              fill={capeGrad}
            />
            <path
              className="gb-cape-r"
              d="M64 50 Q90 85 78 118 L58 105 Q62 75 60 52 Z"
              fill={capeGrad}
            />
          </>
        ) : (
          <>
            <path
              className="gb-cape-l"
              d="M37 52 Q18 82 27 110 L43 100 Q40 76 41 53 Z"
              fill="#3A425A"
            />
            <path
              className="gb-cape-r"
              d="M63 52 Q82 82 73 110 L57 100 Q60 76 59 53 Z"
              fill="#3A425A"
            />
          </>
        ))}

      <rect x="39" y="95" width="9" height="20" rx="3" fill="#3A3A45" />
      <rect x="52" y="95" width="9" height="20" rx="3" fill="#3A3A45" />
      {hasFullArmor && (
        <>
          <path d="M36 110 L50 106 L50 118 L34 118 Z" fill={armorGrad} />
          <path d="M64 110 L50 106 L50 118 L66 118 Z" fill={armorGrad} />
        </>
      )}

      <g className="gb-body">
        {hasArmor ? (
          <>
            <path d="M50 54 L72 62 L68 96 L32 96 L28 62 Z" fill={armorGrad} />
            <path d="M50 58 L64 64 L61 90 L39 90 L36 64 Z" fill="#1A1A22" opacity="0.25" />
            <path
              d="M50 60 L50 88"
              stroke={stage >= 4 ? "#FFE066" : "#D8D8E0"}
              strokeWidth="1.5"
              opacity="0.6"
            />
            {hasFullArmor && (
              <>
                <path d="M22 58 L32 54 L34 70 L22 74 Z" fill={armorGrad} />
                <path d="M78 58 L68 54 L66 70 L78 74 Z" fill={armorGrad} />
              </>
            )}
          </>
        ) : (
          <path d="M50 56 L68 64 L64 94 L36 94 L32 64 Z" fill="#8A8A8A" />
        )}

        {hasFullArmor && (
          <>
            <circle
              className="gb-gem"
              cx="50"
              cy="68"
              r="5"
              fill={stage >= 4 ? "#FF3B5C" : "#4AA8E0"}
            />
            <circle cx="50" cy="68" r="5" fill="none" stroke={armorGrad} strokeWidth="1.5" />
          </>
        )}

        <path
          d="M50 20 Q65 20 65 36 Q65 50 50 52 Q35 50 35 36 Q35 20 50 20 Z"
          fill="url(#gb-skinShade)"
        />

        {stage === 0 && <path d="M35 32 Q50 12 65 32 Q64 22 50 18 Q36 22 35 32" fill="#5A3A2A" />}
        {stage === 1 && <path d="M34 30 Q50 24 66 30 L66 24 Q50 18 34 24 Z" fill="#B5451F" />}
        {stage === 2 && (
          <>
            <path d="M32 30 Q50 6 68 30 Q64 16 50 12 Q36 16 32 30 Z" fill={armorGrad} />
            <path d="M46 8 L50 -2 L54 8 Z" fill={armorGrad} />
          </>
        )}
        {stage === 3 && (
          <>
            <path d="M30 30 Q50 2 70 30 Q66 12 50 8 Q34 12 30 30 Z" fill={armorGrad} />
            <path d="M44 8 L47 -6 L50 4 L53 -6 L56 8 Z" fill={armorGrad} />
          </>
        )}
        {stage >= 4 && (
          <>
            <path d="M28 30 Q50 -4 72 30 Q68 10 50 4 Q32 10 28 30 Z" fill="url(#gb-metalGold)" />
            <path d="M40 6 L44 -10 L50 0 L56 -10 L60 6 Z" fill="url(#gb-metalGold)" />
            <circle className="gb-gem" cx="50" cy="4" r="3" fill="#FF3B5C" />
          </>
        )}

        <g className="gb-eyes">
          <path d="M42 38 L48 38" stroke="#1A1A1A" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M52 38 L58 38" stroke="#1A1A1A" strokeWidth="2.4" strokeLinecap="round" />
        </g>
        {stage >= 3 && (
          <>
            <path
              d="M40 34 L48 36"
              stroke="#5A3A2A"
              strokeWidth="1.6"
              strokeLinecap="round"
              opacity="0.7"
            />
            <path
              d="M60 34 L52 36"
              stroke="#5A3A2A"
              strokeWidth="1.6"
              strokeLinecap="round"
              opacity="0.7"
            />
          </>
        )}
      </g>

      {hasSword && (
        <g className="gb-sword">
          {stage === 1 ? (
            <>
              <rect x="78" y={64 - swordLen} width="4" height={swordLen} rx="1.5" fill="#8A6A4A" />
              <rect x="73" y="63" width="14" height="3.5" rx="1.5" fill="#6A4A2A" />
            </>
          ) : (
            <>
              <path
                d={`M78 ${64 - swordLen} L82 ${64 - swordLen + 8} L80 64 L76 64 L74 ${64 - swordLen + 8} Z`}
                fill={bladeGrad}
              />
              <rect
                x="70"
                y="62"
                width="20"
                height="4"
                rx="1.5"
                fill={stage >= 4 ? "url(#gb-metalGold)" : "#5A5A66"}
              />
              <rect x="77" y="66" width="6" height="10" rx="1.5" fill="#4A2A1A" />
              <circle
                className="gb-gem"
                cx="80"
                cy="76"
                r="3"
                fill={stage >= 4 ? "#FF3B5C" : "#4AA8E0"}
              />
              {stage >= 4 && (
                <circle cx="80" cy={64 - swordLen} r="5" fill="#FFE066" opacity="0.7" />
              )}
            </>
          )}
        </g>
      )}

      {hasSparkles && (
        <>
          <circle className="gb-sparkle" cx="14" cy="45" r="2.2" fill="#FFE066" />
          <circle
            className="gb-sparkle"
            cx="88"
            cy="35"
            r="2.6"
            fill="#FFE066"
            style={{ animationDelay: "0.4s" }}
          />
          <circle
            className="gb-sparkle"
            cx="10"
            cy="80"
            r="1.8"
            fill="#FFE066"
            style={{ animationDelay: "0.8s" }}
          />
          <circle
            className="gb-sparkle"
            cx="90"
            cy="90"
            r="2"
            fill="#FFE066"
            style={{ animationDelay: "1.2s" }}
          />
        </>
      )}

      <style>{`
        .gb-float { animation: gb-float 3s ease-in-out infinite; }
        .gb-body { transform-origin: 50px 75px; animation: gb-breathe 2.4s ease-in-out infinite; }
        .gb-eyes { transform-origin: 50px 62px; animation: gb-blink 4.2s ease-in-out infinite; }
        .gb-cape-l { transform-origin: 38px 55px; animation: gb-sway-l 2.8s ease-in-out infinite; }
        .gb-cape-r { transform-origin: 62px 55px; animation: gb-sway-r 2.8s ease-in-out infinite; }
        .gb-sword { transform-origin: 80px 65px; animation: gb-glint 1.8s ease-in-out infinite; }
        .gb-aura { animation: gb-aura-pulse 2.2s ease-in-out infinite; }
        .gb-sparkle { animation: gb-sparkle 1.6s ease-in-out infinite; }
        .gb-gem { animation: gb-gem 2s ease-in-out infinite; }
        @keyframes gb-float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-3px); } }
        @keyframes gb-breathe { 0%, 100% { transform: scale(1, 1); } 50% { transform: scale(1.03, 0.98); } }
        @keyframes gb-blink { 0%, 90%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.1); } }
        @keyframes gb-sway-l { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(-6deg); } }
        @keyframes gb-sway-r { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(6deg); } }
        @keyframes gb-glint { 0%, 100% { opacity: 0.75; } 50% { opacity: 1; } }
        @keyframes gb-aura-pulse { 0%, 100% { opacity: 0.18; transform: scale(1); } 50% { opacity: 0.35; transform: scale(1.05); } }
        @keyframes gb-sparkle { 0%, 100% { opacity: 0.2; transform: scale(0.7); } 50% { opacity: 1; transform: scale(1.2); } }
        @keyframes gb-gem { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
      `}</style>
    </svg>
  );
}

/** 受験生モード: 進化する学者キャラクター */
function Scholar({ stage }: { stage: number }) {
  const hasBook = stage >= 1;
  const hasGlasses = stage >= 2;
  const hasStaff = stage >= 2;
  const hasFullRobe = stage >= 3;
  const hasHat = stage >= 3;
  const hasAura = stage >= 4;
  const hasStars = stage >= 4;
  const robeGrad =
    stage >= 4 ? "url(#sc-robeGold)" : stage >= 2 ? "url(#sc-robeIndigo)" : "url(#sc-robePurple)";
  const staffLen = stage === 2 ? 36 : stage === 3 ? 44 : 52;

  return (
    <svg width="72" height="94" viewBox="0 0 100 130" className="sc-float">
      <defs>
        <linearGradient id="sc-robePurple" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7A6FB5" />
          <stop offset="100%" stopColor="#382F6A" />
        </linearGradient>
        <linearGradient id="sc-robeGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E8D9A0" />
          <stop offset="100%" stopColor="#8A6A2A" />
        </linearGradient>
        <linearGradient id="sc-robeIndigo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4A5A9A" />
          <stop offset="100%" stopColor="#1A2050" />
        </linearGradient>
        <radialGradient id="sc-auraBlue" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#7DDCF5" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#7DDCF5" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="sc-skinShade" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#F0C9A0" />
          <stop offset="100%" stopColor="#D8A878" />
        </radialGradient>
        <radialGradient id="sc-orbGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="60%" stopColor="#7DDCF5" />
          <stop offset="100%" stopColor="#3A6A9A" />
        </radialGradient>
      </defs>

      <ellipse cx="50" cy="120" rx="22" ry="5" fill="#000000" opacity="0.35" />
      {hasAura && <circle cx="50" cy="65" r="52" fill="url(#sc-auraBlue)" className="sc-aura" />}

      <path className="sc-robe-l" d="M36 58 Q22 90 30 115 L46 108 Q42 80 42 60 Z" fill={robeGrad} />
      <path className="sc-robe-r" d="M64 58 Q78 90 70 115 L54 108 Q58 80 58 60 Z" fill={robeGrad} />

      <ellipse cx="42" cy="116" rx="7" ry="4" fill="#3A3A45" />
      <ellipse cx="58" cy="116" rx="7" ry="4" fill="#3A3A45" />

      <g className="sc-body">
        <path d="M50 56 L70 68 L64 106 L36 106 L30 68 Z" fill={robeGrad} />
        <path
          d="M50 60 L50 100"
          stroke={stage >= 4 ? "#FFE066" : "#B9AEE8"}
          strokeWidth="1.5"
          opacity="0.6"
        />
        {hasFullRobe && (
          <circle cx="50" cy="80" r="6" fill={stage >= 4 ? "#FFE066" : "#7DDCF5"} opacity="0.85" />
        )}

        {hasBook && (
          <>
            <rect
              x="30"
              y="86"
              width="16"
              height="12"
              rx="1.5"
              fill="#8A4A2A"
              transform="rotate(-8 38 92)"
            />
            <rect
              x="31"
              y="87"
              width="14"
              height="1.5"
              fill="#D8B878"
              transform="rotate(-8 38 92)"
            />
          </>
        )}

        <path
          d="M50 20 Q65 20 65 36 Q65 50 50 52 Q35 50 35 36 Q35 20 50 20 Z"
          fill="url(#sc-skinShade)"
        />
        <path d="M35 30 Q50 14 65 30 Q64 20 50 17 Q36 20 35 30" fill="#5A5A5A" />

        {hasHat &&
          (stage >= 4 ? (
            <>
              <path d="M28 22 L50 4 L72 22 Q60 16 50 16 Q40 16 28 22 Z" fill={robeGrad} />
              <circle cx="50" cy="6" r="3" fill="#FFE066" />
            </>
          ) : (
            <>
              <rect x="30" y="14" width="40" height="6" rx="1" fill={robeGrad} />
              <path d="M35 14 L50 2 L65 14 Z" fill={robeGrad} />
            </>
          ))}

        {hasGlasses && (
          <>
            <circle cx="44" cy="38" r="5" fill="none" stroke="#2A2A2A" strokeWidth="1.4" />
            <circle cx="56" cy="38" r="5" fill="none" stroke="#2A2A2A" strokeWidth="1.4" />
            <path d="M49 38 L51 38" stroke="#2A2A2A" strokeWidth="1.4" />
          </>
        )}

        <g className="sc-eyes">
          <circle cx="44" cy="38" r="2" fill="#1A1A1A" />
          <circle cx="56" cy="38" r="2" fill="#1A1A1A" />
        </g>

        {stage >= 3 && <path d="M40 46 Q50 58 60 46 Q56 52 50 52 Q44 52 40 46" fill="#D8D8D8" />}
      </g>

      {hasStaff && (
        <g className="sc-staff">
          <rect x="78" y={104 - staffLen} width="3.5" height={staffLen} rx="1.5" fill="#6A4A2A" />
          <circle cx="79.5" cy={104 - staffLen} r="7" fill="url(#sc-orbGlow)" className="sc-orb" />
        </g>
      )}

      {hasStars && (
        <>
          <path
            className="sc-star"
            d="M16 42 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5 Z"
            fill="#FFE066"
          />
          <path
            className="sc-star"
            d="M86 32 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5 Z"
            fill="#7DDCF5"
            style={{ animationDelay: "0.5s" }}
          />
          <path
            className="sc-star"
            d="M12 78 l1 3 3 1 -3 1 -1 3 -1 -3 -3 -1 3 -1 Z"
            fill="#FFE066"
            style={{ animationDelay: "1s" }}
          />
          <path
            className="sc-star"
            d="M90 88 l1 3 3 1 -3 1 -1 3 -1 -3 -3 -1 3 -1 Z"
            fill="#7DDCF5"
            style={{ animationDelay: "1.4s" }}
          />
        </>
      )}

      <style>{`
        .sc-float { animation: sc-float 3s ease-in-out infinite; }
        .sc-body { transform-origin: 50px 75px; animation: sc-breathe 2.4s ease-in-out infinite; }
        .sc-eyes { transform-origin: 50px 62px; animation: sc-blink 4.2s ease-in-out infinite; }
        .sc-robe-l { transform-origin: 38px 60px; animation: sc-sway-l 3s ease-in-out infinite; }
        .sc-robe-r { transform-origin: 62px 60px; animation: sc-sway-r 3s ease-in-out infinite; }
        .sc-staff { transform-origin: 80px 100px; animation: sc-glow 2s ease-in-out infinite; }
        .sc-aura { animation: sc-aura-pulse 2.4s ease-in-out infinite; }
        .sc-star { animation: sc-star 2s ease-in-out infinite; }
        .sc-orb { animation: sc-orb-pulse 1.8s ease-in-out infinite; }
        @keyframes sc-float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-3px); } }
        @keyframes sc-breathe { 0%, 100% { transform: scale(1, 1); } 50% { transform: scale(1.03, 0.98); } }
        @keyframes sc-blink { 0%, 90%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.1); } }
        @keyframes sc-sway-l { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(-4deg); } }
        @keyframes sc-sway-r { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(4deg); } }
        @keyframes sc-glow { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }
        @keyframes sc-aura-pulse { 0%, 100% { opacity: 0.15; transform: scale(1); } 50% { opacity: 0.3; transform: scale(1.05); } }
        @keyframes sc-star { 0%, 100% { opacity: 0.3; transform: scale(0.7) rotate(0deg); } 50% { opacity: 1; transform: scale(1.2) rotate(20deg); } }
        @keyframes sc-orb-pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
      `}</style>
    </svg>
  );
}

export function GrowthBadge() {
  const { session } = useAuth();
  const { mode } = useMode();
  const [count, setCount] = useState<number | null>(null);
  const dbMode = mode === "private_student" ? "student" : "individual";

  useEffect(() => {
    if (!session || !mode) return;
    (async () => {
      const { count: c } = await (
        supabase
          .from("daily_question_responses")
          .select("*", { count: "exact", head: true })
          .eq("user_id", session.user.id) as any
      ).eq("mode", dbMode);
      setCount(c ?? 0);
    })();
  }, [session, mode, dbMode]);

  if (count === null) return null;

  const isStudent = mode === "private_student";
  const stages = isStudent ? SCHOLAR_STAGES : WARRIOR_STAGES;
  const { current, next, stageIndex } = getStage(count, stages);
  const progressToNext = next
    ? Math.min(100, Math.round(((count - current.min) / (next.min - current.min)) * 100))
    : 100;
  const progressColor = isStudent ? "#7DDCF5" : "#FFE066";

  return (
    <div
      className="mx-auto mt-6 flex max-w-md items-center gap-4 rounded-2xl p-4"
      style={{ background: "#1A1A1A", border: "1px solid #2A2A2A" }}
    >
      {isStudent ? <Scholar stage={stageIndex} /> : <Warrior stage={stageIndex} />}
      <div className="flex-1">
        <p style={{ color: "#F0F0F0", fontSize: 14, fontWeight: 700 }}>{current.label}</p>
        <p style={{ color: "#888888", fontSize: 12 }}>
          これまでの回答数：{count}問{next && ` ／ 次の成長まであと${next.min - count}問`}
        </p>
        {next && (
          <div
            className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: "#2A2A2A" }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${progressToNext}%`, background: progressColor }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
