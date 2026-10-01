"use client";

import { useEffect, useState } from "react";
import { useViper, formatTokens, type MatchResult } from "../lib/useViper";
import { shortAddr } from "../lib/contract";
import { ArenaGrid } from "./ArenaGrid";
import { LobbyPanel } from "./LobbyPanel";

function ResultBanner({
  result,
  tokenSymbol,
  tokenDecimals,
  onDismiss,
}: {
  result: MatchResult;
  tokenSymbol: string;
  tokenDecimals: number;
  onDismiss: () => void;
}) {
  let title = "";
  let sub = "";
  if (result.kind === "win") {
    title = "Match over";
    sub = `${shortAddr(result.winner!)} takes ${formatTokens(result.prize!, tokenDecimals)} ${tokenSymbol}`;
  } else if (result.kind === "split") {
    title = "Pot split";
    sub = `${result.recipients} survivors take ${formatTokens(result.share!, tokenDecimals)} ${tokenSymbol} each`;
  } else {
    title = "Lobby cancelled";
    sub = "Not enough players — everyone refunded.";
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-viper-500/30 bg-[#0c0f0b] p-6 text-center">
        <div className="font-display text-2xl font-bold text-white">{title}</div>
        <div className="mt-2 text-sm text-zinc-400">{sub}</div>
        <button
          onClick={onDismiss}
          className="mt-5 w-full rounded-xl bg-viper-500 py-2.5 font-semibold text-white transition hover:bg-viper-300"
        >
          Next lobby
        </button>
      </div>
    </div>
  );
}

export function GameScreen() {
  const v = useViper();
  const [dismissed, setDismissed] = useState<number | null>(null);

  // Keyboard controls: arrows/WASD to move, Space to plant.
  useEffect(() => {
    if (v.phase !== "live" || !v.myTurnAlive || v.pending) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const moves: Record<string, [number, number]> = {
        arrowup: [0, -1], w: [0, -1],
        arrowdown: [0, 1], s: [0, 1],
        arrowleft: [-1, 0], a: [-1, 0],
        arrowright: [1, 0], d: [1, 0],
      };
      if (moves[k]) {
        e.preventDefault();
        v.move(...moves[k]).catch(() => {});
      } else if (k === " " || k === "spacebar") {
        e.preventDefault();
        v.plantBomb().catch(() => {});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [v.phase, v.myTurnAlive, v.pending, v.move, v.plantBomb]);

  useEffect(() => {
    setDismissed(null);
  }, [v.matchId]);

  if (!v.ready) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
        <div className="font-display text-xl font-bold text-white">
          Contract not deployed yet
        </div>
        <p className="mt-2 text-sm text-zinc-400">
          Set <code className="rounded bg-black/50 px-1.5 py-0.5 font-mono text-xs text-viper-300">NEXT_PUBLIC_VIPER_ARENA</code> to
          the deployed ViperArena address and rebuild.
        </p>
      </div>
    );
  }

  const showResult = v.result && dismissed !== v.result.matchId;
  const blocksLeft = v.phase === "live" ? Math.max(0, v.liveEndsAt - v.blockNumber) : 0;

  return (
    <div className="mx-auto w-full max-w-3xl">
      {showResult && (
        <ResultBanner
          result={v.result!}
          tokenSymbol={v.tokenSymbol}
          tokenDecimals={v.tokenDecimals}
          onDismiss={() => setDismissed(v.result!.matchId)}
        />
      )}

      {v.phase === "lobby" || v.phase === null ? (
        <LobbyPanel
          matchId={v.matchId}
          lobbyEndsAt={v.lobbyEndsAt}
          players={v.players.map((p) => ({ address: p.address }))}
          pot={v.pot}
          entryFee={v.entryFee}
          tokenSymbol={v.tokenSymbol}
          tokenDecimals={v.tokenDecimals}
          joined={v.joined}
          isConnected={v.isConnected}
          pending={v.pending}
          onJoin={v.join}
          onStart={v.startMatch}
        />
      ) : (
        <div>
          {/* Live status bar */}
          <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            <span className="font-display font-bold text-white">
              Match #{v.matchId}
            </span>
            <span className="text-zinc-400">
              <span className="font-semibold text-viper-500">{v.aliveCount}</span> alive
            </span>
            <span className="text-zinc-400">
              pot{" "}
              <span className="font-semibold text-viper-500">
                {formatTokens(v.pot, v.tokenDecimals)} {v.tokenSymbol}
              </span>
            </span>
            <span className="text-zinc-500">{blocksLeft} blocks left</span>
            <span className="ml-auto">
              {v.myTurnAlive ? (
                <span className="text-viper-300">● you're in</span>
              ) : v.joined ? (
                <span className="text-red-400">eliminated — spectating</span>
              ) : (
                <span className="text-zinc-500">spectating</span>
              )}
            </span>
            <button
              onClick={() => v.poke().catch(() => {})}
              disabled={v.pending !== null}
              className="rounded-full border border-white/15 px-3 py-1 text-xs text-zinc-400 transition hover:border-white/35 hover:text-white disabled:opacity-40"
              title="Advance stalled matches — anyone can call this"
            >
              {v.pending === "poke" ? "…" : "poke"}
            </button>
          </div>

          <ArenaGrid
            players={v.players}
            bombs={v.bombs}
            flashes={v.flashes}
            blockNumber={v.blockNumber}
            self={v.address}
          />

          {/* Controls */}
          {v.myTurnAlive && (
            <div className="mt-4 flex items-center justify-center gap-6">
              <div className="grid grid-cols-3 gap-1.5">
                <div />
                <CtrlBtn label="↑" onClick={() => v.move(0, -1).catch(() => {})} disabled={!!v.pending} />
                <div />
                <CtrlBtn label="←" onClick={() => v.move(-1, 0).catch(() => {})} disabled={!!v.pending} />
                <CtrlBtn label="↓" onClick={() => v.move(0, 1).catch(() => {})} disabled={!!v.pending} />
                <CtrlBtn label="→" onClick={() => v.move(1, 0).catch(() => {})} disabled={!!v.pending} />
              </div>
              <button
                onClick={() => v.plantBomb().catch(() => {})}
                disabled={!!v.pending}
                className="h-20 w-20 rounded-full bg-amber-400 font-display text-sm font-bold text-white shadow-lg transition hover:bg-amber-300 active:scale-95 disabled:opacity-40"
              >
                {v.pending === "bomb" ? "…" : "BOMB"}
              </button>
            </div>
          )}
          {v.myTurnAlive && (
            <p className="mt-3 text-center text-xs text-zinc-600">
              Arrows / WASD to move · Space to plant · every action is an on-chain transaction
              {v.pending && <span className="text-viper-500"> · confirming…</span>}
            </p>
          )}
        </div>
      )}

      {v.error && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-center text-sm text-red-300">
          {v.error}
        </div>
      )}
    </div>
  );
}

function CtrlBtn({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-lg text-white transition hover:border-viper-500/50 hover:bg-white/10 active:scale-95 disabled:opacity-40"
    >
      {label}
    </button>
  );
}
