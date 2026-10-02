"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Board } from "../../snakes-ladders/Board";
import { Dice } from "../../snakes-ladders/Dice";
import { Team, TEAM_META, LADDER_MAP, SNAKE_MAP, WINNING_SQUARE } from "../../snakes-ladders/contract";
import { Card, Cartridge, ChunkyButton, NAVY, BLUE } from "../cartoon";

const TEAMS = [Team.RED, Team.BLUE, Team.GREEN, Team.YELLOW];
const AI_DELAY = 1300;

const rand = (n: number) => (Math.random() * n) | 0;

/** Solo demo: you (RED) vs 3 AI teams. No wallet, no chain. */
export function SnakesLaddersDemo() {
  const [positions, setPositions] = useState<[number, number, number, number]>([0, 0, 0, 0]);
  const [turn, setTurn] = useState<Team>(Team.RED);
  const [lastRoll, setLastRoll] = useState<{ team: Team; dice: number; from: number; to: number; timestamp: number } | null>(null);
  const [winner, setWinner] = useState<Team | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [rolling, setRolling] = useState(false);
  const stateRef = useRef({ positions, turn, winner });
  stateRef.current = { positions, turn, winner };

  const reset = useCallback(() => {
    setPositions([0, 0, 0, 0]);
    setTurn(Team.RED);
    setLastRoll(null);
    setWinner(null);
    setLog(["🎲 Demo race started — you're RED. Roll to begin!"]);
    setRolling(false);
  }, []);

  const doRoll = useCallback((team: Team) => {
    const s = stateRef.current;
    if (s.winner !== null || s.turn !== team) return;
    setRolling(true);
    const dice = rand(6) + 1;
    // Small beat so the dice animation reads.
    setTimeout(() => {
      const cur = stateRef.current;
      const from = cur.positions[team];
      let to = from + dice;
      let note = "";
      if (to >= WINNING_SQUARE) {
        to = WINNING_SQUARE;
      } else if (LADDER_MAP[to] !== undefined) {
        note = ` 🪜 ladder to ${LADDER_MAP[to]}`;
        to = LADDER_MAP[to];
      } else if (SNAKE_MAP[to] !== undefined) {
        note = ` 🐍 snake to ${SNAKE_MAP[to]}`;
        to = SNAKE_MAP[to];
      }
      const next = [...cur.positions] as [number, number, number, number];
      next[team] = to;
      setPositions(next);
      setLastRoll({ team, dice, from, to, timestamp: Date.now() });
      setLog((l) => [`${TEAM_META[team].emoji} ${TEAM_META[team].name} rolled ${dice} → sq ${to}${note}`, ...l].slice(0, 5));
      setRolling(false);
      if (to >= WINNING_SQUARE) {
        setWinner(team);
      } else {
        setTurn(TEAMS[(TEAMS.indexOf(team) + 1) % TEAMS.length]);
      }
    }, 450);
  }, []);

  // AI turns.
  useEffect(() => {
    if (winner !== null || turn === Team.RED) return;
    const t = setTimeout(() => doRoll(turn), AI_DELAY);
    return () => clearTimeout(t);
  }, [turn, winner, doRoll]);

  useEffect(() => { reset(); }, [reset]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-[3px] bg-white px-4 py-3"
        style={{ borderColor: NAVY, boxShadow: `4px 4px 0 ${NAVY}` }}
      >
        <span className="font-pixel text-[10px]" style={{ color: NAVY }}>🎮 SOLO DEMO — YOU'RE RED</span>
        <span className="font-pixel text-[10px]" style={{ color: BLUE }}>
          {winner === null ? `TURN: ${TEAM_META[turn].name}` : `${TEAM_META[winner].name} WINS`}
        </span>
        <span className="text-xs font-bold" style={{ color: NAVY, opacity: 0.6 }}>no wallet · no stakes</span>
      </div>

      <Cartridge label="★ VIPER SNAKES & LADDERS ★ DEMO">
        <Board
          positions={positions}
          currentTurn={turn}
          phase="live"
          lastRoll={lastRoll}
        />
      </Cartridge>

      <Dice
        lastRoll={lastRoll}
        currentTurn={turn}
        isMyTurn={turn === Team.RED && winner === null}
        onRoll={() => doRoll(Team.RED)}
        pending={rolling && turn === Team.RED}
        phase="live"
      />

      {turn !== Team.RED && winner === null && (
        <p className="text-center text-xs font-bold" style={{ color: NAVY, opacity: 0.65 }}>
          {TEAM_META[turn].emoji} {TEAM_META[turn].name} is thinking…
        </p>
      )}

      <div className="rounded-2xl border-[3px] bg-white px-4 py-3" style={{ borderColor: NAVY, boxShadow: `4px 4px 0 ${NAVY}` }}>
        {log.map((line, i) => (
          <div key={i} className="text-xs font-semibold text-zinc-600" style={{ opacity: 1 - i * 0.18 }}>{line}</div>
        ))}
      </div>

      {winner !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: "rgba(11,18,48,0.75)" }}>
          <Card className="w-full max-w-sm text-center">
            <span className="text-4xl">{winner === Team.RED ? "🏆" : "🤖"}</span>
            <div className="font-pixel mt-2 text-xl leading-relaxed" style={{ color: NAVY }}>
              {winner === Team.RED ? "YOU WIN!" : `${TEAM_META[winner].name} WINS`}
            </div>
            <p className="mt-2 text-xs font-semibold text-zinc-600">
              {winner === Team.RED ? "Reached square 100 first. The real game pays the pot — this was practice." : "The bots got lucky this time. Run it back!"}
            </p>
            <div className="mt-6">
              <ChunkyButton onClick={reset} className="w-full">PLAY AGAIN →</ChunkyButton>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
