"use client";

import { useEffect, useRef, useState } from "react";
import { useViper, formatTokens, type MatchResult } from "../lib/useViper";
import { shortAddr, MAX_PATH_STEPS } from "../lib/contract";
import { ArenaGrid } from "./ArenaGrid";
import { LobbyPanel } from "./LobbyPanel";
import { NetworkBanner } from "./NetworkBanner";
import { Card, Cartridge, ChunkyButton, NAVY, BLUE } from "./cartoon";

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
    title = "MATCH OVER!";
    sub = `${shortAddr(result.winner!)} takes ${formatTokens(result.prize!, tokenDecimals)} ${tokenSymbol}`;
  } else if (result.kind === "split") {
    title = "POT SPLIT!";
    sub = `${result.recipients} survivors take ${formatTokens(result.share!, tokenDecimals)} ${tokenSymbol} each`;
  } else {
    title = "LOBBY CANCELLED";
    sub = "Not enough players — everyone refunded.";
  }
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(11,18,48,0.7)" }}
    >
      <Card className="w-full max-w-sm text-center">
        <div className="font-pixel text-xl leading-relaxed" style={{ color: NAVY }}>
          {title}
        </div>
        <div
          className="mt-3 text-sm font-medium"
          style={{ color: NAVY, opacity: 0.75 }}
        >
          {sub}
        </div>
        <div className="mt-6">
          <ChunkyButton onClick={onDismiss} className="w-full">
            NEXT LOBBY →
          </ChunkyButton>
        </div>
      </Card>
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
      className="font-pixel flex h-14 w-14 items-center justify-center rounded-2xl border-[3px] bg-white text-base transition active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-40"
      style={{
        borderColor: NAVY,
        color: NAVY,
        boxShadow: `3px 3px 0 ${NAVY}`,
      }}
    >
      {label}
    </button>
  );
}

