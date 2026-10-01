import type { Metadata } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import { Providers } from "../components/Providers";
import { Chrome } from "../components/Chrome";
import "./globals.css";

const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" });
const body = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  metadataBase: new URL("https://viper-blast.xyz"),
  title: "Viper — on-chain bomber arena",
  description:
    "Real-time multiplayer bomber arena on Robinhood Chain. Every move, bomb and explosion is an on-chain transaction.",
  icons: { icon: "/logo.png" },
  openGraph: {
    title: "Viper — on-chain bomber arena",
    description:
      "Real-time multiplayer bomber arena on Robinhood Chain. Last one standing takes the pot.",
    images: ["/opengraph-image.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-screen bg-[#070907] font-sans text-zinc-200 antialiased">
        <Providers>
          <Chrome>{children}</Chrome>
        </Providers>
      </body>
    </html>
  );
}
