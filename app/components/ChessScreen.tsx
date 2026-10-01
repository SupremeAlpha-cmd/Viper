"use client";

import { useEffect, useState } from "react";
import { useChess, formatTokens, REASON_WIN, REASON_DRAW, type ChessResult } from "../lib/useChess";
import { shortAddr } from "../lib/contract";
import { squareName } from "../lib/chess";
import { ChessBoard } from "../components/ChessBoard";
import { HowToOverlay } from "../components/HowToOverlay";
import { BalanceChip } from "../components/BalanceChip";
import { NetworkBanner } from "../components/NetworkBanner";

const ACCENT = "#6366f1"; // indigo — chess theme
const BG = "#0b1020";

function ResultBanner({
  result,
  tokenSymbol,
  tokenDecimals,
  onDismiss,
}: {
  result: ChessResult;
  tokenSymbol: string;
  tokenDecimals: number;
  onDismiss: () => void;
}) {
  let title = "";
  let sub = "";
  if (result.kind === "win") {
    const side = result.winningSide === 0 ? "WHITE" : "BLACK";
    title = `${side} WINS!`;
    const why = REASON_WIN[result.reason ?? 0] ?? "";
    sub = `by ${why}` + (result.prize ? ` — you take ${formatTokens(result.prize, tokenDecimals)} ${tokenSymbol}` : " — check your winnings below");
  } else if (result.kind === "draw") {
    title = "DRAW";
    sub = `by ${REASON_DRAW[result.reason ?? 0] ?? "agreement"} — pot split among all players`;
  } else {
    title = "LOBBY CANCELLED";
    sub = "Not enough players on both sides — everyone refunded.";
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(4,8,16,0.8)" }}>
      <div className="w-full max-w-sm rounded-3xl border-2 p-6 text-center" style={{ borderColor: ACCENT, background: BG }}>
        <div className="font-pixel text-lg leading-relaxed" style={{ color: ACCENT }}>{title}</div>
        <div className="mt-3 text-sm font-medium text-zinc-400">{sub}</div>
        <button
          onClick={onDismiss}
          className="font-pixel mt-6 w-full rounded-2xl py-3.5 text-xs text-white transition active:scale-[0.98]"
          style={{ background: ACCENT }}
        >
          NEXT LOBBY →
        </button>
      </div>
    </div>
  );
}

