import { SnakeScreen } from "../../components/SnakeScreen";

export default function SnakePage() {
  return (
    <div className="pt-10">
      <div className="mx-auto mb-8 max-w-2xl text-center">
        <p className="font-pixel mb-5 text-xs tracking-[0.25em] text-zinc-500">
          THE PIT IS OPEN
        </p>
        <h1 className="font-pixel text-2xl leading-[2] text-zinc-100 sm:text-3xl">
          EAT. GROW.
          <br />
          <span style={{ color: "#22c55e" }}>DON'T DIE.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-md text-sm font-medium leading-relaxed text-zinc-400">
          Slither-style snake battles, fully on-chain. 8 snakes, 1 tick per
          block — last one alive takes the pot.
        </p>
      </div>
      <SnakeScreen />
    </div>
  );
}