export function GameScreen() {
  const v = useViper();
  const [dismissed, setDismissed] = useState<number | null>(null);

  // Path drawing: press on your own tile, drag across adjacent tiles,
  // release to fire the whole route as ONE transaction.
  const [path, setPath] = useState<{ x: number; y: number }[]>([]);
  const [drawing, setDrawing] = useState(false);
  const drawingRef = useRef(false);
  const pathRef = useRef<{ x: number; y: number }[]>([]);

  const startPath = () => {
    if (!v.myTurnAlive || !v.selfPos || v.pending) return;
    drawingRef.current = true;
    pathRef.current = [];
    setPath([]);
    setDrawing(true);
  };

  const extendPath = (x: number, y: number) => {
    if (!drawingRef.current || !v.selfPos) return;
    const cur = pathRef.current;
    const last = cur.length > 0 ? cur[cur.length - 1] : v.selfPos;
    if (x === last.x && y === last.y) return;
    if (Math.abs(x - last.x) + Math.abs(y - last.y) !== 1) return;
    if (cur.length >= MAX_PATH_STEPS) return;
    const next = [...cur, { x, y }];
    pathRef.current = next;
    setPath(next);
  };

  // Release anywhere: submit the drawn path, or discard an empty tap.
  useEffect(() => {
    const up = () => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      setDrawing(false);
      const p = pathRef.current;
      pathRef.current = [];
      setPath([]);
      if (p.length > 0) v.movePath(p).catch(() => {});
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [v.movePath]);

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
      <div className="mx-auto max-w-lg">
        <Card className="text-center">
          <div className="font-pixel text-sm leading-relaxed" style={{ color: NAVY }}>
            ARENA NOT DEPLOYED YET
          </div>
          <p
            className="mt-3 text-sm font-medium"
            style={{ color: NAVY, opacity: 0.75 }}
          >
            Set{" "}
            <code
              className="rounded px-1.5 py-0.5 font-mono text-xs"
              style={{ background: "rgba(11,18,48,0.08)" }}
            >
              NEXT_PUBLIC_VIPER_ARENA
            </code>{" "}
            to the deployed ViperArena address and rebuild.
          </p>
        </Card>
      </div>
    );
  }

  const showResult = v.result && dismissed !== v.result.matchId;
  const blocksLeft = v.phase === "live" ? Math.max(0, v.liveEndsAt - v.blockNumber) : 0;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <NetworkBanner />

      {v.isConnected && v.pendingWithdrawal > BigInt(0) && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div
                className="font-pixel text-[10px] uppercase"
                style={{ color: NAVY, letterSpacing: "0.25em", opacity: 0.7 }}
              >
                Unclaimed winnings
              </div>
              <div className="font-pixel mt-2 text-xl" style={{ color: BLUE }}>
                {formatTokens(v.pendingWithdrawal, v.tokenDecimals)}{" "}
                {v.tokenSymbol}
              </div>
            </div>
            <ChunkyButton
              onClick={() => v.claimWinnings().catch(() => {})}
              disabled={v.pending !== null}
            >
              {v.pending === "claim" ? "CLAIMING…" : "CLAIM 💰"}
            </ChunkyButton>
          </div>
        </Card>
      )}

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
          onJoin={(fast) => {
            if (fast) v.joinFast();
            else v.join();
          }}
          onStart={v.startMatch}
        />
      ) : (
        <div>
          {/* Live status bar */}
          <div
            className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border-[3px] bg-white px-4 py-3"
            style={{ borderColor: NAVY, boxShadow: `4px 4px 0 ${NAVY}` }}
          >
            <span className="font-pixel text-[10px]" style={{ color: NAVY }}>
              MATCH #{v.matchId}
            </span>
            <span
              className="font-pixel text-[10px]"
              style={{ color: BLUE }}
            >
              {v.aliveCount} ALIVE
            </span>
            <span className="text-xs font-bold" style={{ color: NAVY }}>
              POT {formatTokens(v.pot, v.tokenDecimals)} {v.tokenSymbol}
            </span>
            <span
              className="text-xs font-bold"
              style={{ color: NAVY, opacity: 0.6 }}
            >
              {blocksLeft} blocks left
            </span>
            <span className="ml-auto">
              {v.myTurnAlive ? (
                <span
                  className="font-pixel rounded-full border-2 px-2.5 py-1 text-[9px]"
                  style={{ borderColor: NAVY, background: "#22c55e", color: "#fff" }}
                >
                  ● YOU'RE IN
                </span>
              ) : v.joined ? (
                <span
                  className="font-pixel rounded-full border-2 px-2.5 py-1 text-[9px]"
                  style={{ borderColor: NAVY, background: "#ef4444", color: "#fff" }}
                >
                  ELIMINATED
                </span>
              ) : (
                <span
                  className="text-xs font-bold"
                  style={{ color: NAVY, opacity: 0.6 }}
                >
                  spectating
                </span>
              )}
            </span>
            <button
              onClick={() => v.poke().catch(() => {})}
              disabled={v.pending !== null}
              className="font-pixel rounded-full border-[3px] bg-white px-3 py-1.5 text-[9px] transition active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-40"
              style={{
                borderColor: NAVY,
                color: NAVY,
                boxShadow: `2px 2px 0 ${NAVY}`,
              }}
              title="Advance stalled matches — anyone can call this"
            >
              {v.pending === "poke" ? "…" : "POKE"}
            </button>
          </div>

          <Cartridge label="★ VIPER ARENA ★">
            <ArenaGrid
              players={v.players}
              bombs={v.bombs}
              flashes={v.flashes}
              blockNumber={v.blockNumber}
              self={v.address}
              selfPos={v.selfPos}
              path={path}
              drawing={drawing}
              onPathStart={startPath}
              onPathExtend={extendPath}
            />
          </Cartridge>
          {drawing && (
            <div
              className="font-pixel mt-3 rounded-2xl border-[3px] bg-white px-4 py-2 text-center text-[10px]"
              style={{
                borderColor: NAVY,
                color: NAVY,
                boxShadow: `3px 3px 0 ${NAVY}`,
              }}
            >
              PATH ×{path.length} — RELEASE TO SEND IT
            </div>
          )}

          {/* Session-key fast-play status */}
          {v.sessionLive && (
            <div
              className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-[3px] bg-white px-4 py-2.5"
              style={{ borderColor: NAVY, boxShadow: `4px 4px 0 ${NAVY}` }}
            >
              <span className="font-pixel text-[10px]" style={{ color: NAVY }}>
                ⚡ FAST PLAY — NO POP-UPS
                {v.sessionLowGas && (
                  <span style={{ color: "#b45309" }}>
                    {" "}
                    · SESSION GAS LOW
                  </span>
                )}
              </span>
              <button
                onClick={() => v.revokeSession().catch(() => {})}
                className="font-pixel rounded-full border-2 bg-white px-3 py-1 text-[9px] transition active:translate-x-[1px] active:translate-y-[1px]"
                style={{ borderColor: NAVY, color: NAVY }}
                title="Kill the session key on-chain. Moves will ask your wallet again."
              >
                END
              </button>
            </div>
          )}

          {/* Controls */}
          {v.myTurnAlive && (
            <div className="mt-8 flex items-center justify-center gap-8">
              <div className="grid grid-cols-3 gap-2">
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
                className="font-pixel flex h-24 w-24 items-center justify-center rounded-full border-4 text-[11px] text-white transition active:scale-95 disabled:opacity-40"
                style={{
                  borderColor: NAVY,
                  background: "#f59e0b",
                  boxShadow: `5px 5px 0 ${NAVY}`,
                  textShadow: `2px 2px 0 ${NAVY}`,
                }}
              >
                {v.pending === "bomb" ? "…" : "BOMB"}
              </button>
            </div>
          )}
          {v.myTurnAlive && (
            <p
              className="mt-4 text-center text-xs font-bold"
              style={{ color: NAVY, opacity: 0.65 }}
            >
              Arrows / WASD to move · Space to plant · drag from your tile to
              queue a path in one tx · every action is on-chain
              {v.sessionLive && (
                <span style={{ color: "#16a34a" }}> · ⚡ fast play: no pop-ups</span>
              )}
              {v.pending && <span style={{ color: BLUE }}> · confirming…</span>}
            </p>
          )}
        </div>
      )}

      {v.error && (
        <div
          className="mt-4 rounded-2xl border-[3px] bg-white p-3 text-center text-sm font-bold"
          style={{ borderColor: "#ef4444", color: "#b91c1c", boxShadow: `4px 4px 0 #ef4444` }}
        >
          {v.error}
        </div>
      )}
    </div>
  );
}
