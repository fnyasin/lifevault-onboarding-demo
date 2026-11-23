import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Gotu, Lato } from "next/font/google";
import ScrollTopOnNavigate from "@/app/components/ScrollTopOnNavigate";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Brand fonts (match the marketing site and the Figma screens): Gotu for serif
// headings, Lato for body, labels and buttons.
const gotu = Gotu({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-gotu",
});

const lato = Lato({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-lato",
});

export const metadata: Metadata = {
  title: "LifeVault onboarding demo",
  description: "A click-through demo of LifeVault's first run: from a stack of family photos to the stories behind them, ending in the vault.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#fafafa",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${gotu.variable} ${lato.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ScrollTopOnNavigate />
        {children}
      </body>
    </html>
  );
}
