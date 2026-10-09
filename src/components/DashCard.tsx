import { Link } from "@tanstack/react-router";

export interface DashCardData {
  emoji: string;
  title: string;
  desc: string;
  to: string;
  comingSoon?: boolean;
}

// スマホは2列の小さめのカード、タブレット・パソコンは大きめのカードにする
export function DashGrid({
  title,
  subtitle,
  cards,
}: {
  title: string;
  subtitle?: string;
  cards: DashCardData[];
}) {
  return (
    <main className="px-3 py-6 sm:px-4 md:py-12">
      <div className="text-center">
        <h1 className="text-[22px] md:text-[26px]" style={{ color: "#F0F0F0", fontWeight: 700 }}>
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 text-[13px] md:text-[14px]" style={{ color: "#CCCCCC" }}>
            {subtitle}
          </p>
        )}
      </div>
      <div
        className="mx-auto mt-5 grid grid-cols-2 gap-3 sm:gap-4 md:mt-10 md:gap-6"
        style={{ maxWidth: 800 }}
      >
        {cards.map((card) => (
          <DashCard key={card.to} {...card} />
        ))}
      </div>
    </main>
  );
}

export function DashCard({ emoji, title, desc, to, comingSoon }: DashCardData) {
  const content = (
    <>
      <div className="flex items-center justify-between">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-[10px] text-[22px] md:h-14 md:w-14 md:rounded-xl md:text-[32px]"
          style={{ background: "#222" }}
        >
          {emoji}
        </div>
        {comingSoon && (
          <span
            style={{
              background: "#C8FF00",
              color: "#0F0F0F",
              fontSize: 10,
              fontWeight: 700,
              borderRadius: 6,
              padding: "3px 8px",
            }}
          >
            近日公開
          </span>
        )}
      </div>
      <h2
        className="mt-3 text-[15px] leading-snug md:mt-4 md:text-[18px]"
        style={{ color: "#F0F0F0", fontWeight: 700 }}
      >
        {title}
      </h2>
      <p
        className="mt-1.5 flex-1 text-[12px] leading-relaxed md:mt-2 md:text-[14px]"
        style={{ color: "#CCCCCC" }}
      >
        {desc}
      </p>
      {!comingSoon && (
        <span
          className="mt-3 text-[13px] md:mt-4 md:text-[14px]"
          style={{ color: "#C8FF00", fontWeight: 500 }}
        >
          始める →
        </span>
      )}
    </>
  );

  const className =
    "flex min-h-[150px] flex-col rounded-xl p-4 md:min-h-[180px] md:rounded-2xl md:p-8";
  const cardStyle = {
    background: "#1A1A1A",
    border: "1px solid #C8FF00",
    opacity: comingSoon ? 0.6 : 1,
  } as const;

  if (comingSoon) {
    return (
      <div className={className} style={cardStyle}>
        {content}
      </div>
    );
  }

  return (
    <Link to={to} className={`${className} transition-all hover:opacity-90`} style={cardStyle}>
      {content}
    </Link>
  );
}