function Countdown({ endsAt, label }: { endsAt: number; label: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secsLeft = Math.max(0, Math.ceil((endsAt * 1000 - now) / 1000));
  const mm = Math.floor(secsLeft / 60);
  const ss = secsLeft % 60;
  return (
    <div className="text-right">
      <div className="font-pixel text-[10px] uppercase tracking-widest text-zinc-500">{label}</div>
      <div className="font-pixel mt-1 text-xl" style={{ color: secsLeft <= 30 ? "#ef4444" : "#f8fafc" }}>
        {mm}:{ss.toString().padStart(2, "0")}
      </div>
    </div>
  );
}

function Roster({ title, players, accent, me }: {
  title: string;
  players: `0x${string}`[];
  accent: string;
  me?: string | null;
}) {
  return (
    <div className="flex-1 rounded-2xl border border-[#26314d] bg-[#131a2e] p-3">
      <div className="font-pixel text-[9px] uppercase tracking-widest" style={{ color: accent }}>
        {title} · {players.length}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {players.map((p) => (
          <span
            key={p}
            title={p}
            className="font-pixel rounded-full px-2.5 py-1 text-[9px]"
            style={{
              background: me && p.toLowerCase() === me.toLowerCase() ? accent : "#26314d",
              color: me && p.toLowerCase() === me.toLowerCase() ? "#fff" : "#d4d4d8",
            }}
          >
            {me && p.toLowerCase() === me.toLowerCase() ? "YOU" : shortAddr(p)}
          </span>
        ))}
        {players.length === 0 && <span className="text-xs text-zinc-500">open seat</span>}
      </div>
    </div>
  );
}

function LobbyCard({ v }: { v: ReturnType<typeof useChess> }) {
  const [side, setSide] = useState<0 | 1>(0);
  return (
    <div className="rounded-3xl border-2 p-6" style={{ borderColor: "#26314d", background: BG }}>
      <div className="flex items-center justify-between">
        <div>
          <div className="font-pixel text-[10px] uppercase tracking-widest text-zinc-500">Table #{v.matchId}</div>
          <div className="font-pixel mt-2 text-2xl" style={{ color: ACCENT }}>
            {v.whitePlayers.length + v.blackPlayers.length} seated
          </div>
        </div>
        <Countdown endsAt={v.lobbyEndsAt} label="Starts in" />
      </div>

      <div className="mt-4 flex gap-3">
        <Roster title="♔ White" players={v.whitePlayers} accent="#f8fafc" me={v.address} />
        <Roster title="♚ Black" players={v.blackPlayers} accent={ACCENT} me={v.address} />
      </div>

      <div className="mt-5 flex items-center justify-between text-sm">
        <span className="text-zinc-400">Entry</span>
        <span className="font-pixel text-[11px] text-zinc-100">
          {formatTokens(v.entryFee, v.tokenDecimals)} {v.tokenSymbol}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="text-zinc-400">Pot</span>
        <span className="font-pixel text-[11px]" style={{ color: ACCENT }}>
          {formatTokens(v.pot, v.tokenDecimals)} {v.tokenSymbol}
        </span>
      </div>

      {!v.isConnected ? (
        <p className="mt-5 text-center text-sm text-zinc-500">Connect your wallet to take a seat.</p>
      ) : v.joined ? (
        <div className="mt-5 rounded-2xl border border-[#26314d] bg-[#131a2e] p-3 text-center text-sm text-zinc-300">
          You're on <span className="font-bold text-zinc-100">{v.mySide === 0 ? "White ♔" : "Black ♚"}</span> —
          anyone on your side may move on your team's turn.
          <button
            onClick={() => v.startMatch().catch(() => {})}
            disabled={v.pending !== null}
            className="font-pixel mt-3 w-full rounded-2xl py-3 text-[10px] text-white transition active:scale-[0.98] disabled:opacity-40"
            style={{ background: ACCENT }}
          >
            {v.pending === "start" ? "STARTING…" : "START MATCH →"}
          </button>
        </div>
      ) : (
        <div className="mt-5">
          <div className="mb-3 grid grid-cols-2 gap-2">
            {([0, 1] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSide(s)}
                className="font-pixel rounded-2xl border-2 py-3 text-[10px] transition active:scale-[0.98]"
                style={{
                  borderColor: side === s ? ACCENT : "#26314d",
                  background: side === s ? "#1e1b4b" : "transparent",
                  color: side === s ? "#fff" : "#a1a1aa",
                }}
              >
                {s === 0 ? "♔ WHITE" : "♚ BLACK"}
              </button>
            ))}
          </div>
          <div className="grid gap-3">
            <button
              onClick={() => v.joinFast(side).catch(() => {})}
              disabled={v.pending !== null}
              className="font-pixel w-full rounded-2xl py-4 text-xs text-white transition active:scale-[0.98] disabled:opacity-40"
              style={{ background: ACCENT }}
            >
              {v.pending === "join" ? "JOINING…" : "⚡ FAST JOIN — NO POP-UPS"}
            </button>
            <button
              onClick={() => v.join(side).catch(() => {})}
              disabled={v.pending !== null}
              className="font-pixel w-full rounded-2xl border-2 py-3.5 text-[10px] text-zinc-200 transition active:scale-[0.98] disabled:opacity-40"
              style={{ borderColor: "#26314d" }}
            >
              JOIN {side === 0 ? "WHITE" : "BLACK"} — WALLET SIGNS MOVES
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LiveCard({ v }: { v: ReturnType<typeof useChess> }) {
  const [showBanner, setShowBanner] = useState(true);
  useEffect(() => { setShowBanner(true); }, [v.result]);
  const timedOut = v.moveDeadline > 0 && Date.now() / 1000 > v.moveDeadline;

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between rounded-3xl border-2 px-5 py-4" style={{ borderColor: "#26314d", background: BG }}>
        <div>
          <div className="font-pixel text-[10px] uppercase tracking-widest text-zinc-500">Table #{v.matchId}</div>
          <div className="font-pixel mt-1.5 text-lg" style={{ color: v.sideToMove === 0 ? "#f8fafc" : ACCENT }}>
            {v.sideToMove === 0 ? "♔ WHITE TO MOVE" : "♚ BLACK TO MOVE"}
            {v.myTurn && <span className="ml-2 text-xs text-emerald-400">— YOUR SIDE</span>}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            {v.lastFrom < 64 && v.lastTo < 64
              ? `last: ${squareName(v.lastFrom)}→${squareName(v.lastTo)} · `
              : ""}
            ply {v.plyCount}
          </div>
        </div>
        <Countdown endsAt={v.moveDeadline} label="Move clock" />
      </div>

      <ChessBoard
        board={v.board}
        mySide={v.mySide}
        interactive={v.myTurn}
        onMove={(from, to, promo) => v.move(from, to, promo).catch(() => {})}
        lastFrom={v.lastFrom}
        lastTo={v.lastTo}
      />

      {!v.isConnected ? (
        <p className="text-center text-sm text-zinc-500">Connect your wallet to play.</p>
      ) : !v.joined ? (
        <p className="text-center text-sm text-zinc-500">Spectating — join the next lobby to play.</p>
      ) : (
        <div className="grid gap-3">
          {v.myTurn ? (
            <p className="text-center text-sm text-zinc-400">
              Your side to move — tap one of your {v.mySide === 0 ? "white" : "black"} pieces.
            </p>
          ) : (
            <p className="text-center text-sm text-zinc-500">
              Waiting on {v.sideToMove === 0 ? "White" : "Black"}…
            </p>
          )}
          <div className="flex gap-3">
            {timedOut && (
              <button
                onClick={() => v.claimTimeout().catch(() => {})}
                disabled={v.pending !== null}
                className="font-pixel flex-1 rounded-2xl py-3.5 text-[10px] text-white transition active:scale-[0.98] disabled:opacity-40"
                style={{ background: "#ef4444" }}
              >
                {v.pending === "timeout" ? "CLAIMING…" : "⏱ CLAIM TIMEOUT WIN"}
              </button>
            )}
            <button
              onClick={() => { if (confirm("Forfeit the game for your whole side?")) v.resign().catch(() => {}); }}
              disabled={v.pending !== null}
              className="font-pixel flex-1 rounded-2xl border-2 py-3.5 text-[10px] text-zinc-400 transition active:scale-[0.98] disabled:opacity-40"
              style={{ borderColor: "#3f3f46" }}
            >
              {v.pending === "resign" ? "RESIGNING…" : "RESIGN"}
            </button>
          </div>
        </div>
      )}

      {v.result && showBanner && (
        <ResultBanner
          result={v.result}
          tokenSymbol={v.tokenSymbol}
          tokenDecimals={v.tokenDecimals}
          onDismiss={() => setShowBanner(false)}
        />
      )}
    </div>
  );
}

export function ChessScreen() {
  const v = useChess();

  if (!v.ready) {
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border-2 p-8 text-center" style={{ borderColor: "#26314d", background: BG }}>
        <div className="font-pixel text-sm text-zinc-300">♞ CHESS NOT DEPLOYED YET</div>
        <p className="mt-3 text-sm text-zinc-500">
          Set <span className="font-mono text-zinc-300">NEXT_PUBLIC_VIPER_CHESS</span> to the ViperChess contract address.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <HowToOverlay
        game="chess"
        title="TEAM CHESS"
        icon="♞"
        tagline="You don't play alone — your whole side shares the clock and the pot."
        rules={[
          "Stake entry to sit on White ♔ or Black ♚ — anyone on your side may move on your team's turn.",
          "Full chess rules, minus castling and en passant. 5 minutes per move or your side forfeits.",
          "Checkmate wins: the winning side splits the USDG pot (5% fee) plus a 20,000 VIPER bonus. Stalemate or 50 quiet moves: everyone splits the pot (no bonus).",
          "Fast join gives you a session key — moves sign themselves, zero wallet pop-ups mid-game.",
        ]}
        accent={ACCENT}
      />

      <div className="mb-4 flex items-center justify-between gap-3">
        <BalanceChip
          game="chess"
          usdg={v.usdg}
          tokenSymbol={v.tokenSymbol}
          tokenDecimals={v.tokenDecimals}
          betweenMatches={v.phase === "lobby"}
        />
        {v.session && v.sessionLive && (
          <button
            onClick={() => v.revokeSession().catch(() => {})}
            className="font-pixel shrink-0 rounded-full border px-3 py-1.5 text-[9px] text-zinc-400 transition active:scale-95"
            style={{ borderColor: v.sessionLowGas ? "#ef4444" : "#26314d" }}
            title={v.sessionLowGas ? "Session key is low on gas — revoke and rejoin" : "Fast-play session active"}
          >
            ⚡ {v.sessionLowGas ? "LOW GAS" : "FAST-PLAY"} ✕
          </button>
        )}
      </div>

      {v.phase === "live" ? <LiveCard v={v} /> : <LobbyCard v={v} />}

      {v.pendingWithdrawal > BigInt(0) && (
        <button
          onClick={() => v.claimWinnings().catch(() => {})}
          disabled={v.pending !== null}
          className="font-pixel mt-4 w-full rounded-2xl py-4 text-xs text-white transition active:scale-[0.98] disabled:opacity-40"
          style={{ background: "#22c55e" }}
        >
          {v.pending === "claim"
            ? "CLAIMING…"
            : `CLAIM ${formatTokens(v.pendingWithdrawal, v.tokenDecimals)} ${v.tokenSymbol} →`}
        </button>
      )}

      {v.pendingViperBonus > BigInt(0) && (
        <button
          onClick={() => v.claimViperBonus().catch(() => {})}
          disabled={v.pending !== null}
          className="font-pixel mt-4 w-full rounded-2xl py-4 text-xs text-white transition active:scale-[0.98] disabled:opacity-40"
          style={{ background: "#8b5cf6" }}
        >
          {v.pending === "claimViper"
            ? "CLAIMING…"
            : `CLAIM ${formatTokens(v.pendingViperBonus, 18)} VIPER BONUS ⚡`}
        </button>
      )}

      {v.error && (
        <div className="mt-4 rounded-2xl border border-red-900 bg-red-950/40 p-3 text-center text-sm text-red-300">
          {v.error}
        </div>
      )}

      <div className="mt-6">
        <NetworkBanner />
      </div>
    </div>
  );
}
