import type { Metadata } from "next";
import Image from "next/image";
import { Space_Grotesk, Inter } from "next/font/google";
import { Providers } from "../components/Providers";
import { ConnectButton } from "../components/ConnectButton";
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

function ViperMark() {
  return (
    <Image
      src="/logo.png"
      alt="Viper"
      width={34}
      height={34}
      className="rounded-lg"
      priority
    />
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-screen bg-[#070907] font-sans text-zinc-200 antialiased">
        <Providers>
          <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
            <div className="flex items-center gap-2.5">
              <ViperMark />
              <span className="font-display text-lg font-bold tracking-wide text-white">
                VIPER
              </span>
            </div>
            <ConnectButton />
          </header>
          <main className="mx-auto w-full max-w-5xl px-4 pb-16">{children}</main>
          <footer className="mx-auto w-full max-w-5xl px-4 pb-8 text-center text-xs text-zinc-600">
            Every move is a transaction on Robinhood Chain · winner takes the pot
          </footer>
        </Providers>
      </body>
    </html>
  );
}
