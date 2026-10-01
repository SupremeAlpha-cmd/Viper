"use client";

import { useEffect, useState } from "react";
import { useSquadGame, formatTokens, type SquadResult } from "../lib/useSquadGame";
import { shortAddr } from "../lib/contract";
import { SQUAD_COLORS, SQUAD_ACCENT, SQUAD_BG, REASON_MISSED } from "../lib/squad-game";
import { HowToOverlay } from "../components/HowToOverlay";
import { BalanceChip } from "../components/BalanceChip";
import { NetworkBanner } from "../components/NetworkBanner";

const RED = SQUAD_ACCENT;
const BG = SQUAD_BG;

function ResultBanner({
  result,
  tokenSymbol,
  tokenDecimals,
  onDismiss,
}: {
  result: SquadResult;
  tokenSymbol: string;
  tokenDecimals: number;
  onDismiss: () => void;
}) {
  let title = "";
  let sub = "";
  if (result.kind === "win") {
    title = "👑 LAST ONE STANDING!";
    sub = `${shortAddr(result.winner!)} takes ${formatTokens(result.prize!, tokenDecimals)} ${tokenSymbol}`;
  } else if (result.kind === "split") {
    title = "🤝 POT SPLIT!";
    sub = result.share
      ? `${result.recipients} survivors take ${formatTokens(result.share, tokenDecimals)} ${tokenSymbol} each`
      : `Pot split among ${result.recipients} survivors — check your winnings below`;
  } else {
    title = "LOBBY CANCELLED";
    sub = "Not enough players — everyone refunded.";
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(4,4,8,0.85)" }}>
      <div className="w-full max-w-sm rounded-3xl border-2 p-6 text-center" style={{ borderColor: RED, background: BG }}>
        <div className="font-pixel text-lg leading-relaxed" style={{ color: RED }}>{title}</div>
        <div className="mt-3 text-sm font-medium text-zinc-400">{sub}</div>
        <button
          onClick={onDismiss}
          className="font-pixel mt-6 w-full rounded-2xl py-3.5 text-xs text-black transition active:scale-[0.98]"
          style={{ background: RED }}
        >
          NEXT LOBBY →
        </button>
      </div>
    </div>
  );
}

function LobbyCard({ v }: { v: ReturnType<typeof useSquadGame> }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secsLeft = Math.max(0, Math.ceil((v.lobbyEndsAt * 1000 - now) / 1000));

  return (
    <div className="rounded-3xl border-2 p-6" style={{ borderColor: "#3f1d24", background: BG }}>
      <div className="flex items-center justify-between">
        <div>
          <div className="font-pixel text-[10px] uppercase tracking-widest text-zinc-500">Lobby #{v.matchId}</div>
          <div className="font-pixel mt-2 text-2xl" style={{ color: RED }}>
            {v.players.length}/{v.maxPlayers}
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
            style={{ background: SQUAD_COLORS[i % SQUAD_COLORS.length] }}
            title={p.address}
          >
            {v.address && p.address.toLowerCase() === v.address.toLowerCase() ? "YOU" : shortAddr(p.address)}
          </span>
        ))}
        {v.players.length === 0 && <span className="text-sm text-zinc-500">Empty arena — be the first in.</span>}
      </div>

      <div className="mt-5 flex items-center justify-between text-sm">
        <span className="text-zinc-400">Entry</span>
        <span className="font-pixel text-[11px] text-zinc-100">
          {formatTokens(v.entryFee, v.tokenDecimals)} {v.tokenSymbol}
          {v.passEnabled && <span className="ml-2 text-zinc-500">🎫 pass holders: discount</span>}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="text-zinc-400">Pot</span>
        <span className="font-pixel text-[11px]" style={{ color: RED }}>
          {formatTokens(v.pot, v.tokenDecimals)} {v.tokenSymbol}
        </span>
      </div>

      {!v.isConnected ? (
        <p className="mt-5 text-center text-sm text-zinc-500">Connect your wallet to join the squad.</p>
      ) : v.joined ? (
        <div className="mt-5 rounded-2xl border border-[#3f1d24] bg-[#16090c] p-3 text-center text-sm text-zinc-300">
          You're in — check in every round when the match goes live.
          {secsLeft === 0 && (
            <button
              onClick={() => v.startMatch().catch(() => {})}
              disabled={v.pending !== null}
              className="font-pixel mt-3 w-full rounded-2xl py-3 text-[10px] text-black transition active:scale-[0.98] disabled:opacity-40"
              style={{ background: RED }}
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
            style={{ background: RED }}
          >
            {v.pending === "join" ? "JOINING…" : "⚡ FAST JOIN — NO POP-UPS"}
          </button>
          <button
            onClick={() => v.join().catch(() => {})}
            disabled={v.pending !== null}
            className="font-pixel w-full rounded-2xl border-2 py-3.5 text-[10px] text-zinc-200 transition active:scale-[0.98] disabled:opacity-40"
            style={{ borderColor: "#3f1d24" }}
          >
            JOIN WITH WALLET POP-UPS
          </button>
          <p className="text-center text-xs leading-relaxed text-zinc-500">
            Fast join authorizes a session key for check-ins — your wallet only approves twice.
          </p>
        </div>
      )}
    </div>
  );
}

