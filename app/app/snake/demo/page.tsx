import Link from "next/link";
import { SnakeDemo } from "../../../components/demo/SnakeDemo";

const GREEN = "#22c55e";

export default function SnakeDemoPage() {
  return (
    <div className="pt-10">
      <div className="mx-auto mb-8 max-w-2xl text-center">
        <p className="font-pixel mb-5 text-xs tracking-[0.25em] text-zinc-500">
          PRACTICE MODE
        </p>
        <h1 className="font-pixel text-2xl leading-[2] text-zinc-100 sm:text-3xl">
          SOLO SNAKE
          <br />
          <span style={{ color: GREEN }}>NO WALLET NEEDED.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-md text-sm font-medium leading-relaxed text-zinc-400">
          Try the gameplay in your browser — no wallet, no stakes, no server.
        </p>
      </div>
      <SnakeDemo />
      <div className="mx-auto mt-8 max-w-2xl text-center">
        <Link href="/snake" className="font-pixel text-[11px] text-zinc-500 underline underline-offset-4 hover:text-zinc-300">
          ← BACK TO THE REAL PIT
        </Link>
      </div>
    </div>
  );
}
