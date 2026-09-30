import type { Metadata } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import { Providers } from "../components/Providers";
import { ConnectButton } from "../components/ConnectButton";
import "./globals.css";

const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" });
const body = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Viper — on-chain bomber arena",
  description:
    "Real-time multiplayer bomber arena on Robinhood Chain. Every move, bomb and explosion is an on-chain transaction.",
};

function ViperMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 4 L12 21 L21 4"
        stroke="#a3e635"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 21 L12 14" stroke="#a3e635" strokeWidth="3" strokeLinecap="round" />
    </svg>
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
