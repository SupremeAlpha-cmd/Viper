"use client";

import { usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ConnectButton } from "./ConnectButton";
import { NAVY, SKY } from "./cartoon";

/* App chrome (header/footer) — hidden on the standalone arcade homepage,
   which brings its own nav and footer. Cartoonish to match. */
export function Chrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/") return <>{children}</>;

  return (
    <div className="min-h-screen" style={{ background: SKY, color: NAVY }}>
      {/* floating navy pill nav */}
      <header
        className="sticky top-4 z-50 mx-auto flex w-[92%] max-w-5xl items-center justify-between rounded-full border-[3px] px-5 py-3"
        style={{
          borderColor: NAVY,
          background: NAVY,
          boxShadow: "4px 4px 0 rgba(11,18,48,0.35)",
        }}
      >
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="Viper"
            width={32}
            height={32}
            className="rounded-full"
            priority
          />
          <span className="font-pixel text-sm text-white">VIPER</span>
        </Link>
        {/* back to the games panel — always visible, esp. on mobile where the game nav is hidden */}
        {pathname !== "/games" && (
          <Link
            href="/games"
            aria-label="Back to all games"
            className="font-pixel ml-2 shrink-0 rounded-full border-2 border-white/25 px-4 py-2 text-[10px] text-white transition active:scale-95 hover:border-white/70"
          >
            ← GAMES
          </Link>
        )}
        <nav className="hidden gap-5 text-xs font-bold uppercase tracking-widest text-white/80 lg:flex">
          <Link href="/snake" className="hover:text-white">
            Snake
          </Link>
          <Link href="/bomber" className="hover:text-white">
            Bomber
          </Link>
          <Link href="/chess" className="hover:text-white">
            Chess
          </Link>
          <Link href="/snakes-ladders" className="hover:text-white">
            Snakes & Ladders
          </Link>
          <Link href="/squad-game" className="hover:text-white">
            Squad Game
          </Link>
        </nav>
        <ConnectButton />
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 pb-16">{children}</main>

      <footer
        className="border-t-[3px] py-8 text-center"
        style={{ borderColor: NAVY }}
      >
        <p className="font-pixel text-[10px]">EVERY MOVE IS A TRANSACTION</p>
        <p className="mt-3 text-xs font-medium opacity-70">
          Winner takes the pot · 5% arena fee · Robinhood Chain
        </p>
      </footer>
    </div>
  );
}
