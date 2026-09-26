export default function ComingSoon({ title }: { title: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center px-6"
      style={{ minHeight: "calc(100vh - 100px)" }}
    >
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
      <h1 className="mt-4 text-[26px]" style={{ fontWeight: 700, color: "#F0F0F0" }}>
        {title}
      </h1>
      <p className="mt-3 text-[14px]" style={{ color: "#CCCCCC" }}>
        この機能は近日公開予定です。
      </p>
    </div>
  );
}
