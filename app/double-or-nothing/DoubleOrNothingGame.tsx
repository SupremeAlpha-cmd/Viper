"use client";

import React, { useState } from "react";
import { parseUnits, formatUnits } from "viem";
import { useAccount } from "wagmi";
import {
  NAVY,
  SKY,
  BLUE,
  AMBER,
  SCREEN,
  Cartridge,
  Card,
  Kicker,
  ChunkyButton,
} from "../components/cartoon";
import { CoinVisual } from "./CoinVisual";
import { BalanceChip } from "./BalanceChip";
import { HowToOverlay } from "./HowToOverlay";
import { useDoubleOrNothing } from "./useDoubleOrNothing";
import { formatTokens } from "../lib/format";

export function DoubleOrNothingGame() {
  const { isConnected } = useAccount();
  const {
    bankroll,
    maxStake,
    tokenSymbol,
    tokenDecimals,
    tokenBalance,
    tokenAllowance,
    pendingWithdrawal,
    currentBlock,
    activeFlip,
    lastResult,
    flipping,
    statusMessage,
    error,
    sessionActive,
    initSession,
    approveToken,
    flip,
    manualReveal,
    claim,
    refund,
  } = useDoubleOrNothing();

  const [choice, setChoice] = useState<0 | 1>(0);
  const [stakeInput, setStakeInput] = useState<string>("10");
  const [showRules, setShowRules] = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);

  // Parse stake
  let parsedStake = BigInt(0);
  try {
    if (stakeInput && Number(stakeInput) > 0) {
      parsedStake = parseUnits(stakeInput, tokenDecimals);
    }
  } catch {
    parsedStake = BigInt(0);
  }

  // Potential payout calculation (1.9x stake)
  const grossWin = parsedStake * BigInt(2);
  const fee = (grossWin * BigInt(500)) / BigInt(10000);
  const netPayout = grossWin - fee;

  // Validation
  const hasEnoughBalance = tokenBalance >= parsedStake && parsedStake > BigInt(0);
  const isWithinMaxStake = maxStake > BigInt(0) ? parsedStake <= maxStake : true;
  const needsApproval = parsedStake > tokenAllowance && parsedStake > BigInt(0);

  // Quick stake buttons
  const setQuickStake = (amount: number) => {
    setStakeInput(amount.toString());
  };

  const setMaxAllowedStake = () => {
    // Max is lesser of user balance and maxStake (10% of bankroll)
    const effectiveMax = maxStake > BigInt(0) && maxStake < tokenBalance ? maxStake : tokenBalance;
    setStakeInput(formatUnits(effectiveMax, tokenDecimals));
  };

  const setHalfStake = () => {
    const half = tokenBalance / BigInt(2);
    const effective = maxStake > BigInt(0) && maxStake < half ? maxStake : half;
    setStakeInput(formatUnits(effective, tokenDecimals));
  };

  // Flip trigger
  const handleFlip = () => {
    if (!hasEnoughBalance || !isWithinMaxStake || parsedStake === BigInt(0)) return;
    flip(parsedStake, choice);
  };

  // Blocks remaining for active flip
  const blocksRemaining =
    activeFlip && currentBlock > BigInt(0)
      ? Math.max(0, Number(activeFlip.commitBlock + BigInt(50) - currentBlock))
      : 50;

  const isExpired = activeFlip && blocksRemaining === 0;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 pt-4 pb-12">
      {/* Rules overlay */}
      <HowToOverlay isOpen={showRules} onClose={() => setShowRules(false)} />

      {/* Top Balance Chip (Always Visible) */}
      <BalanceChip
        tokenBalance={tokenBalance}
        tokenDecimals={tokenDecimals}
        tokenSymbol={tokenSymbol}
        pendingWithdrawal={pendingWithdrawal}
        bankroll={bankroll}
        maxStake={maxStake}
        onClaim={claim}
        sessionActive={sessionActive}
        onOpenSessionModal={() => setShowSessionModal(true)}
        onOpenRulesModal={() => setShowRules(true)}
      />

      {/* Main Game Screen in SNES Cartridge */}
      <Cartridge label="★ VIPER DOUBLE OR NOTHING ★">
        <div className="p-4 sm:p-6">
          {/* Status / Announcement Marquee */}
          <div className="mb-4 text-center">
            <p className="font-pixel text-[11px] uppercase tracking-wider text-amber-300">
              SOLO VS THE HOUSE · 1.9x PAYOUT
            </p>
          </div>

          {/* Coin Visual with Flip Animation */}
          <CoinVisual
            choice={choice}
            onSelectChoice={setChoice}
            flipping={flipping}
            result={lastResult}
            disabled={flipping || !!activeFlip}
          />

          {/* Active Flip Status / Countdown Banner */}
          {activeFlip && (
            <div
              className="mt-6 rounded-2xl border-2 bg-amber-400/20 p-4 text-center"
              style={{ borderColor: "#f59e0b" }}
            >
              <p className="font-pixel text-xs text-amber-300">
                ACTIVE FLIP COMMITTED!
              </p>
              <p className="mt-1 text-xs text-zinc-300">
                Pick: <strong>{activeFlip.choice === 0 ? "HEADS 🐍" : "TAILS 🪙"}</strong> · Stake:{" "}
                {formatTokens(activeFlip.stake, tokenDecimals)} {tokenSymbol}
              </p>
              <p className="font-pixel mt-2 text-[10px] text-zinc-400">
                {isExpired ? (
                  <span className="text-red-400">
                    50 BLOCKS PASSED — RECLAIMABLE VIA REFUND!
                  </span>
                ) : (
                  <span>REVEAL WINDOW: {blocksRemaining} BLOCKS REMAINING</span>
                )}
              </p>

              <div className="mt-3 flex justify-center gap-3">
                {!isExpired && (
                  <ChunkyButton
                    onClick={manualReveal}
                    disabled={flipping}
                    className="bg-amber-500!"
                  >
                    REVEAL NOW 🎲
                  </ChunkyButton>
                )}
                {isExpired && (
                  <ChunkyButton onClick={refund} className="bg-red-600!">
                    REFUND STAKE (100%)
                  </ChunkyButton>
                )}
              </div>
            </div>
          )}

          {/* Stake & Controls (when no active flip) */}
          {!activeFlip && (
            <div className="mt-6 rounded-2xl border-2 border-white/10 bg-black/40 p-4 sm:p-6">
              {/* Stake Input */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-pixel text-[10px] text-zinc-400">
                    STAKE AMOUNT
                  </span>
                  <span className="font-mono text-zinc-400">
                    Max Flip: {formatTokens(maxStake, tokenDecimals)} {tokenSymbol}
                  </span>
                </div>

                <div className="relative flex items-center">
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={stakeInput}
                    onChange={(e) => setStakeInput(e.target.value)}
                    disabled={flipping}
                    placeholder="Enter stake"
                    className="w-full rounded-xl border-2 border-white/20 bg-white/10 px-4 py-3 font-mono text-lg font-bold text-white placeholder-zinc-500 focus:border-amber-400 focus:outline-none"
                  />
                  <span className="font-pixel absolute right-4 text-xs text-zinc-400">
                    {tokenSymbol}
                  </span>
                </div>

                {/* Quick stake buttons */}
                <div className="flex flex-wrap gap-2">
                  {[10, 25, 50, 100].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setQuickStake(amt)}
                      disabled={flipping}
                      className="font-pixel rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-[9px] text-zinc-300 hover:bg-white/15"
                    >
                      +{amt}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={setHalfStake}
                    disabled={flipping}
                    className="font-pixel rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-[9px] text-zinc-300 hover:bg-white/15"
                  >
                    HALF
                  </button>
                  <button
                    type="button"
                    onClick={setMaxAllowedStake}
                    disabled={flipping}
                    className="font-pixel rounded-lg border border-amber-400/50 bg-amber-500/20 px-3 py-1.5 text-[9px] text-amber-300 hover:bg-amber-500/30"
                  >
                    MAX (10%)
                  </button>
                </div>
              </div>

              {/* Potential Payout Readout */}
              <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-3 text-xs">
                <div className="flex items-center justify-between text-zinc-300">
                  <span>Gross 2x Return:</span>
                  <span className="font-mono">{formatTokens(grossWin, tokenDecimals)} {tokenSymbol}</span>
                </div>
                <div className="flex items-center justify-between text-zinc-400">
                  <span>5% Arcade Fee:</span>
                  <span className="font-mono">-{formatTokens(fee, tokenDecimals)} {tokenSymbol}</span>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2 font-bold text-emerald-400">
                  <span className="font-pixel text-[10px]">NET PAYOUT (1.9x):</span>
                  <span className="font-mono text-sm">+{formatTokens(netPayout, tokenDecimals)} {tokenSymbol}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 flex flex-col gap-3">
                {!isConnected ? (
                  <p className="font-pixel text-center text-xs text-amber-300">
                    CONNECT WALLET TO PLAY
                  </p>
                ) : needsApproval ? (
                  <ChunkyButton
                    onClick={() => approveToken(parsedStake * BigInt(10))}
                    className="w-full bg-[#2e7cf6] text-center"
                  >
                    APPROVE {tokenSymbol} FOR PLAY
                  </ChunkyButton>
                ) : (
                  <ChunkyButton
                    onClick={handleFlip}
                    disabled={
                      flipping ||
                      !hasEnoughBalance ||
                      !isWithinMaxStake ||
                      parsedStake === BigInt(0)
                    }
                    className="w-full bg-[#fbbf24] text-[#0b1230] hover:bg-[#f59e0b] text-center text-sm"
                  >
                    {flipping
                      ? "FLIPPING COIN…"
                      : !hasEnoughBalance
                      ? "INSUFFICIENT BALANCE"
                      : !isWithinMaxStake
                      ? "STAKE EXCEEDS 10% MAX CAP"
                      : `FLIP COIN (${stakeInput} ${tokenSymbol})`}
                  </ChunkyButton>
                )}
              </div>
            </div>
          )}

          {/* Status & Error Messages */}
          {statusMessage && (
            <div className="mt-4 rounded-xl border-2 border-cyan-400 bg-cyan-950/80 p-3 text-center">
              <p className="font-pixel text-[10px] text-cyan-300">{statusMessage}</p>
            </div>
          )}
          {error && (
            <div className="mt-4 rounded-xl border-2 border-red-400 bg-red-950/80 p-3 text-center">
              <p className="font-pixel text-[10px] text-red-300">{error}</p>
            </div>
          )}
        </div>
      </Cartridge>

      {/* Fast Play Session Key Modal */}
      {showSessionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div
            className="w-full max-w-md rounded-3xl border-[4px] bg-white p-6 shadow-2xl"
            style={{ borderColor: NAVY, boxShadow: `8px 8px 0 ${NAVY}` }}
          >
            <h3 className="font-pixel text-sm text-[#0b1230]">
              ⚡ FAST PLAY (SESSION KEYS)
            </h3>
            <p className="mt-2 text-xs text-zinc-600 leading-relaxed">
              Authorize a temporary browser session key once. Both commitment and reveal transactions will execute automatically with <strong>zero wallet pop-ups</strong>.
            </p>
            <div className="mt-4 rounded-xl border-2 bg-slate-50 p-3 text-[11px] text-zinc-700" style={{ borderColor: NAVY }}>
              <p>✔ Session is limited to gameplay only</p>
              <p>✔ Cannot withdraw tokens or touch funds</p>
              <p>✔ Auto-expires after 2 hours or revoke anytime</p>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowSessionModal(false)}
                className="font-pixel rounded-xl border-2 px-4 py-2 text-[10px] text-zinc-600 hover:bg-zinc-100"
                style={{ borderColor: NAVY }}
              >
                CLOSE
              </button>
              <ChunkyButton
                onClick={() => {
                  initSession();
                  setShowSessionModal(false);
                }}
              >
                ENABLE FAST PLAY
              </ChunkyButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
