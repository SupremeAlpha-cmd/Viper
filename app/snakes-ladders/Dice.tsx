"use client";

import React, { useEffect, useState } from "react";
import { Team, TEAM_META } from "./contract";
import { NAVY, ChunkyButton } from "../components/cartoon";

interface DiceProps {
  lastRoll?: { team: Team; dice: number; from: number; to: number; timestamp: number } | null;
  currentTurn: Team;
  isMyTurn: boolean;
  onRoll: () => void;
  pending: boolean;
  phase: "lobby" | "live" | null;
}

export function Dice({
  lastRoll,
  currentTurn,
  isMyTurn,
  onRoll,
  pending,
  phase,
}: DiceProps) {
  const [displayValue, setDisplayValue] = useState<number>(1);
  const [isRolling, setIsRolling] = useState(false);

  // When lastRoll updates, trigger roll animation
  useEffect(() => {
    if (!lastRoll) return;
    setIsRolling(true);
    let count = 0;
    const interval = setInterval(() => {
      setDisplayValue(Math.floor(Math.random() * 6) + 1);
      count++;
      if (count > 10) {
        clearInterval(interval);
        setDisplayValue(lastRoll.dice);
        setIsRolling(false);
      }
    }, 70);

    return () => clearInterval(interval);
  }, [lastRoll]);

  const meta = TEAM_META[currentTurn];

  // Render pips for standard dice face (1 to 6)
  const renderPips = (val: number) => {
    const pipsMap: Record<number, number[]> = {
      1: [4],
      2: [0, 8],
      3: [0, 4, 8],
      4: [0, 2, 6, 8],
      5: [0, 2, 4, 6, 8],
      6: [0, 2, 3, 5, 6, 8],
    };

    const activePips = pipsMap[val] || [4];

    return (
      <div className="grid h-16 w-16 grid-cols-3 grid-rows-3 gap-1 rounded-2xl border-[3px] bg-white p-2.5 shadow-md"
        style={{ borderColor: NAVY }}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((idx) => (
          <div key={idx} className="flex items-center justify-center">
            {activePips.includes(idx) && (
              <div
                className="h-3 w-3 rounded-full shadow-inner"
                style={{ background: meta.color }}
              />
            )}
          </div>
        ))}
      </div>
    );
  };

  if (phase !== "live") return null;

  return (
    <div
      className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border-[3px] bg-white p-4"
      style={{ borderColor: NAVY, boxShadow: `5px 5px 0 ${NAVY}` }}
    >
      {/* Dice Face & Animation */}
      <div className="flex items-center gap-4">
        <div
          className={`transform transition-transform ${
            isRolling || pending ? "animate-spin scale-110" : ""
          }`}
        >
          {renderPips(displayValue)}
        </div>

        <div>
          <div className="font-pixel text-[10px] uppercase" style={{ color: NAVY }}>
            TURN: <span style={{ color: meta.border }}>{meta.name}</span>
          </div>
          <div className="mt-1 text-xs font-semibold text-zinc-600">
            {lastRoll ? (
              <span>
                Rolled <span className="font-bold text-zinc-900">{lastRoll.dice}</span>: Sq {lastRoll.from} → {lastRoll.to}
              </span>
            ) : (
              "Waiting for first roll…"
            )}
          </div>
        </div>
      </div>

      {/* Action / Roll button */}
      <div className="flex items-center gap-3">
        {isMyTurn ? (
          <ChunkyButton
            onClick={onRoll}
            disabled={pending || isRolling}
            className="w-full sm:w-auto"
          >
            {pending ? "ROLLING…" : "🎲 ROLL DICE!"}
          </ChunkyButton>
        ) : (
          <div
            className="rounded-xl border-2 px-4 py-2 text-center text-xs font-bold"
            style={{
              borderColor: meta.border,
              background: meta.bgLight,
              color: meta.border,
            }}
          >
            Waiting for {meta.name}…
          </div>
        )}
      </div>
    </div>
  );
}
