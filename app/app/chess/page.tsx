import Link from "next/link";
import { ChessScreen } from "../../components/ChessScreen";
import { DemoLink } from "@/components/demo/DemoLink";

export default function ChessPage() {
  return (
    <div className="pt-10">
      <div className="mx-auto mb-8 max-w-2xl text-center">
        <p className="font-pixel mb-5 text-xs tracking-[0.25em] text-zinc-500">
          THE TABLE IS OPEN
        </p>
        <h1 className="font-pixel text-2xl leading-[2] text-zinc-100 sm:text-3xl">
          YOUR SIDE.
          <br />
          <span style={{ color: "#6366f1" }}>YOUR MOVE.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-md text-sm font-medium leading-relaxed text-zinc-400">
          Team chess, fully on-chain. Stake a seat on White or Black — anyone on
          your side may move. Winning side splits the pot.
        </p>
        <DemoLink
          href="/chess/demo"
          className="font-pixel mt-5 inline-block rounded-2xl border-2 border-[#26314d] bg-[#131a2e] px-6 py-3 text-[11px] text-zinc-100 transition active:scale-[0.98] hover:border-[#6366f1]"
        >
          🎮 TRY SOLO DEMO — NO WALLET
        </DemoLink>
      </div>
      <ChessScreen />
    </div>
  );
}
