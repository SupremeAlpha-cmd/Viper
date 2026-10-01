import { GameScreen } from "../components/GameScreen";

export default function Page() {
  return (
    <div className="pt-4">
      <div className="mx-auto mb-8 max-w-2xl text-center">
        <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">
          The arena is <span className="text-viper-500">on-chain</span>
        </h1>
        <p className="mt-3 text-sm text-zinc-400 sm:text-base">
          Real-time bomber battles where every step, bomb and explosion is a
          blockchain transaction. Last one standing takes the pot.
        </p>
      </div>
      <GameScreen />
    </div>
  );
}