function LiveView({ v }: { v: ReturnType<typeof useSquadGame> }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secsLeft = Math.max(0, Math.ceil((v.roundEndsAt * 1000 - now) / 1000));
  const roundDue = now / 1000 >= v.roundEndsAt && v.roundEndsAt > 0;

  // Spacebar to check in — the arcade reflex.
  useEffect(() => {
    if (v.phase !== "live" || !v.me?.alive || v.me.checkedIn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        v.survive().catch(() => {});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [v.phase, v.me, v.survive]);

  // Winner's cut right now: (pot − 5% fee) ÷ alive. This is the number that
  // grows with every elimination.
  const cut = v.aliveCount > 0 ? ((v.pot * BigInt(9500)) / BigInt(10000)) / BigInt(v.aliveCount) : BigInt(0);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border-2 px-4 py-3"
        style={{ borderColor: "#3f1d24", background: BG }}>
        <span className="font-pixel text-[10px] text-zinc-400">ROUND #{v.round}</span>
        {roundDue ? (
          <span className="font-pixel animate-pulse text-[10px]" style={{ color: RED }}>🔴 RED LIGHT</span>
        ) : (
          <span className="font-pixel text-[10px] text-green-400">🟢 GREEN LIGHT · {secsLeft}s</span>
        )}
        <span className="text-xs font-bold text-zinc-200">
          POT {formatTokens(v.pot, v.tokenDecimals)} {v.tokenSymbol}
        </span>
        <span className="font-pixel text-[10px]" style={{ color: RED }}>
          {v.aliveCount} ALIVE
        </span>
        <span className="text-xs font-bold text-zinc-400">
          YOUR CUT IF YOU WIN: <span className="text-zinc-100">{formatTokens(cut, v.tokenDecimals)}</span>
        </span>
        <span className="ml-auto flex items-center gap-2">
          {v.me?.alive ? (
            v.me.checkedIn ? (
              <span className="font-pixel rounded-full bg-green-900 px-2.5 py-1 text-[9px] text-green-200">✓ CHECKED IN</span>
            ) : (
              <span className="font-pixel animate-pulse rounded-full bg-amber-900 px-2.5 py-1 text-[9px] text-amber-200">⏳ NOT CHECKED IN</span>
            )
          ) : v.joined ? (
            <span className="font-pixel rounded-full bg-red-900 px-2.5 py-1 text-[9px] text-red-200">💀 ELIMINATED</span>
          ) : (
            <span className="text-xs font-bold text-zinc-500">spectating</span>
          )}
          {roundDue && (
            <button
              onClick={() => v.resolveRound().catch(() => {})}
              disabled={v.pending !== null}
              className="font-pixel rounded-full px-3 py-1.5 text-[9px] text-black transition active:scale-95 disabled:opacity-40"
              style={{ background: RED }}
              title="The round window closed — anyone can resolve it"
            >
              {v.pending === "resolve" ? "…" : "RESOLVE"}
            </button>
          )}
        </span>
      </div>

      {/* Elimination toasts */}
      {v.eliminations.length > 0 && (
        <div className="mb-4 space-y-1.5">
          {v.eliminations.slice(-4).map((e) => (
            <div key={e.key} className="rounded-xl border border-[#3f1d24] bg-[#16090c] px-4 py-2 text-xs font-bold text-zinc-300">
              💀 <span className="text-red-300">{v.address && e.player.toLowerCase() === v.address.toLowerCase() ? "YOU were" : `${shortAddr(e.player)} was`} eliminated</span>
              <span className="text-zinc-500"> — {e.reason === REASON_MISSED ? "missed the window 🔴" : "slowest quartile 🐌"}</span>
            </div>
          ))}
        </div>
      )}

      {/* The big check-in button */}
      {v.me?.alive && !v.me.checkedIn && (
        <button
          onClick={() => v.survive().catch(() => {})}
          disabled={v.pending !== null}
          className="font-pixel mb-5 w-full rounded-3xl py-6 text-sm text-black transition active:scale-[0.98] disabled:opacity-40"
          style={{ background: roundDue ? "#52525b" : RED, boxShadow: roundDue ? "none" : `0 0 40px ${RED}55` }}
        >
          {v.pending === "check-in" ? "CHECKING IN…" : roundDue ? "ROUND CLOSED — RESOLVE TO CONTINUE" : "✅ CHECK IN — GREEN LIGHT"}
        </button>
      )}
      {v.me?.alive && v.me.checkedIn && (
        <div className="font-pixel mb-5 w-full rounded-3xl border-2 border-green-800 bg-[#07130c] py-5 text-center text-xs text-green-300">
          ✓ YOU'RE SAFE THIS ROUND — WAIT FOR RED LIGHT
        </div>
      )}

      {/* Roster */}
      <div className="rounded-3xl border-2 p-4" style={{ borderColor: "#3f1d24", background: BG }}>
        <div className="font-pixel mb-3 text-[10px] uppercase tracking-widest text-zinc-500">
          Squad — {v.checkInCount}/{v.aliveCount} checked in
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {v.players.map((p, i) => {
            const isMe = v.address && p.address.toLowerCase() === v.address.toLowerCase();
            return (
              <div
                key={p.address}
                className="flex items-center gap-2 rounded-xl border px-2.5 py-1.5"
                style={{
                  borderColor: isMe ? RED : "#2a1218",
                  background: p.alive ? "#16090c" : "#0d0d12",
                  opacity: p.alive ? 1 : 0.45,
                }}
                title={p.address}
              >
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: SQUAD_COLORS[i % SQUAD_COLORS.length] }}
                />
                <span className="font-pixel truncate text-[9px] text-zinc-200">
                  {isMe ? "YOU" : shortAddr(p.address)}
                </span>
                <span className="ml-auto text-[11px]">
                  {!p.alive ? "💀" : p.checkedIn ? "✅" : "⏳"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {v.sessionLive && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border-2 px-4 py-2.5"
          style={{ borderColor: "#3f1d24", background: BG }}>
          <span className="font-pixel text-[10px] text-zinc-300">
            ⚡ FAST PLAY — NO POP-UPS
            {v.sessionLowGas && <span className="text-amber-300"> · SESSION GAS LOW</span>}
          </span>
          <button
            onClick={() => v.revokeSession().catch(() => {})}
            className="font-pixel rounded-full border border-[#3f1d24] px-3 py-1 text-[9px] text-zinc-400 transition active:scale-95"
            title="Kill the session key on-chain. Check-ins will ask your wallet again."
          >
            END
          </button>
        </div>
      )}
      {v.me?.alive && !v.me.checkedIn && (
        <p className="mt-4 text-center text-xs font-bold text-zinc-500">
          Press <span className="font-pixel text-[10px] text-zinc-300">SPACE</span> to check in · miss the window and you're out
          {v.sessionLive && <span className="text-red-400"> · ⚡ fast play: no pop-ups</span>}
          {v.pending && <span style={{ color: RED }}> · confirming…</span>}
        </p>
      )}
    </div>
  );
}

export function SquadGameScreen() {
  const v = useSquadGame();
  const [dismissed, setDismissed] = useState<number | null>(null);

  useEffect(() => {
    setDismissed(null);
  }, [v.matchId]);

  if (!v.ready) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="rounded-3xl border-2 border-[#3f1d24] p-6 text-center" style={{ background: BG }}>
          <div className="font-pixel text-sm leading-relaxed text-zinc-200">SQUAD GAME NOT DEPLOYED YET</div>
          <p className="mt-3 text-sm text-zinc-500">
            Set <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs">NEXT_PUBLIC_VIPER_SQUAD_GAME</code> to
            the deployed ViperSquadGame address and rebuild.
          </p>
        </div>
      </div>
    );
  }

  const showResult = v.result && dismissed !== v.result.matchId;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <HowToOverlay
        game="squad-game"
        title="SQUAD GAME"
        icon="🦑"
        tagline="32 enter. One takes the pot."
        accent={RED}
        rules={[
          "Stake VIPER to join the lobby — up to 32 players. The 60s countdown starts on first join.",
          "🟢 GREEN LIGHT: every round, check in before the timer hits zero. Miss the window and you're eliminated.",
          "🔴 RED LIGHT: the slowest quarter of check-ins is eliminated too — check in early, not just in time.",
          "Eliminated stakes stay in the pot — watch YOUR CUT IF YOU WIN grow with every elimination.",
          "Last player standing takes the pot minus a 5% fee. If everyone ghosts the final round, the last batch splits it.",
          "Fast join authorizes a session key — check-ins go through with zero wallet pop-ups. SPACE works too.",
        ]}
      />
      <NetworkBanner />

      <div className="mb-5 flex items-center justify-between gap-3">
        <BalanceChip
          game="squad-game"
          stakeToken={v.stakeToken}
          tokenSymbol={v.tokenSymbol}
          tokenDecimals={v.tokenDecimals}
          betweenMatches={v.phase === "lobby"}
        />
        {v.sessionLive && (
          <span className="font-pixel rounded-full bg-[#2a0d12] px-3 py-1.5 text-[9px] text-red-300">
            ⚡ FAST PLAY
            {v.sessionLowGas && <span className="text-amber-300"> · LOW GAS</span>}
          </span>
        )}
      </div>

      {v.isConnected && v.pendingWithdrawal > BigInt(0) && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border-2 border-[#3f1d24] p-5" style={{ background: BG }}>
          <div>
            <div className="font-pixel text-[10px] uppercase tracking-widest text-zinc-500">Unclaimed winnings</div>
            <div className="font-pixel mt-2 text-xl" style={{ color: RED }}>
              {formatTokens(v.pendingWithdrawal, v.tokenDecimals)} {v.tokenSymbol}
            </div>
          </div>
          <button
            onClick={() => v.claimWinnings().catch(() => {})}
            disabled={v.pending !== null}
            className="font-pixel rounded-2xl px-6 py-3 text-[11px] text-black transition active:scale-[0.98] disabled:opacity-40"
            style={{ background: RED }}
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
        <LiveView v={v} />
      )}

      {v.error && (
        <div className="mt-4 rounded-2xl border-2 border-red-500 p-3 text-center text-sm font-bold text-red-400" style={{ background: BG }}>
          {v.error}
        </div>
      )}
    </div>
  );
}
