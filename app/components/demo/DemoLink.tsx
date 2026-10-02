"use client";

import Link from "next/link";

/** Kill-switch: set NEXT_PUBLIC_DEMOS_ENABLED=0 to hide all demo buttons (prod mode). */
export function DemoLink({ href, className, style, children }: { href: string; className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  if (process.env.NEXT_PUBLIC_DEMOS_ENABLED === "0") return null;
  return (
    <Link href={href} className={className} style={style}>
      {children}
    </Link>
  );
}
