"use client";

import React, { useState } from "react";
import { useSnakesLadders, formatTokens } from "./useSnakesLadders";
import { Board } from "./Board";
import { Dice } from "./Dice";
import { Lobby } from "./Lobby";
import { BalanceChip } from "./BalanceChip";
import { HowToOverlay } from "./HowToOverlay";
import { TEAM_META } from "./contract";
import { NetworkBanner } from "../components/NetworkBanner";
import { Card, Cartridge, ChunkyButton, NAVY, BLUE } from "../components/cartoon";

export function SnakesLaddersGame() {
  const sl = useSnakesLadders();
  const [showHowTo, setShowHowTo] = useState(false);
  const [dismissedMatchId, setDismissedMatchId] = useState<number | null>(null);

  const showResult = sl.winner !== null && dismissedMatchId !== sl.matchId;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <NetworkBanner />
      <HowToOverlay forceOpen={showHowTo} onClose={() => setShowHowTo(false)} />

      {/* Top Bar: Balance Chip & Help */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BalanceChip
          balance={sl.playerBalance}
          pendingWithdrawal={sl.pendingWithdrawal}
          tokenSymbol={sl.tokenSymbol}
          tokenDecimals={sl.tokenDecimals}
          isConnected={sl.isConnected}
          onClaim={() => sl.claimWinnings().catch(() => {})}
          pending={sl.pending}
        />

        <button
          onClick={() => setShowHowTo(true)}
          className="font-pixel rounded-full border-2 bg-white px-3 py-1.5 text-[10px] text-zinc-800 transition hover:bg-zinc-100 shadow-sm"
          style={{ borderColor: NAVY }}
          title="Game Rules & How-To"
        >
          ❓ HOW TO PLAY
        </button>
      </div>

      {/* Match Won / Over Result Modal */}
      {showResult && sl.winner !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          style={{ background: "rgba(11,18,48,0.75)" }}
        >
          <Card className="w-full max-w-sm text-center animate-in zoom-in-95 duration-200">
            <span className="text-4xl">🏆</span>
            <div className="font-pixel mt-2 text-xl leading-relaxed" style={{ color: NAVY }}>
              {TEAM_META[sl.winner].name} WINS!
            </div>
            <p className="mt-2 text-xs font-semibold text-zinc-600">
              Reached square 100! Winning team takes 95% of the pot!
            </p>

            <div className="mt-4 rounded-xl border-2 bg-amber-50 p-3 text-xs" style={{ borderColor: NAVY }}>
              <div className="text-zinc-600">Total Pot:</div>
              <div className="font-pixel text-base text-amber-700">
                {formatTokens(sl.pot, sl.tokenDecimals)} {sl.tokenSymbol}
              </div>
            </div>

            <div className="mt-6">
              <ChunkyButton
                onClick={() => setDismissedMatchId(sl.matchId)}
                className="w-full"
              >
                NEXT MATCH →
              </ChunkyButton>
            </div>
          </Card>
        </div>
      )}

      {/* Error Notice */}
      {sl.error && (
        <div className="rounded-2xl border-2 border-red-500 bg-red-100 p-3 text-center text-xs font-bold text-red-800">
          ⚠️ {sl.error}
        </div>
      )}

      {/* Main View: Lobby vs Live Race */}
      {sl.phase === "lobby" || sl.phase === null ? (
        <Lobby
          matchId={sl.matchId}
          lobbyEndsAt={sl.lobbyEndsAt}
          teamStakes={sl.teamStakes}
          teamPlayers={sl.teamPlayers}
          pot={sl.pot}
          entryFee={sl.entryFee}
          tokenSymbol={sl.tokenSymbol}
          tokenDecimals={sl.tokenDecimals}
          hasJoined={sl.hasJoined}
          myTeam={sl.myTeam}
          myStake={sl.myStake}
          isConnected={sl.isConnected}
          pending={sl.pending}
          onJoin={(team, amount, fast) => {
            if (fast) sl.joinFast(team, amount);
            else sl.join(team, amount);
          }}
          onStart={sl.startMatch}
        />
      ) : (
        <div className="space-y-5">
          {/* Live Race Status Bar */}
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-[3px] bg-white px-4 py-3"
            style={{ borderColor: NAVY, boxShadow: `4px 4px 0 ${NAVY}` }}
          >
            <div className="flex items-center gap-3">
              <span className="font-pixel text-[10px]" style={{ color: NAVY }}>
                RACE #{sl.matchId}
              </span>
              <span className="font-pixel text-[10px]" style={{ color: BLUE }}>
                POT: {formatTokens(sl.pot, sl.tokenDecimals)} {sl.tokenSymbol}
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <span className="font-bold text-zinc-600">
                Turn expires in:{" "}
                <strong className={sl.turnExpired ? "text-red-600" : "text-zinc-900"}>
                  {sl.blocksRemaining} blks
                </strong>
              </span>

              {sl.turnExpired ? (
                <button
                  onClick={() => sl.passTurn().catch(() => {})}
                  disabled={sl.pending !== null}
                  className="font-pixel rounded-full border-2 bg-red-500 px-2.5 py-1 text-[9px] text-white transition hover:bg-red-600"
                  style={{ borderColor: NAVY }}
                  title="Pass turn due to inactivity"
                >
                  PASS TURN
                </button>
              ) : (
                <button
                  onClick={() => sl.poke().catch(() => {})}
                  disabled={sl.pending !== null}
                  className="font-pixel rounded-full border-2 bg-zinc-100 px-2.5 py-1 text-[9px] text-zinc-800 transition hover:bg-zinc-200"
                  style={{ borderColor: NAVY }}
                  title="Poke keep-alive"
                >
                  POKE
                </button>
              )}
            </div>
          </div>

          {/* Session Key Info Chip */}
          {sl.sessionLive && (
            <div
              className="flex items-center justify-between rounded-xl border-[2px] bg-amber-50 px-4 py-2 text-xs"
              style={{ borderColor: NAVY }}
            >
              <span className="font-pixel text-[9px] text-amber-900">
                ⚡ FAST PLAY SESSION ACTIVE (ZERO POP-UP ROLLS)
              </span>
              <button
                onClick={() => sl.revokeSession().catch(() => {})}
                className="font-pixel rounded-full border bg-white px-2.5 py-0.5 text-[8px] text-zinc-800"
                style={{ borderColor: NAVY }}
              >
                END SESSION
              </button>
            </div>
          )}

          {/* Cartridge Framing 10x10 Board */}
          <Cartridge label="★ VIPER SNAKES & LADDERS ★">
            <Board
              positions={sl.positions}
              currentTurn={sl.currentTurn}
              phase={sl.phase}
              lastRoll={sl.lastRoll}
            />
          </Cartridge>

          {/* Dice & Controls */}
          <Dice
            lastRoll={sl.lastRoll}
            currentTurn={sl.currentTurn}
            isMyTurn={sl.isMyTeamTurn}
            onRoll={() => sl.roll().catch(() => {})}
            pending={sl.pending === "roll"}
            phase={sl.phase}
          />
        </div>
      )}
    </div>
  );
}
