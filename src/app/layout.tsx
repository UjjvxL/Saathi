import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { APP_DESCRIPTION, APP_NAME, TEXT_SIZE_STORAGE_KEY } from "@/lib/constants";
import { siteUrl } from "@/lib/site-url";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });
const instrument = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: `${APP_NAME}: care for your elders, together`, template: `%s · ${APP_NAME}` },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  keywords: ["elder care", "medication reminder", "caregiver app", "pill tracker", "family care", "senior health"],
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: `${APP_NAME}: care for your elders, together`,
    description: APP_DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: `${APP_NAME}: care for your elders, together`, description: APP_DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: "#fafaf9",
  width: "device-width",
  initialScale: 1,
};

// Applies the saved "bigger text" preference before first paint (no flash, no hydration mismatch).
const textSizeScript = `(function(){try{if(localStorage.getItem(${JSON.stringify(
  TEXT_SIZE_STORAGE_KEY,
)})==="large")document.documentElement.setAttribute("data-text-size","large")}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} ${instrument.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: textSizeScript }} />
      </head>
      <body className="min-h-dvh font-sans antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-stone-900 focus:px-5 focus:py-3 focus:font-medium focus:text-white"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
