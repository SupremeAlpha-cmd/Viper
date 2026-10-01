import { GameScreen } from "../../components/GameScreen";
import { NAVY, BLUE } from "../../components/cartoon";

export default function Page() {
  return (
    <div className="pt-10">
      <div className="mx-auto mb-8 max-w-2xl text-center">
        <p
          className="font-pixel mb-5 text-xs"
          style={{ color: NAVY, letterSpacing: "0.25em" }}
        >
          THE ARENA IS OPEN
        </p>
        <h1
          className="font-pixel text-2xl leading-[2] sm:text-3xl"
          style={{ color: NAVY }}
        >
          DROP IN.
          <br />
          BLOW UP.
          <br />
          <span style={{ color: BLUE }}>TAKE THE POT.</span>
        </h1>
        <p
          className="mx-auto mt-5 max-w-md text-sm font-medium leading-relaxed"
          style={{ color: NAVY, opacity: 0.8 }}
        >
          Real-time bomber battles, fully on-chain. Last one standing takes the
          pot.
        </p>
      </div>
      <GameScreen />
    </div>
  );
}
