import { Link } from "@tanstack/react-router";

export interface DashCardData {
  emoji: string;
  title: string;
  desc: string;
  to: string;
  comingSoon?: boolean;
}

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
    <main className="px-4 py-12">
      <div className="text-center">
        <h1 style={{ color: "#F0F0F0", fontSize: 26, fontWeight: 700 }}>{title}</h1>
        {subtitle && (
          <p className="mt-2" style={{ color: "#CCCCCC", fontSize: 14 }}>
            {subtitle}
          </p>
        )}
      </div>
      <div
        className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2"
        style={{ maxWidth: 800, margin: "40px auto 0" }}
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
          className="flex items-center justify-center"
          style={{ width: 56, height: 56, background: "#222", borderRadius: 12, fontSize: 32 }}
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
      <h2 className="mt-4" style={{ color: "#F0F0F0", fontSize: 18, fontWeight: 700 }}>
        {title}
      </h2>
      <p className="mt-2 flex-1" style={{ color: "#CCCCCC", fontSize: 14 }}>
        {desc}
      </p>
      {!comingSoon && (
        <span className="mt-4" style={{ color: "#C8FF00", fontSize: 14, fontWeight: 500 }}>
          始める →
        </span>
      )}
    </>
  );

  const cardStyle = {
    background: "#1A1A1A",
    border: "1px solid #C8FF00",
    borderRadius: 16,
    padding: 32,
    minHeight: 180,
    opacity: comingSoon ? 0.6 : 1,
  } as const;

  if (comingSoon) {
    return (
      <div className="flex flex-col" style={cardStyle}>
        {content}
      </div>
    );
  }

  return (
    <Link to={to} className="flex flex-col transition-all hover:opacity-90" style={cardStyle}>
      {content}
    </Link>
  );
}
