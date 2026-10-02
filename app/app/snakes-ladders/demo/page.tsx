import Link from "next/link";
import { SnakesLaddersDemo } from "../../../components/demo/SnakesLaddersDemo";
import { NAVY, BLUE } from "../../../components/cartoon";

export default function SnakesLaddersDemoPage() {
  return (
    <div className="pt-10">
      <div className="mx-auto mb-8 max-w-2xl text-center">
        <p className="font-pixel mb-5 text-xs" style={{ color: NAVY, letterSpacing: "0.25em" }}>
          PRACTICE MODE
        </p>
        <h1 className="font-pixel text-2xl leading-[2] sm:text-3xl" style={{ color: NAVY }}>
          RACE THE BOTS
          <br />
          <span style={{ color: BLUE }}>NO WALLET NEEDED.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-md text-sm font-medium leading-relaxed" style={{ color: NAVY, opacity: 0.8 }}>
          You're RED. Three bots race you to square 100 — no wallet, no stakes, no server.
        </p>
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
