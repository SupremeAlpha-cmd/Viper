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
        {/* Demo hidden while Javin rethinks the red-light/green-light gameplay */}
      </div>
      <SquadGameScreen />
    </div>
  );
}
