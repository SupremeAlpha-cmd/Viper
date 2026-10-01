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

/* ---------- mini arena snapshot ---------- */
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

/* ---------- SNES-cartridge frame ---------- */
function Cartridge({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative mx-auto w-full max-w-2xl rounded-[28px] border-[3px] p-5 pt-8"
      style={{ borderColor: NAVY, background: "#aab4c4", boxShadow: `10px 10px 0 ${NAVY}` }}
    >
      {/* vent slots */}
      <div
        className="mx-auto mb-4 h-4 w-2/3 rounded-full opacity-60"
        style={{
          background: `repeating-linear-gradient(90deg, ${NAVY} 0 10px, transparent 10px 22px)`,
        }}
      />
      {/* screws */}
      {["left-4 top-4", "right-4 top-4", "bottom-4 left-4", "bottom-4 right-4"].map((pos) => (
        <div
          key={pos}
          className={`absolute ${pos} h-4 w-4 rounded-full border-2`}
          style={{ borderColor: NAVY, background: "#7c8698" }}
        />
      ))}
      {/* screen */}
      <div
        className="overflow-hidden rounded-2xl border-[3px]"
        style={{ borderColor: NAVY, background: "#070b22" }}
      >
        {children}
      </div>
      <p className={`${pixel.className} mt-4 text-center text-sm`} style={{ color: NAVY }}>
        ★ VIPER ★
      </p>
    </div>
  );
}

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
          Welcome to the New
        </p>
        <Cartridge>
          <div className="relative p-4">
            <MiniArena seed={7} />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <p className={`${pixel.className} text-center text-xl leading-relaxed text-white drop-shadow-[3px_3px_0_rgba(11,18,48,1)]`}>
                DROP IN.
                <br />
                BLOW UP.
                <br />
                TAKE THE POT.
              </p>
            </div>
          </div>
        </Cartridge>
        <p className="mx-auto mt-8 max-w-xl text-sm font-medium leading-relaxed" style={{ color: NAVY }}>
          A real-time multiplayer bomber arena, fully on-chain. Sixty-second lobbies,
          sudden-death overtime, and the last viper standing takes the pot.
        </p>
        <Link
          href="/"
          className={`${pixel.className} mt-6 inline-block rounded-2xl border-[3px] px-8 py-4 text-xs`}
          style={{ borderColor: NAVY, background: NAVY, color: "#fff", boxShadow: `6px 6px 0 rgba(11,18,48,0.35)` }}
        >
          ▶ PLAY NOW
        </Link>
      </section>

      {/* game carousel */}
      <section id="games" className="mx-auto max-w-5xl px-4 py-12">
        <Kicker>Game carousel</Kicker>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { seed: 1, title: "LOBBY", desc: "60 seconds. The lobby fills, the countdown runs, the gate slams shut." },
            { seed: 42, title: "BATTLE", desc: "11×11 grid. Plant bombs, dodge blasts, chain-detonate your rivals." },
            { seed: 99, title: "VICTORY", desc: "Last one alive takes the pot. Ties split it. All on-chain." },
          ].map((g) => (
            <Card key={g.title}>
              <p className={`${pixel.className} mb-3 text-center text-xs`}>{g.title}</p>
              <MiniArena seed={g.seed} />
              <p className="mt-3 text-center text-xs font-medium leading-relaxed opacity-80">{g.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* how it works */}
      <section id="how" className="mx-auto max-w-5xl px-4 py-12">
        <Kicker>How it works</Kicker>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { n: "01", title: "JOIN", desc: "Connect your wallet, stake VIPER, and jump into the 60-second lobby." },
            { n: "02", title: "OUTLIVE", desc: "Dodge explosions, trap rivals, and be the last viper breathing." },
            { n: "03", title: "TAKE THE POT", desc: "Winner takes 95% of the pot. The arena keeps 5%. Instant, on-chain." },
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
          {["ROBINHOOD CHAIN", "PONS", "VIPER ARENA"].map((p) => (
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
              5% — Arena fee
            </li>
          </ul>
        </Card>
        <p className="mt-4 text-center text-xs font-medium opacity-70">
          Every match settles on-chain. No house edge beyond the 5% arena fee.
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
          ENTER THE ARENA →
        </Link>
      </section>

      {/* footer */}
      <footer className="border-t-[3px] py-8 text-center" style={{ borderColor: NAVY }}>
        <div className="flex items-center justify-center gap-2">
          <Image src="/logo.png" alt="Viper logo" width={28} height={28} className="rounded-full" />
          <span className={`${pixel.className} text-xs`}>VIPER</span>
        </div>
        <p className="mt-3 text-xs font-medium opacity-70">
          © 2026 Viper. A fully on-chain bomber arena on Robinhood Chain.
        </p>
      </footer>
    </div>
  );
}
