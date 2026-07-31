import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// This is what Google shows in search results and what appears when the
// link is pasted into WhatsApp. The wording deliberately mentions "Cabo",
// because that is what people actually search for.
export const metadata: Metadata = {
  title: "Kaboo — play the Cabo card game online, free",
  description:
    "Kaboo is a free online memory and strategy card game for 2–5 players, similar to Cabo. Play instantly against a bot in your browser — no account, no download.",
  keywords: [
    "cabo card game online",
    "kaboo",
    "cabo online",
    "free card game",
    "memory card game",
  ],
  openGraph: {
    title: "Kaboo — play the Cabo card game online, free",
    description:
      "A quick memory and strategy card game. Lowest hand wins. Play free in your browser.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
