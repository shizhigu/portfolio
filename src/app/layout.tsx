import type { Metadata } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

// Fraunces is a variable serif with optical-sizing + soft/wonk axes. It's
// the free alternative real studios reach for when they can't afford
// Tiempos or Canela. Loading the full weight range lets us push it from
// editorial body to display headline on the same page.
const fraunces = Fraunces({
  variable: "--font-serif",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz", "SOFT"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.szgu.dev"),
  title: {
    default: "Shizhi Gu — Studio",
    template: "%s · Shizhi Gu",
  },
  description:
    "AI systems engineer. I build agent products with teeth — structured outputs, sandboxed execution, interfaces sharp enough to ship.",
  keywords: [
    "Shizhi Gu",
    "AI engineer",
    "AI agents",
    "voice AI",
    "LiveKit",
    "Claude Code",
    "OpenCode",
    "full-stack engineer",
    "founding engineer",
  ],
  authors: [{ name: "Shizhi Gu", url: "https://www.szgu.dev" }],
  creator: "Shizhi Gu",
  openGraph: {
    type: "website",
    url: "https://www.szgu.dev",
    title: "Shizhi Gu — Studio",
    description:
      "AI systems engineer. I build agent products with teeth — structured outputs, sandboxed execution, interfaces sharp enough to ship.",
    siteName: "Shizhi Gu",
  },
  twitter: {
    card: "summary_large_image",
    title: "Shizhi Gu — Studio",
    description:
      "AI systems engineer. I build agent products with teeth — structured outputs, sandboxed execution, interfaces sharp enough to ship.",
    creator: "@MikeG_builds",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} ${mono.variable}`}
    >
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
