import { Press_Start_2P } from "next/font/google";
import Link from "next/link";
import Image from "next/image";

const pixel = Press_Start_2P({ weight: "400", subsets: ["latin"] });

const NAVY = "#0b1230";
const SKY = "#7cc4f5";

/* ---------- chunky card ---------- */
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

/* ---------- mini snake snapshot ---------- */
function MiniSnake() {
  const path: [number, number][] = [
    [7, 1], [7, 2], [7, 3], [6, 3], [5, 3], [5, 4], [5, 5],
    [4, 5], [3, 5], [3, 6], [3, 7], [4, 7], [5, 7], [5, 8],
  ];
  const coins: [number, number][] = [[2, 2], [8, 8], [1, 9], [9, 3], [2, 7]];
  const inPath = new Set(path.map(([r, c]) => r * 11 + c));
  const head = 5 * 11 + 8;
  const coinSet = new Set(coins.map(([r, c]) => r * 11 + c));
  const cells = [];
  for (let i = 0; i < 121; i++) {
    let bg = "#0e1533";
    if (i % 2 === 0 && Math.floor(i / 11) % 2 === 0) bg = "#131c40";
    let extra = "";
    if (inPath.has(i)) {
      const seg = path.findIndex(([r, c]) => r * 11 + c === i);
      bg = seg % 2 === 0 ? "#22c55e" : "#16a34a";
      if (i === head) bg = "#4ade80";
    }
    if (coinSet.has(i)) {
      bg = "#f59e0b";
      extra = " rounded-full";
    }
    cells.push(
      <div key={i} className={`aspect-square rounded-[2px]${extra}`} style={{ background: bg }} />
    );
  }
  return (
    <div
      className="grid grid-cols-11 gap-[2px] rounded-xl border-[3px] p-2"
      style={{ borderColor: NAVY, background: "#070b22" }}
    >
      {cells}
    </div>
  );
}

/* ---------- mini arena snapshot (bomber) ---------- */
function MiniArena({ seed }: { seed: number }) {
  const cells = [];
  for (let i = 0; i < 121; i++) {
    const r = (i * 31 + seed * 17) % 100;
    let bg = "#0e1533";
    if (i % 2 === 0 && (Math.floor(i / 11) % 2 === 0)) bg = "#3b82f6";
    if (r < 6) bg = "#f59e0b";
    if (r > 94) bg = "#22d3ee";
    cells.push(
      <div key={i} className="aspect-square rounded-[2px]" style={{ background: bg }} />
    );
  }
  return (
    <div
      className="grid grid-cols-11 gap-[2px] rounded-xl border-[3px] p-2"
      style={{ borderColor: NAVY, background: "#070b22" }}
    >
      {cells}
    </div>
  );
}

/* ---------- chunky glyph tile for upcoming games ---------- */
function GlyphTile({ glyph, bg }: { glyph: string; bg: string }) {
  return (
    <div
      className="flex aspect-[4/3] items-center justify-center rounded-xl border-[3px] text-6xl"
      style={{ borderColor: NAVY, background: bg }}
    >
      {glyph}
    </div>
  );
}

/* ---------- SNES-cartridge frame ---------- */
/* ---------- arcade cabinet (hero) ---------- */
function ArcadeCabinet() {
  const tiles = ["🐍", "💣", "♞", "🪜", "🎲", "🦑"];
  return (
    <div
      className="mx-auto w-60"
      style={{ filter: `drop-shadow(8px 8px 0 ${NAVY})` }}
    >
      {/* marquee */}
      <div
        className="rounded-t-2xl border-[3px] border-b-0 px-4 py-3 text-center"
        style={{ borderColor: NAVY, background: "#fbbf24" }}
      >
        <p className={`${pixel.className} text-[10px]`} style={{ color: NAVY }}>
          ★ VIPER ★
        </p>
      </div>
      {/* screen */}
      <div
        className="border-[3px] border-y-0 px-4 py-3"
        style={{ borderColor: NAVY, background: "#aab4c4" }}
      >
        <div
          className="rounded-lg border-[3px] p-2"
          style={{ borderColor: NAVY, background: "#070b22" }}
        >
          <div className="grid grid-cols-3 gap-1.5">
            {tiles.map((t) => (
              <div
                key={t}
                className="flex aspect-square items-center justify-center rounded text-lg"
                style={{ background: "#131c40" }}
              >
                {t}
              </div>
            ))}
          </div>
          <p className={`${pixel.className} mt-2 text-center text-[8px] text-white`}>
            INSERT COIN
          </p>
        </div>
      </div>
      {/* control deck */}
      <div
        className="border-[3px] border-y-0 px-6 py-3"
        style={{ borderColor: NAVY, background: "#8b95a9" }}
      >
        <div className="flex items-center justify-center gap-6">
          <div className="flex flex-col items-center">
            <div
              className="h-4 w-4 rounded-full border-2"
              style={{ borderColor: NAVY, background: "#ef4444" }}
            />
            <div className="h-6 w-1.5" style={{ background: NAVY }} />
            <div
              className="h-2 w-8 rounded-full border-2"
              style={{ borderColor: NAVY, background: "#6b7488" }}
            />
          </div>
          <div className="flex gap-2">
            <div
              className="h-5 w-5 rounded-full border-2"
              style={{ borderColor: NAVY, background: "#22c55e" }}
            />
            <div
              className="h-5 w-5 rounded-full border-2"
              style={{ borderColor: NAVY, background: "#3b82f6" }}
            />
          </div>
        </div>
      </div>
      {/* coin door */}
      <div
        className="rounded-b-2xl border-[3px] px-4 py-2"
        style={{ borderColor: NAVY, background: "#aab4c4" }}
      >
        <div
          className="mx-auto h-3 w-10 rounded border-2"
          style={{ borderColor: NAVY, background: NAVY }}
        />
      </div>
    </div>
  );
}

