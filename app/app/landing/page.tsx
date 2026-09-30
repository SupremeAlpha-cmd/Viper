import Image from "next/image";
import Link from "next/link";
import { ArenaMotif } from "../../components/ArenaMotif";

/*
 * VIPER LANDING PAGE — designer working file.
 * ---------------------------------------------------------------
 * This page is structured for the design team to skin. Notes:
 * - Each section is marked with a DESIGNERS comment describing what
 *   can be swapped (art, layout, motion) without touching the copy.
 * - Copy is final marketing copy for ads/push. Do not rewrite the
 *   game facts (60s lobby, 11x11 grid, 5% fee, 100% on-chain).
 * - Styling is intentionally restrained: hierarchy and spacing are
 *   set, visual treatment is yours.
 * Sections: hero / stats / how-it-works / on-chain / coin / final-cta
 */

const stats = [
  { value: "60s", label: "lobby countdown" },
  { value: "11×11", label: "battle grid" },
  { value: "5%", label: "protocol fee — winner takes the rest" },
  { value: "100%", label: "on-chain — no servers, no trust needed" },
];

const steps = [
  {
    n: "01",
    title: "Join the lobby",
    body: "Connect your wallet and stake VIPER to enter. The lobby locks after 60 seconds — then there's no way in.",
  },
  {
    n: "02",
    title: "Outlive the blast",
    body: "Move across the 11×11 grid, plant bombs, and dodge cross-shaped explosions. Bombs chain-detonate — one blast sets off the next.",
  },
  {
    n: "03",
    title: "Take the pot",
    body: "Last one standing wins the entire pot minus a 5% protocol fee. Paid automatically by the contract — no one to trust, no one to wait for.",
  },
];

const proofPoints = [
  {
    title: "Every move is a transaction",
    body: "Steps, bombs and explosions are all recorded on Robinhood Chain. The game state is public and verifiable by anyone.",
  },
  {
    title: "Payouts are automatic",
    body: "The contract settles the match and pays the winner on-chain. No admin, no manual claims, no middleman.",
  },
  {
    title: "Stalled matches can't freeze",
    body: "Anyone can nudge a stuck match forward. The game never depends on a server staying awake.",
  },
];

export default function LandingPage() {
  return (
    <div className="pt-6">
      {/* ============ HERO ============ */}
      {/* DESIGNERS: hero art zone — the ArenaMotif is a placeholder for key
          art. Keep the headline and CTAs; art is yours. */}
      <section
        data-section="hero"
        className="grid items-center gap-10 py-14 sm:grid-cols-2 sm:py-20"
      >
        <div className="text-center sm:text-left">
          <div className="flex items-center justify-center gap-3 sm:justify-start">
            <Image
              src="/logo.png"
              alt="Viper"
              width={52}
              height={52}
              className="rounded-xl"
              priority
            />
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-lime-400">
              Fully on-chain
              <br />
              Robinhood Chain
            </p>
          </div>
          <h1 className="mt-6 font-display text-5xl font-bold leading-[1.05] text-white sm:text-6xl">
            Drop in. Blow up.
            <br />
            Take the pot.
          </h1>
          <p className="mx-auto mt-5 max-w-md text-base text-zinc-400 sm:mx-0 sm:text-lg">
            Viper is a real-time multiplayer bomber arena where every step
            and explosion is a blockchain transaction. Last one standing
            takes it all.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-start justify-center items-center">
            <Link
              href="/"
              className="rounded-xl bg-lime-400 px-8 py-3.5 font-semibold text-black transition hover:bg-lime-300"
            >
              Enter the arena
            </Link>
            <a
              href="#how-it-works"
              className="rounded-xl border border-white/20 px-8 py-3.5 font-semibold text-white transition hover:border-white/40"
            >
              How it works
            </a>
          </div>
        </div>
        <ArenaMotif />
      </section>

      {/* ============ STATS ============ */}
      {/* DESIGNERS: stat band — numbers can become cards, ticks, or a marquee. */}
      <section
        data-section="stats"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center"
          >
            <div className="font-display text-3xl font-bold text-white">
              {s.value}
            </div>
            <div className="mt-1 text-xs text-zinc-500">{s.label}</div>
          </div>
        ))}
      </section>

      {/* ============ HOW IT WORKS ============ */}
      {/* DESIGNERS: 3-step flow — illustration per step welcome. */}
      <section data-section="how-it-works" id="how-it-works" className="py-16 sm:py-20">
        <h2 className="text-center font-display text-3xl font-bold text-white sm:text-4xl">
          How it works
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-center text-sm text-zinc-500">
          Three steps between you and the pot.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {steps.map((s) => (
            <div
              key={s.n}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
            >
              <div className="font-display text-sm font-bold tracking-widest text-lime-400">
                {s.n}
              </div>
              <h3 className="mt-2 font-display text-xl font-bold text-white">
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ============ ON-CHAIN PROOF ============ */}
      {/* DESIGNERS: trust section — icons or chain-visual motifs fit here. */}
      <section data-section="on-chain" className="py-8 sm:py-12">
        <h2 className="text-center font-display text-3xl font-bold text-white sm:text-4xl">
          Nothing to trust. Everything to verify.
        </h2>
        <div className="mt-10 space-y-4">
          {proofPoints.map((p) => (
            <div
              key={p.title}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:flex sm:items-baseline sm:gap-6"
            >
              <h3 className="shrink-0 font-display text-lg font-bold text-white sm:w-64">
                {p.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400 sm:mt-0">
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ============ THE COIN ============ */}
      {/* DESIGNERS: token spotlight — coin render / chart placeholder. */}
      <section data-section="coin" className="py-16 text-center sm:py-20">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-lime-400">
          The game coin
        </p>
        <h2 className="mt-4 font-display text-4xl font-bold text-white sm:text-5xl">
          VIPER
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-zinc-400 sm:text-base">
          VIPER is the coin of the arena. You stake it to enter, and the
          winner takes the pot in it. The game runs on it — nothing else.
        </p>
      </section>

      {/* ============ FINAL CTA ============ */}
      {/* DESIGNERS: closing banner — loudest visual moment on the page. */}
      <section
        data-section="final-cta"
        className="rounded-3xl border border-lime-400/20 bg-lime-400/[0.06] px-6 py-14 text-center"
      >
        <h2 className="mx-auto max-w-2xl font-display text-3xl font-bold text-white sm:text-4xl">
          The next lobby is forming. Be in it.
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm text-zinc-400">
          60 seconds. One grid. Everyone armed. Winner takes the pot.
        </p>
        <Link
          href="/"
          className="mt-8 inline-block rounded-xl bg-lime-400 px-10 py-4 font-semibold text-black transition hover:bg-lime-300"
        >
          Play now
        </Link>
      </section>
    </div>
  );
}
