import Link from "next/link";
import { SnakesLaddersDemo } from "../../../components/demo/SnakesLaddersDemo";
import { NAVY, BLUE } from "../../../components/cartoon";

export default function SnakesLaddersDemoPage() {
  return (
    <div className="pt-10">
      <div className="mx-auto mb-8 max-w-2xl">
        <div className="rounded-2xl border-[3px] bg-white px-5 py-4" style={{ borderColor: NAVY, boxShadow: `4px 4px 0 ${NAVY}` }}>
          <p className="font-pixel mb-3 text-[10px]" style={{ color: NAVY, letterSpacing: "0.25em" }}>
            PRACTICE MODE
          </p>
          <div className="flex items-center justify-between gap-2">
            <div className="text-center flex-1">
              <div className="text-2xl">🔴</div>
              <div className="font-pixel text-[10px] mt-1" style={{ color: NAVY }}>YOU</div>
            </div>
            <div className="font-pixel text-xs" style={{ color: NAVY, opacity: 0.4 }}>VS</div>
            <div className="text-center flex-1">
              <div className="text-2xl">🤖🤖🤖</div>
              <div className="font-pixel text-[10px] mt-1" style={{ color: NAVY }}>3 BOTS</div>
            </div>
            <div className="font-pixel text-xs" style={{ color: NAVY, opacity: 0.4 }}>→</div>
            <div className="text-center flex-1">
              <div className="text-2xl">🏁</div>
              <div className="font-pixel text-[10px] mt-1" style={{ color: NAVY }}>SQ 100</div>
            </div>
          </div>
          <p className="mt-3 text-center text-xs font-bold" style={{ color: NAVY, opacity: 0.6 }}>
            🎲 Roll · move · climb ladders · dodge snakes
          </p>
        </div>
      </div>
      <SnakesLaddersDemo />
      <div className="mx-auto mt-8 max-w-2xl text-center">
        <Link href="/snakes-ladders" className="font-pixel text-[11px] underline underline-offset-4 hover:opacity-70" style={{ color: NAVY }}>
          ← BACK TO THE REAL RACE
        </Link>
      </div>
    </div>
  );
}
