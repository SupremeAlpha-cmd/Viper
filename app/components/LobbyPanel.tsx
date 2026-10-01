"use client";

import { useEffect, useState } from "react";
import { formatTokens } from "../lib/useViper";
import { shortAddr } from "../lib/contract";
import { Card, ChunkyButton, NAVY, BLUE, SKY } from "./cartoon";

interface Props {
  matchId: number;
  lobbyEndsAt: number;
  players: { address: string }[];
  pot: bigint;
  entryFee: bigint;
  tokenSymbol: string;
  tokenDecimals: number;
  joined: boolean;
  isConnected: boolean;
  pending: string | null;
  onJoin: (fast: boolean) => void;
  onStart: () => void;
}

function useCountdown(target: number): number {
  const [left, setLeft] = useState(() =>
    Math.max(0, Math.ceil(target - Date.now() / 1000))
  );
  useEffect(() => {
    setLeft(Math.max(0, Math.ceil(target - Date.now() / 1000)));
    const t = setInterval(
      () => setLeft(Math.max(0, Math.ceil(target - Date.now() / 1000))),
      1000
    );
    return () => clearInterval(t);
  }, [target]);
  return left;
}

export function LobbyPanel(p: Props) {
  const left = useCountdown(p.lobbyEndsAt);
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  const canStart = left === 0;
  // Fast play: one extra entry step (gas top-up), zero pop-ups mid-game.
  const [fast, setFast] = useState(true);

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <div
            className="font-pixel text-[10px] uppercase"
            style={{ color: NAVY, letterSpacing: "0.25em", opacity: 0.7 }}
          >
            Match #{p.matchId}
          </div>
          <div className="font-pixel mt-2 text-lg" style={{ color: NAVY }}>
            LOBBY OPEN
          </div>
        </div>
        <div className="text-right">
          <div
            className="font-pixel text-4xl tabular-nums"
            style={{ color: canStart ? BLUE : NAVY }}
          >
            {mm}:{ss}
          </div>
          <div
            className="mt-1 text-xs font-bold"
            style={{ color: NAVY, opacity: 0.6 }}
          >
            {canStart ? "ready to start" : "until lock"}
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 text-center">
        {[
          { value: String(p.players.length), label: "joined", color: NAVY },
          {
            value: formatTokens(p.pot, p.tokenDecimals),
            label: `pot (${p.tokenSymbol})`,
            color: BLUE,
          },
          {
            value: formatTokens(p.entryFee, p.tokenDecimals),
            label: `entry (${p.tokenSymbol})`,
            color: NAVY,
          },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border-[3px] p-3"
            style={{
              borderColor: NAVY,
              background: SKY,
              boxShadow: `3px 3px 0 ${NAVY}`,
            }}
          >
            <div className="font-pixel text-sm" style={{ color: s.color }}>
              {s.value}
            </div>
            <div
              className="mt-1 text-[11px] font-bold"
              style={{ color: NAVY, opacity: 0.65 }}
            >
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {p.players.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {p.players.map((pl) => (
            <span
              key={pl.address}
              className="rounded-full border-2 px-2.5 py-1 font-mono text-xs text-white"
              style={{ borderColor: NAVY, background: NAVY }}
            >
              {shortAddr(pl.address)}
            </span>
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        {!p.joined ? (
          <div className="flex-1">
            <button
              onClick={() => setFast((f) => !f)}
              disabled={!p.isConnected || p.pending !== null}
              className="mb-3 flex w-full items-center gap-3 rounded-2xl border-[3px] bg-white px-4 py-2.5 text-left transition active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-40"
              style={{ borderColor: NAVY, boxShadow: `3px 3px 0 ${NAVY}` }}
              title="A browser-held key plays for you — it can only move and plant, never touch tokens"
            >
              <span
                className="font-pixel flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 text-xs text-white"
                style={{
                  borderColor: NAVY,
                  background: fast ? "#22c55e" : "#fff",
                }}
              >
                {fast ? "✓" : ""}
              </span>
              <span>
                <span className="font-pixel block text-[10px]" style={{ color: NAVY }}>
                  ⚡ FAST PLAY — ZERO POP-UPS MID-GAME
                </span>
                <span
                  className="block text-[11px] font-medium"
                  style={{ color: NAVY, opacity: 0.65 }}
                >
                  One extra entry step: a small gas top-up (≈300 moves of
                  dust). Uncheck for classic wallet-per-move.
                </span>
              </span>
            </button>
            <ChunkyButton
              onClick={() => p.onJoin(fast)}
              disabled={!p.isConnected || p.pending !== null}
              className="w-full"
            >
              {!p.isConnected
                ? "CONNECT WALLET TO JOIN"
                : p.pending === "join"
                  ? "JOINING…"
                  : fast
                    ? `JOIN FAST ⚡ ${formatTokens(p.entryFee, p.tokenDecimals)} ${p.tokenSymbol}`
                    : `JOIN FOR ${formatTokens(p.entryFee, p.tokenDecimals)} ${p.tokenSymbol}`}
            </ChunkyButton>
          </div>
        ) : (
          <div
            className="font-pixel flex-1 rounded-2xl border-[3px] py-3 text-center text-[11px]"
            style={{
              borderColor: NAVY,
              background: "#dbeafe",
              color: BLUE,
              boxShadow: `4px 4px 0 rgba(11,18,48,0.35)`,
            }}
          >
            YOU'RE IN — GOOD LUCK!
          </div>
        )}
        {canStart && (
          <button
            onClick={p.onStart}
            disabled={!p.isConnected || p.pending !== null}
            className="font-pixel rounded-2xl border-[3px] bg-white px-5 py-3 text-[11px] transition active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-40"
            style={{
              borderColor: NAVY,
              color: NAVY,
              boxShadow: `4px 4px 0 rgba(11,18,48,0.35)`,
            }}
            title={
              p.players.length < 1
                ? "Reopen a fresh lobby"
                : "Start the match"
            }
          >
            {p.pending === "start"
              ? "STARTING…"
              : p.players.length < 1
                ? "REFRESH LOBBY"
                : "START MATCH"}
          </button>
        )}
      </div>
      <p
        className="mt-4 text-center text-xs font-medium"
        style={{ color: NAVY, opacity: 0.65 }}
      >
        Winner takes the pot minus a 5% arena fee. Fewer than 2 players at lock →
        everyone refunded.
      </p>
    </Card>
  );
}
