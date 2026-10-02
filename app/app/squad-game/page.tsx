import Link from "next/link";
import { SquadGameScreen } from "../../components/SquadGameScreen";

export default function SquadGamePage() {
  return (
    <div className="pt-10">
      <div className="mx-auto mb-8 max-w-2xl text-center">
        <p className="font-pixel mb-5 text-xs tracking-[0.25em] text-zinc-500">
          RED LIGHT · GREEN LIGHT
        </p>
        <h1 className="font-pixel text-2xl leading-[2] text-zinc-100 sm:text-3xl">
          CHECK IN.
          <br />
          <span style={{ color: "#ef4444" }}>DON'T GET CAUGHT.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-md text-sm font-medium leading-relaxed text-zinc-400">
          Big-lobby survival on-chain. 32 players, elimination rounds — miss the
          window or check in too slow and you're out. Last one standing takes the pot.
        </p>
        <Link
          href="/squad-game/demo"
          className="font-pixel mt-5 inline-block rounded-2xl border-2 border-[#3f1d24] bg-[#16090c] px-6 py-3 text-[11px] text-zinc-100 transition active:scale-[0.98] hover:border-[#ef4444]"
        >
          🎮 TRY SOLO DEMO — NO WALLET
        </Link>
      </div>
      <SquadGameScreen />
    </div>
  );
}