const UPCOMING = [
  {
    glyph: "♞",
    tileBg: "#e0e7ff",
    title: "CHESS",
    desc: "Team chess. Stake on your side and call the moves — the winning team splits the pot.",
  },
  {
    glyph: "🪜",
    tileBg: "#fef3c7",
    title: "SNAKES & LADDERS",
    desc: "Four team colors, one board. Race to square 100 — the winning team takes the pot.",
    href: "/snakes-ladders",
  },
  {
    glyph: "🎲",
    tileBg: "#fce7f3",
    title: "DOUBLE OR NOTHING",
    desc: "Pure chance. Stake your VIPER, call it — double up or lose it all.",
  },
  {
    glyph: "🦑",
    tileBg: "#e0f2fe",
    title: "SQUAD GAME",
    desc: "Survival rounds with a growing pot. Outlast the lobby — the last ones standing split it.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen" style={{ background: SKY, color: NAVY }}>
      {/* floating pill nav */}
      <header className="sticky top-4 z-50 mx-auto flex w-[92%] max-w-5xl items-center justify-between rounded-full border-[3px] px-5 py-3"
        style={{ borderColor: NAVY, background: NAVY, boxShadow: `4px 4px 0 rgba(11,18,48,0.35)` }}>
        <Link href="/landing" className="flex items-center gap-2">
          <Image src="/logo.png" alt="Viper logo" width={32} height={32} className="rounded-full" />
          <span className={`${pixel.className} text-sm text-white`}>VIPER</span>
        </Link>
        <nav className="hidden gap-6 text-xs font-bold uppercase tracking-widest text-white/80 md:flex">
          <a href="#games" className="hover:text-white">Games</a>
          <a href="#how" className="hover:text-white">How it works</a>
          <a href="#economy" className="hover:text-white">Economy</a>
        </nav>
        <Link
          href="/"
          className={`${pixel.className} rounded-full bg-white px-5 py-2 text-[10px]`}
          style={{ color: NAVY }}
        >
          START PLAYING
        </Link>
      </header>

      {/* hero */}
      <section className="mx-auto max-w-5xl px-4 pb-16 pt-12 text-center">
        <p className={`${pixel.className} mb-6 text-lg`} style={{ color: NAVY }}>
          Welcome to the
        </p>
        <ArcadeCabinet />
        <p className={`${pixel.className} mt-8 text-2xl leading-relaxed`} style={{ color: NAVY }}>
          THE ON-CHAIN
          <br />
          ARCADE.
        </p>
        <p className="mx-auto mt-8 max-w-xl text-sm font-medium leading-relaxed" style={{ color: NAVY }}>
          Six games. One VIPER token. Stake it, outplay everyone, and take the pot —
          every match settled on-chain on Robinhood Chain.
        </p>
        <Link
          href="/"
          className={`${pixel.className} mt-6 inline-block rounded-2xl border-[3px] px-8 py-4 text-xs`}
          style={{ borderColor: NAVY, background: NAVY, color: "#fff", boxShadow: `6px 6px 0 rgba(11,18,48,0.35)` }}
        >
          ▶ PLAY NOW
        </Link>
      </section>

      {/* game lineup */}
      <section id="games" className="mx-auto max-w-5xl px-4 py-12">
        <Kicker>The lineup</Kicker>

        <div className="grid gap-6 md:grid-cols-3">
          {/* snake */}
          <Card>
            <p className={`${pixel.className} mb-3 text-center text-xs`}>SNAKE</p>
            <MiniSnake />
            <p className="mt-3 text-center text-xs font-medium leading-relaxed opacity-80">
              A slither-style multiplayer arena. Eat coins, grow long, clip your rivals —
              last one slithering takes the pot.
            </p>
          </Card>

          {/* bomber arena */}
          <Card>
            <p className={`${pixel.className} mb-3 text-center text-xs`}>BOMBER ARENA</p>
            <MiniArena seed={42} />
            <p className="mt-3 text-center text-xs font-medium leading-relaxed opacity-80">
              The original. 11×11 grid, 60-second lobbies — plant bombs, dodge blasts,
              chain-detonate your rivals. Last one standing takes the pot.
            </p>
          </Card>

          {/* upcoming games */}
          {UPCOMING.map((g) => (
            <Card key={g.title}>
              <p className={`${pixel.className} mb-3 text-center text-xs`}>{g.title}</p>
              {g.href ? (
                <Link href={g.href}>
                  <GlyphTile glyph={g.glyph} bg={g.tileBg} />
                </Link>
              ) : (
                <GlyphTile glyph={g.glyph} bg={g.tileBg} />
              )}
              <p className="mt-3 text-center text-xs font-medium leading-relaxed opacity-80">
                {g.desc}
              </p>
              {g.href && (
                <div className="mt-3 text-center">
                  <Link
                    href={g.href}
                    className={`${pixel.className} inline-block rounded-xl border-2 px-3 py-1.5 text-[9px] text-white transition hover:opacity-90`}
                    style={{ borderColor: NAVY, background: NAVY }}
                  >
                    ▶ PLAY NOW
                  </Link>
                </div>
              )}
            </Card>
          ))}
        </div>
      </section>

      {/* how it works */}
      <section id="how" className="mx-auto max-w-5xl px-4 py-12">
        <Kicker>How it works</Kicker>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { n: "01", title: "STAKE", desc: "Connect your wallet, stake VIPER, and enter any game in the arcade." },
            { n: "02", title: "OUTPLAY", desc: "Sign once, then play in real time. No wallet popups in the middle of a match." },
            { n: "03", title: "TAKE THE POT", desc: "Winners take 95% of the pot. The arcade keeps 5%. Settled on-chain, instantly." },
          ].map((s) => (
            <Card key={s.n} className="text-center">
              <p className={`${pixel.className} text-2xl`} style={{ color: "#2e7cf6" }}>{s.n}</p>
              <p className={`${pixel.className} my-3 text-xs`}>{s.title}</p>
              <p className="text-xs font-medium leading-relaxed opacity-80">{s.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* built on */}
      <section className="mx-auto max-w-5xl px-4 py-12">
        <Kicker>Built on</Kicker>
        <div className="flex flex-wrap items-center justify-center gap-4">
          {["ROBINHOOD CHAIN", "PONS", "VIPER"].map((p) => (
            <span
              key={p}
              className={`${pixel.className} rounded-full border-[3px] bg-white px-6 py-3 text-[10px]`}
              style={{ borderColor: NAVY, boxShadow: `4px 4px 0 ${NAVY}` }}
            >
              {p}
            </span>
          ))}
        </div>
      </section>

      {/* economy donut */}
      <section id="economy" className="mx-auto max-w-3xl px-4 py-12">
        <Kicker>The Viper economy</Kicker>
        <Card className="flex flex-col items-center gap-6 md:flex-row">
          <div
            className="h-44 w-44 shrink-0 rounded-full border-[3px]"
            style={{
              borderColor: NAVY,
              background: `conic-gradient(#2e7cf6 0 95%, ${NAVY} 95% 100%)`,
            }}
          >
            <div className="flex h-full w-full items-center justify-center">
              <div
                className="flex h-24 w-24 items-center justify-center rounded-full border-[3px] bg-white"
                style={{ borderColor: NAVY }}
              >
                <span className={`${pixel.className} text-[10px]`}>POT</span>
              </div>
            </div>
          </div>
          <ul className="space-y-3 text-sm font-bold">
            <li className="flex items-center gap-3">
              <span className="h-4 w-4 rounded-sm border-2" style={{ borderColor: NAVY, background: "#2e7cf6" }} />
              95% — Winner&apos;s prize
            </li>
            <li className="flex items-center gap-3">
              <span className="h-4 w-4 rounded-sm border-2" style={{ borderColor: NAVY, background: NAVY }} />
              5% — Arcade fee
            </li>
          </ul>
        </Card>
        <p className="mt-4 text-center text-xs font-medium opacity-70">
          One token across every game. Every pot settles on-chain. No house edge beyond the 5% arcade fee.
        </p>
      </section>

      {/* final CTA */}
      <section className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className={`${pixel.className} mb-4 text-xl leading-relaxed`}>
          READY TO PLAY?
          <br />
          <span className="text-sm">NO SIGN-UP. JUST PLAY.</span>
        </p>
        <Link
          href="/"
          className={`${pixel.className} inline-block rounded-2xl border-[3px] bg-white px-10 py-5 text-sm`}
          style={{ borderColor: NAVY, boxShadow: `8px 8px 0 ${NAVY}` }}
        >
          ENTER THE ARCADE →
        </Link>
      </section>

      {/* footer */}
      <footer className="border-t-[3px] py-8 text-center" style={{ borderColor: NAVY }}>
        <div className="flex items-center justify-center gap-2">
          <Image src="/logo.png" alt="Viper logo" width={28} height={28} className="rounded-full" />
          <span className={`${pixel.className} text-xs`}>VIPER</span>
        </div>
        <p className="mt-3 text-xs font-medium opacity-70">
          © 2026 Viper. An on-chain arcade on Robinhood Chain.
        </p>
      </footer>
    </div>
  );
}
