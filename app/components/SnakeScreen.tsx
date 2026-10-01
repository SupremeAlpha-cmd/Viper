"use client";

import { useEffect, useState } from "react";
import { useSnake, formatTokens, type SnakeResult } from "../lib/useSnake";
import { shortAddr } from "../lib/contract";
import { SNAKE_COLORS } from "../lib/snake";
import { SnakeGrid } from "../components/SnakeGrid";
import { HowToOverlay } from "../components/HowToOverlay";
import { BalanceChip } from "../components/BalanceChip";
import { NetworkBanner } from "../components/NetworkBanner";

const GREEN = "#22c55e";
const BG = "#0b1020";

function ResultBanner({
  result,
  tokenSymbol,
  tokenDecimals,
  onDismiss,
}: {
  result: SnakeResult;
  tokenSymbol: string;
  tokenDecimals: number;
  onDismiss: () => void;
}) {
  let title = "";
  let sub = "";
  if (result.kind === "win") {
    title = "SNAKE PIT CLEARED!";
    sub = `${shortAddr(result.winner!)} takes ${formatTokens(result.prize!, tokenDecimals)} ${tokenSymbol}`;
  } else if (result.kind === "split" || result.kind === "weighted") {
    title = result.kind === "weighted" ? "SCORES SETTLED!" : "POT SPLIT!";
    sub = result.share
      ? `${result.recipients} survivors take ${formatTokens(result.share, tokenDecimals)} ${tokenSymbol} each`
      : `Pot split among ${result.recipients} survivors — check your winnings below`;
  } else {
    title = "LOBBY CANCELLED";
    sub = "Not enough players — everyone refunded.";
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(4,8,16,0.8)" }}>
      <div className="w-full max-w-sm rounded-3xl border-2 p-6 text-center" style={{ borderColor: GREEN, background: BG }}>
        <div className="font-pixel text-lg leading-relaxed" style={{ color: GREEN }}>{title}</div>
        <div className="mt-3 text-sm font-medium text-zinc-400">{sub}</div>
        <button
          onClick={onDismiss}
          className="font-pixel mt-6 w-full rounded-2xl py-3.5 text-xs text-black transition active:scale-[0.98]"
          style={{ background: GREEN }}
        >
          NEXT LOBBY →
        </button>
      </div>
    </div>
  );
}

function DPadBtn({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); onPress(); }}
      disabled={disabled}
      className="font-pixel flex h-14 w-14 items-center justify-center rounded-2xl border-2 bg-[#131a2e] text-base text-zinc-100 transition active:scale-95 disabled:opacity-40"
      style={{ borderColor: "#26314d" }}
    >
      {label}
    </button>
  );
}

function LobbyCard({ v }: { v: ReturnType<typeof useSnake> }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secsLeft = Math.max(0, Math.ceil((v.lobbyEndsAt * 1000 - now) / 1000));

  return (
    <div className="rounded-3xl border-2 p-6" style={{ borderColor: "#26314d", background: BG }}>
      <div className="flex items-center justify-between">
        <div>
          <div className="font-pixel text-[10px] uppercase tracking-widest text-zinc-500">Lobby #{v.matchId}</div>
          <div className="font-pixel mt-2 text-2xl" style={{ color: GREEN }}>
            {v.players.length}/8
          </div>
        </div>
        <div className="text-right">
          <div className="font-pixel text-[10px] uppercase tracking-widest text-zinc-500">Starts in</div>
          <div className="font-pixel mt-2 text-2xl text-zinc-100">{secsLeft}s</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {v.players.map((p, i) => (
          <span
            key={p.address}
            className="font-pixel rounded-full px-3 py-1.5 text-[9px] text-black"
            style={{ background: SNAKE_COLORS[i % SNAKE_COLORS.length] }}
            title={p.address}
          >
            {v.address && p.address.toLowerCase() === v.address.toLowerCase() ? "YOU" : shortAddr(p.address)}
          </span>
        ))}
        {v.players.length === 0 && <span className="text-sm text-zinc-500">Empty pit — be the first in.</span>}
      </div>

      <div className="mt-5 flex items-center justify-between text-sm">
        <span className="text-zinc-400">Entry</span>
        <span className="font-pixel text-[11px] text-zinc-100">
          {formatTokens(v.entryFee, v.tokenDecimals)} {v.tokenSymbol}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="text-zinc-400">Pot</span>
        <span className="font-pixel text-[11px]" style={{ color: GREEN }}>
          {formatTokens(v.pot, v.tokenDecimals)} {v.tokenSymbol}
        </span>
      </div>

      {!v.isConnected ? (
        <p className="mt-5 text-center text-sm text-zinc-500">Connect your wallet to join the pit.</p>
      ) : v.joined ? (
        <div className="mt-5 rounded-2xl border border-[#26314d] bg-[#131a2e] p-3 text-center text-sm text-zinc-300">
          You're in — steer with <span className="font-bold text-zinc-100">arrows / WASD</span> when the match goes live.
          {secsLeft === 0 && (
            <button
              onClick={() => v.startMatch().catch(() => {})}
              disabled={v.pending !== null}
              className="font-pixel mt-3 w-full rounded-2xl py-3 text-[10px] text-black transition active:scale-[0.98] disabled:opacity-40"
              style={{ background: GREEN }}
            >
              {v.pending === "start" ? "STARTING…" : "START MATCH →"}
            </button>
          )}
        </div>
      ) : (
        <div className="mt-5 grid gap-3">
          <button
            onClick={() => v.joinFast().catch(() => {})}
            disabled={v.pending !== null}
            className="font-pixel w-full rounded-2xl py-4 text-xs text-black transition active:scale-[0.98] disabled:opacity-40"
            style={{ background: GREEN }}
          >
            {v.pending === "join" ? "JOINING…" : "⚡ FAST JOIN — NO POP-UPS"}
          </button>
          <button
            onClick={() => v.join().catch(() => {})}
            disabled={v.pending !== null}
            className="font-pixel w-full rounded-2xl border-2 py-3.5 text-[10px] text-zinc-200 transition active:scale-[0.98] disabled:opacity-40"
            style={{ borderColor: "#26314d" }}
          >
            JOIN WITH WALLET POP-UPS
          </button>
          <p className="text-center text-xs leading-relaxed text-zinc-500">
            Fast join authorizes a session key for steering — your wallet only approves twice.
          </p>
        </div>
      )}
    </div>
  );
}

