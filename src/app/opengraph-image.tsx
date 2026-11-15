import { ImageResponse } from "next/og";
import { LOGO_MARK_DATA_URI } from "@/lib/brand";

// The preview card shown when a Saathi link is shared on WhatsApp, X, LinkedIn, etc.
export const alt = "Saathi: care for your elders, together";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PILLS = ["Smart missed-dose escalation", "Voice-first Elderly mode", "AI health insights"];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background: "radial-gradient(circle at 85% 20%, #ccfbf1 0%, #f0fdfa 30%, #fafaf9 60%)",
          color: "#1c1917",
        }}
      >
        {/* A two-tone capsule, echoing the logo. */}
        <div
          style={{
            position: "absolute",
            right: "40px",
            top: "70px",
            display: "flex",
            width: "250px",
            height: "94px",
            borderRadius: "999px",
            overflow: "hidden",
            transform: "rotate(-42deg)",
            boxShadow: "0 40px 80px -30px rgba(19, 78, 74, 0.55)",
          }}
        >
          <div style={{ width: "46%", height: "100%", background: "linear-gradient(180deg, #2dd4bf, #0f766e)" }} />
          <div style={{ width: "54%", height: "100%", background: "linear-gradient(180deg, #ffffff, #e7e5e4)" }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- rendered by next/og, not the browser */}
          <img src={LOGO_MARK_DATA_URI} width={68} height={68} alt="" />
          <span style={{ fontSize: "46px", fontWeight: 600, letterSpacing: "-1.5px" }}>Saathi</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
          <div style={{ fontSize: "78px", lineHeight: 1.04, letterSpacing: "-3px", maxWidth: "740px" }}>
            Care for the people who cared for you.
          </div>
          <div style={{ fontSize: "31px", color: "#57534e", maxWidth: "860px" }}>
            Medicine reminders that make sure someone always follows up.
          </div>
        </div>
        <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
          {PILLS.map((pill) => (
            <div
              key={pill}
              style={{
                display: "flex",
                padding: "10px 22px",
                borderRadius: "999px",
                background: "#ffffff",
                border: "1px solid #e7e5e4",
                fontSize: "23px",
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
