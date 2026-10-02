import { Press_Start_2P } from "next/font/google";
import Link from "next/link";
import Image from "next/image";

const pixel = Press_Start_2P({ weight: "400", subsets: ["latin"] });

const NAVY = "#0b1230";
const SKY = "#7cc4f5";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-3xl border-[3px] bg-white p-6 ${className}`}
      style={{ borderColor: NAVY, boxShadow: `6px 6px 0 ${NAVY}` }}
    >
      {children}
    </div>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="mb-4 text-center text-xs font-bold uppercase"
      style={{ color: NAVY, letterSpacing: "0.35em" }}
    >
      {children}
    </p>
  );
}

function GlyphTile({ glyph, bg }: { glyph: string; bg: string }) {
  return (
    <div
      className="mx-auto flex h-32 w-full items-center justify-center rounded-2xl text-6xl"
      style={{ background: bg, border: `3px solid ${NAVY}` }}
    >
      {glyph}
    </div>
  );
}

const GAMES = [
  {
    title: "SNAKE",
    desc: "A slither-style multiplayer arena. Eat coins, grow long, clip your rivals — last one slithering takes the pot.",
    href: "/snake",
    glyph: "🐍",
    tileBg: "#dcfce7",
  },
  {
    title: "BOMBER ARENA",
    desc: "The original. 11×11 grid, 60-second lobbies — plant bombs, dodge blasts, chain-detonate your rivals. Last one standing takes the pot.",
    href: "/bomber",
    glyph: "💣",
    tileBg: "#fee2e2",
  },
  {
    title: "CHESS",
    desc: "Team chess. Stake on your side and call the moves — the winning team splits the pot.",
    href: "/chess",
    glyph: "♞",
    tileBg: "#e0e7ff",
  },
  {
    title: "SNAKES & LADDERS",
    desc: "Four team colors, one board. Race to square 100 — the winning team takes the pot.",
    href: "/snakes-ladders",
    glyph: "🪜",
    tileBg: "#fef3c7",
  },
  {
    title: "SQUAD GAME",
    desc: "Survival rounds with a growing pot. Outlast the lobby — the last ones standing split it.",
    href: "/squad-game",
    glyph: "🦑",
    tileBg: "#e0f2fe",
  },
];

export default function GamesPage() {
  return (
    <div className="min-h-screen" style={{ background: SKY, color: NAVY }}>
      {/* floating pill nav */}
      <header className="sticky top-4 z-50 mx-auto flex w-[92%] max-w-5xl items-center justify-between rounded-full border-[3px] px-5 py-3"
        style={{ borderColor: NAVY, background: NAVY, boxShadow: `4px 4px 0 rgba(11,18,48,0.35)` }}>
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo.png" alt="Viper logo" width={32} height={32} className="rounded-full" />
          <span className={`${pixel.className} text-sm text-white`}>VIPER</span>
        </Link>
        <nav className="hidden gap-6 text-xs font-bold uppercase tracking-widest text-white/80 md:flex">
          <Link href="/" className="hover:text-white">Home</Link>
          <Link href="/games" className="text-white">Games</Link>
        </nav>
        <Link
          href="/games"
          className={`${pixel.className} rounded-full bg-white px-5 py-2 text-[10px]`}
          style={{ color: NAVY }}
        >
          START PLAYING
        </Link>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-12">
        <Kicker>The arcade lineup</Kicker>
        <h1 className={`${pixel.className} mb-8 text-center text-2xl leading-relaxed`}>
          PICK YOUR GAME
        </h1>

        <div className="grid gap-6 md:grid-cols-3">
          {GAMES.map((g) => (
            <Card key={g.title}>
              <p className={`${pixel.className} mb-3 text-center text-xs`}>{g.title}</p>
              <Link href={g.href}>
                <GlyphTile glyph={g.glyph} bg={g.tileBg} />
              </Link>
              <p className="mt-3 text-center text-xs font-medium leading-relaxed opacity-80">
                {g.desc}
              </p>
              <div className="mt-3 text-center">
                <Link
                  href={g.href}
                  className={`${pixel.className} inline-block rounded-xl border-2 px-3 py-1.5 text-[9px] text-white transition hover:opacity-90`}
                  style={{ borderColor: NAVY, background: NAVY }}
                >
                  ▶ PLAY NOW
                </Link>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
