import Link from "next/link";
import { BomberDemo } from "../../../components/demo/BomberDemo";
import { NAVY, BLUE } from "../../../components/cartoon";

export default function BomberDemoPage() {
  return (
    <div className="pt-10">
      <div className="mx-auto mb-8 max-w-2xl text-center">
        <p className="font-pixel mb-5 text-xs" style={{ color: NAVY, letterSpacing: "0.25em" }}>
          PRACTICE MODE
        </p>
        <h1 className="font-pixel text-2xl leading-[2] sm:text-3xl" style={{ color: NAVY }}>
          BLOW UP BOTS
          <br />
          <span style={{ color: BLUE }}>NO WALLET NEEDED.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-md text-sm font-medium leading-relaxed" style={{ color: NAVY, opacity: 0.8 }}>
          You vs 3 bomber bots in the arena — no wallet, no stakes, no server.
        </p>
      </div>
      <BomberDemo />
      <div className="mx-auto mt-8 max-w-2xl text-center">
        <Link href="/bomber" className="font-pixel text-[11px] underline underline-offset-4 hover:opacity-70" style={{ color: NAVY }}>
          ← BACK TO THE REAL ARENA
        </Link>
      </div>
    </div>
  );
}
