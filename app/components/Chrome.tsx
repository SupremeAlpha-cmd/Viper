"use client";

import { usePathname } from "next/navigation";
import Image from "next/image";
import { ConnectButton } from "./ConnectButton";

/* App chrome (header/footer) — hidden on the standalone landing page,
   which brings its own nav and footer. */
export function Chrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/landing") return <>{children}</>;

  return (
    <>
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2.5">
          <Image
            src="/logo.png"
            alt="Viper"
            width={34}
            height={34}
            className="rounded-lg"
            priority
          />
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
    </>
  );
}
