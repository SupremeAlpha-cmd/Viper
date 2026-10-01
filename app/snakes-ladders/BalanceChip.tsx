"use client";

import React from "react";
import { formatTokens } from "./useSnakesLadders";
import { NAVY, BLUE } from "../components/cartoon";

interface BalanceChipProps {
  balance: bigint;
  pendingWithdrawal: bigint;
  pendingViperBonus: bigint;
  tokenSymbol: string;
  tokenDecimals: number;
  isConnected: boolean;
  onClaim?: () => void;
  onClaimViper?: () => void;
  pending?: string | null;
}

export function BalanceChip({
  balance,
  pendingWithdrawal,
  pendingViperBonus,
  tokenSymbol,
  tokenDecimals,
  isConnected,
  onClaim,
  onClaimViper,
  pending,
}: BalanceChipProps) {
  if (!isConnected) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-full border-[3px] bg-white px-4 py-1.5 shadow-sm"
      style={{ borderColor: NAVY, boxShadow: `3px 3px 0 ${NAVY}` }}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-xs">🪙</span>
        <span className="font-pixel text-[9px] uppercase opacity-75" style={{ color: NAVY }}>
          Balance:
        </span>
        <span className="font-pixel text-[10px]" style={{ color: NAVY }}>
          {formatTokens(balance, tokenDecimals)} {tokenSymbol}
        </span>
      </div>

      {pendingWithdrawal > BigInt(0) && (
        <div className="flex items-center gap-2 border-l-2 pl-2" style={{ borderColor: NAVY }}>
          <span className="font-pixel text-[9px] text-amber-600 font-bold">
            💰 Won: {formatTokens(pendingWithdrawal, tokenDecimals)}
          </span>
          {onClaim && (
            <button
              onClick={onClaim}
              disabled={pending !== null}
              className="font-pixel rounded-full border-2 bg-amber-400 px-2 py-0.5 text-[8px] font-bold text-zinc-900 transition hover:bg-amber-300 disabled:opacity-50"
              style={{ borderColor: NAVY }}
              title="Claim winnings directly to wallet"
            >
              {pending === "claim" ? "…" : "CLAIM"}
            </button>
          )}
        </div>
      )}
      {pendingViperBonus > BigInt(0) && (
        <div className="flex items-center gap-2 border-l-2 pl-2" style={{ borderColor: NAVY }}>
          <span className="font-pixel text-[9px] text-violet-600 font-bold">
            ⚡ Bonus: {formatTokens(pendingViperBonus, 18)} VIPER
          </span>
          {onClaimViper && (
            <button
              onClick={onClaimViper}
              disabled={pending !== null}
              className="font-pixel rounded-full border-2 bg-violet-400 px-2 py-0.5 text-[8px] font-bold text-zinc-900 transition hover:bg-violet-300 disabled:opacity-50"
              style={{ borderColor: NAVY }}
              title="Claim VIPER bonus directly to wallet"
            >
              {pending === "claimViper" ? "…" : "CLAIM"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
