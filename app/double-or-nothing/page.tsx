import { DoubleOrNothingGame } from "./DoubleOrNothingGame";
import { NAVY, BLUE } from "../components/cartoon";

export default function DoubleOrNothingPage() {
  return (
    <div className="pt-6">
      <div className="mx-auto mb-6 max-w-2xl text-center">
        <p
          className="font-pixel mb-3 text-xs"
          style={{ color: NAVY, letterSpacing: "0.25em" }}
        >
          VIPER ARCADE
        </p>
        <h1
          className="font-pixel text-2xl leading-[1.8] sm:text-3xl"
          style={{ color: NAVY }}
        >
          DOUBLE OR
          <br />
          <span style={{ color: BLUE }}>NOTHING.</span>
        </h1>
        <p
          className="mx-auto mt-3 max-w-md text-sm font-medium leading-relaxed"
          style={{ color: NAVY, opacity: 0.8 }}
        >
          Solo vs the house coin flip. Call Heads or Tails, double up with 1.9x payout, or feed the house bankroll.
        </p>
      </div>

      <DoubleOrNothingGame />
    </div>
  );
}
