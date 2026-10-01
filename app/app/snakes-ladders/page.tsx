import { SnakesLaddersGame } from "../../snakes-ladders/GameScreen";
import { NAVY, BLUE } from "../../components/cartoon";

export default function SnakesLaddersPage() {
  return (
    <div className="pt-10">
      <div className="mx-auto mb-8 max-w-2xl text-center">
        <p
          className="font-pixel mb-5 text-xs"
          style={{ color: NAVY, letterSpacing: "0.25em" }}
        >
          THE BOARD IS SET
        </p>
        <h1
          className="font-pixel text-2xl leading-[2] sm:text-3xl"
          style={{ color: NAVY }}
        >
          ROLL THE DICE.
          <br />
          CLIMB THE LADDERS.
          <br />
          <span style={{ color: BLUE }}>TAKE THE POT.</span>
        </h1>
        <p
          className="mx-auto mt-5 max-w-md text-sm font-medium leading-relaxed"
          style={{ color: NAVY, opacity: 0.8 }}
        >
          4 teams. 1 token per team. First to 100 wins 95% of the pot pro-rata.
        </p>
      </div>
      <SnakesLaddersGame />
    </div>
  );
}
