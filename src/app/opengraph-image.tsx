import { ImageResponse } from "next/og";

// The preview card shown when a Saathi link is shared on WhatsApp, X, LinkedIn, etc.
export const alt = "Saathi: care for your elders, together";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PILLS = ["Medicine reminders", "Missed-dose alerts", "Shared family circle", "AI prescription scan"];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background: "linear-gradient(180deg, #f0fdfa 0%, #fafaf9 55%)",
          color: "#1c1917",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          <svg width="64" height="64" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="9" fill="#0f766e" />
            <path
              d="M16 24.5s-7.5-4.6-7.5-10.1A4.2 4.2 0 0 1 16 12a4.2 4.2 0 0 1 7.5 2.4c0 5.5-7.5 10.1-7.5 10.1Z"
              fill="#fff"
            />
          </svg>
          <span style={{ fontSize: "44px", fontWeight: 600, letterSpacing: "-1px" }}>Saathi</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
          <div style={{ fontSize: "80px", lineHeight: 1.04, letterSpacing: "-3px", maxWidth: "960px" }}>
            Care for the people who cared for you.
          </div>
          <div style={{ fontSize: "32px", color: "#57534e", maxWidth: "900px" }}>
            Medicines, doses and doctor visits in one shared family care circle.
          </div>
        </div>
        <div style={{ display: "flex", gap: "14px" }}>
          {PILLS.map((pill) => (
            <div
              key={pill}
              style={{
                display: "flex",
                padding: "10px 22px",
                borderRadius: "999px",
                background: "#ffffff",
                border: "1px solid #e7e5e4",
                fontSize: "24px",
                color: "#44403c",
              }}
            >
              {pill}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
