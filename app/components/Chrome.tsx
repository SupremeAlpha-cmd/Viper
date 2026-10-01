"use client";

import { usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ConnectButton } from "./ConnectButton";
import { NAVY, SKY } from "./cartoon";

/* App chrome (header/footer) — hidden on the standalone landing page,
   which brings its own nav and footer. Cartoonish to match /landing. */
export function Chrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/landing") return <>{children}</>;

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
        <nav className="hidden gap-6 text-xs font-bold uppercase tracking-widest text-white/80 md:flex">
          <Link href="/landing" className="hover:text-white">
            About
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