export function SnakeScreen() {
  const v = useSnake();
  const [dismissed, setDismissed] = useState<number | null>(null);

  // Keyboard: arrows/WASD steer.
  useEffect(() => {
    if (v.phase !== "live" || !v.myTurnAlive) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const dirs: Record<string, number> = {
        arrowup: 0, w: 0,
        arrowright: 1, d: 1,
        arrowdown: 2, s: 2,
        arrowleft: 3, a: 3,
      };
      if (dirs[k] !== undefined) {
        e.preventDefault();
        v.setDirection(dirs[k]).catch(() => {});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [v.phase, v.myTurnAlive, v.setDirection]);

  useEffect(() => {
    setDismissed(null);
  }, [v.matchId]);

  if (!v.ready) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="rounded-3xl border-2 border-[#26314d] bg-[#0b1020] p-6 text-center">
          <div className="font-pixel text-sm leading-relaxed text-zinc-200">SNAKE NOT DEPLOYED YET</div>
          <p className="mt-3 text-sm text-zinc-500">
            Set <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs">NEXT_PUBLIC_VIPER_SNAKE</code> to
            the deployed ViperSnake address and rebuild.
          </p>
        </div>
      </div>
    );
  }

  const showResult = v.result && dismissed !== v.result.matchId;
  const ticksLeft = v.phase === "live" ? Math.max(0, v.matchTicks - v.currentTick) : 0;
  const myScore = v.me?.score ?? 0;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <HowToOverlay
        game="snake"
        title="SNAKE PIT"
        icon="🐍"
        tagline="8 snakes enter. One takes the pot."
        accent={GREEN}
        rules={[
          "Steer with arrows/WASD — your turn commits and applies on the next block.",
          "Eat coins to grow longer and stack score.",
          "Die if you hit a wall, a body, or a longer snake head-on. Dead snakes scatter as coins — slither over them.",
          "1 tick = 1 block. Last snake alive wins; on timeout the pot splits by score.",
        ]}
      />
      <NetworkBanner />

      <div className="mb-5 flex items-center justify-between gap-3">
        <BalanceChip
          game="snake"
          stakeToken={v.stakeToken}
          tokenSymbol={v.tokenSymbol}
          tokenDecimals={v.tokenDecimals}
          betweenMatches={v.phase === "lobby"}
        />
        {v.sessionLive && (
          <span className="font-pixel rounded-full bg-[#052e16] px-3 py-1.5 text-[9px] text-green-300">
            ⚡ FAST PLAY
            {v.sessionLowGas && <span className="text-amber-300"> · LOW GAS</span>}
          </span>
        )}
      </div>

      {v.isConnected && v.pendingWithdrawal > BigInt(0) && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border-2 border-[#26314d] bg-[#0b1020] p-5">
          <div>
            <div className="font-pixel text-[10px] uppercase tracking-widest text-zinc-500">Unclaimed winnings</div>
            <div className="font-pixel mt-2 text-xl" style={{ color: GREEN }}>
              {formatTokens(v.pendingWithdrawal, v.tokenDecimals)} {v.tokenSymbol}
            </div>
          </div>
          <button
            onClick={() => v.claimWinnings().catch(() => {})}
            disabled={v.pending !== null}
            className="font-pixel rounded-2xl px-6 py-3 text-[11px] text-black transition active:scale-[0.98] disabled:opacity-40"
            style={{ background: GREEN }}
          >
            {v.pending === "claim" ? "CLAIMING…" : "CLAIM 💰"}
          </button>
        </div>
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
        <LobbyCard v={v} />
      ) : (
        <div>
          <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border-2 border-[#26314d] bg-[#0b1020] px-4 py-3">
            <span className="font-pixel text-[10px] text-zinc-400">PIT #{v.matchId}</span>
            <span className="font-pixel text-[10px]" style={{ color: GREEN }}>{v.aliveCount} ALIVE</span>
            <span className="text-xs font-bold text-zinc-200">
              POT {formatTokens(v.pot, v.tokenDecimals)} {v.tokenSymbol}
            </span>
            <span className="text-xs font-bold text-zinc-500">{ticksLeft} ticks left</span>
            {v.joined && (
              <span className="font-pixel text-[10px]" style={{ color: "#fbbf24" }}>
                SCORE {myScore}
              </span>
            )}
            <span className="ml-auto">
              {v.myTurnAlive ? (
                <span className="font-pixel rounded-full bg-green-600 px-2.5 py-1 text-[9px] text-white">● YOU'RE IN</span>
              ) : v.joined ? (
                <span className="font-pixel rounded-full bg-red-600 px-2.5 py-1 text-[9px] text-white">ELIMINATED</span>
              ) : (
                <span className="text-xs font-bold text-zinc-500">spectating</span>
              )}
            </span>
            <button
              onClick={() => v.poke().catch(() => {})}
              disabled={v.pending !== null}
              className="font-pixel rounded-full border-2 border-[#26314d] bg-[#131a2e] px-3 py-1.5 text-[9px] text-zinc-200 transition active:scale-95 disabled:opacity-40"
              title="Advance stalled matches — anyone can call this"
            >
              {v.pending === "poke" ? "…" : "POKE"}
            </button>
          </div>

          <div className="rounded-3xl border-2 border-[#26314d] bg-[#0b1020] p-3">
            <SnakeGrid players={v.players} coins={v.coins} deaths={v.deaths} self={v.address} />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {v.players.map((p, i) => (
              <span key={p.address} className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: SNAKE_COLORS[i % SNAKE_COLORS.length], opacity: p.alive ? 1 : 0.3 }}
                />
                {v.address && p.address.toLowerCase() === v.address.toLowerCase() ? "YOU" : shortAddr(p.address)}
                <span className="font-bold text-zinc-200">{p.score}</span>
                {!p.alive && <span className="text-zinc-600">✕</span>}
              </span>
            ))}
          </div>

          {v.sessionLive && (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border-2 border-[#26314d] bg-[#0b1020] px-4 py-2.5">
              <span className="font-pixel text-[10px] text-zinc-300">
                ⚡ FAST PLAY — NO POP-UPS
                {v.sessionLowGas && <span className="text-amber-300"> · SESSION GAS LOW</span>}
              </span>
              <button
                onClick={() => v.revokeSession().catch(() => {})}
                className="font-pixel rounded-full border border-[#26314d] px-3 py-1 text-[9px] text-zinc-400 transition active:scale-95"
                title="Kill the session key on-chain. Steering will ask your wallet again."
              >
                END
              </button>
            </div>
          )}

          {v.myTurnAlive && (
            <div className="mt-8 flex items-center justify-center gap-8">
              <div className="grid grid-cols-3 gap-2">
                <div />
                <DPadBtn label="↑" onPress={() => v.setDirection(0).catch(() => {})} disabled={!!v.pending} />
                <div />
                <DPadBtn label="←" onPress={() => v.setDirection(3).catch(() => {})} disabled={!!v.pending} />
                <DPadBtn label="↓" onPress={() => v.setDirection(2).catch(() => {})} disabled={!!v.pending} />
                <DPadBtn label="→" onPress={() => v.setDirection(1).catch(() => {})} disabled={!!v.pending} />
              </div>
            </div>
          )}
          {v.myTurnAlive && (
            <p className="mt-4 text-center text-xs font-bold text-zinc-500">
              Arrows / WASD to steer · every action is an on-chain transaction
              {v.sessionLive && <span className="text-green-400"> · ⚡ fast play: no pop-ups</span>}
              {v.pending && <span style={{ color: GREEN }}> · confirming…</span>}
            </p>
          )}
        </div>
      )}

      {v.error && (
        <div className="mt-4 rounded-2xl border-2 border-red-500 bg-[#0b1020] p-3 text-center text-sm font-bold text-red-400">
          {v.error}
        </div>
      )}
    </div>
  );
}
