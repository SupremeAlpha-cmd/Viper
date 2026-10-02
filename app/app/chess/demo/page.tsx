import Link from "next/link";
import { ChessDemo } from "../../../components/demo/ChessDemo";

export default function ChessDemoPage() {
  return (
    <div className="pt-10">
      <div className="mx-auto mb-8 max-w-2xl text-center">
        <p className="font-pixel mb-5 text-xs tracking-[0.25em] text-zinc-500">
          PRACTICE MODE
        </p>
        <h1 className="font-pixel text-2xl leading-[2] text-zinc-100 sm:text-3xl">
          BEAT THE BOT
          <br />
          <span style={{ color: "#6366f1" }}>NO WALLET NEEDED.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-md text-sm font-medium leading-relaxed text-zinc-400">
          You play White against a greedy bot — no wallet, no stakes, no server.
        </p>
      </div>
      <ChessDemo />
      <div className="mx-auto mt-8 max-w-2xl text-center">
        <Link href="/chess" className="font-pixel text-[11px] text-zinc-500 underline underline-offset-4 hover:text-zinc-300">
          ← BACK TO THE REAL TABLE
        </Link>
      </div>
    </div>
  );
}
