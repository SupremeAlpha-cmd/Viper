"use client";

import { useEffect, useState } from "react";
import { formatTokens } from "../lib/useViper";
import { shortAddr } from "../lib/contract";

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
  onJoin: () => void;
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

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
            Match #{p.matchId}
          </div>
          <div className="mt-1 font-display text-2xl font-bold text-white">
            Lobby open
          </div>
        </div>
        <div className="text-right">
          <div
            className={`font-display text-4xl font-bold tabular-nums ${
              canStart ? "text-viper-500" : "text-white"
            }`}
          >
            {mm}:{ss}
          </div>
          <div className="text-xs text-zinc-500">
            {canStart ? "ready to start" : "until lock"}
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl bg-black/40 p-3">
          <div className="font-display text-xl font-bold text-white">
            {p.players.length}
          </div>
          <div className="text-xs text-zinc-500">joined</div>
        </div>
        <div className="rounded-xl bg-black/40 p-3">
          <div className="font-display text-xl font-bold text-viper-500">
            {formatTokens(p.pot, p.tokenDecimals)}
          </div>
          <div className="text-xs text-zinc-500">pot ({p.tokenSymbol})</div>
        </div>
        <div className="rounded-xl bg-black/40 p-3">
          <div className="font-display text-xl font-bold text-white">
            {formatTokens(p.entryFee, p.tokenDecimals)}
          </div>
          <div className="text-xs text-zinc-500">entry ({p.tokenSymbol})</div>
        </div>
      </div>

      {p.players.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {p.players.map((pl) => (
            <span
              key={pl.address}
              className="rounded-full bg-white/5 px-2.5 py-1 font-mono text-xs text-zinc-400 ring-1 ring-white/10"
            >
              {shortAddr(pl.address)}
            </span>
          ))}
        </div>
      )}

      <div className="mt-6 flex gap-3">
        {!p.joined ? (
          <button
            onClick={p.onJoin}
            disabled={!p.isConnected || p.pending !== null}
            className="flex-1 rounded-xl bg-viper-500 py-3 font-semibold text-white transition hover:bg-viper-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {!p.isConnected
              ? "Connect wallet to join"
              : p.pending === "join"
                ? "Joining…"
                : `Join for ${formatTokens(p.entryFee, p.tokenDecimals)} ${p.tokenSymbol}`}
          </button>
        ) : (
          <div className="flex-1 rounded-xl border border-viper-500/40 bg-viper-500/10 py-3 text-center font-semibold text-viper-300">
            You're in — good luck
          </div>
        )}
        {canStart && (
          <button
            onClick={p.onStart}
            disabled={!p.isConnected || p.pending !== null || p.players.length < 1}
            className="rounded-xl border border-white/20 bg-white/5 px-5 py-3 font-semibold text-white transition hover:border-white/40 disabled:opacity-40"
          >
            {p.pending === "start" ? "Starting…" : "Start match"}
          </button>
        )}
      </div>
      <p className="mt-3 text-center text-xs text-zinc-600">
        Winner takes the pot minus a 5% protocol fee. Fewer than 2 players at
        lock → everyone refunded.
      </p>
    </div>
  );
}
