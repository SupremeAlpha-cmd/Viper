"use client";

import React from "react";
import { NAVY, BLUE, AMBER, CYAN } from "../components/cartoon";
import { formatTokens } from "../lib/format";

export interface BalanceChipProps {
  tokenBalance: bigint;
  tokenDecimals: number;
  tokenSymbol: string;
  pendingWithdrawal: bigint;
  bankroll: bigint;
  maxStake: bigint;
  onClaim?: () => void;
  claiming?: boolean;
  sessionActive?: boolean;
  onOpenSessionModal?: () => void;
  onOpenRulesModal?: () => void;
}

export function BalanceChip({
  tokenBalance,
  tokenDecimals,
  tokenSymbol,
  pendingWithdrawal,
  bankroll,
  maxStake,
  onClaim,
  claiming = false,
  sessionActive = false,
  onOpenSessionModal,
  onOpenRulesModal,
}: BalanceChipProps) {
  const formattedBal = formatTokens(tokenBalance, tokenDecimals);
  const formattedPending = formatTokens(pendingWithdrawal, tokenDecimals);
  const formattedBankroll = formatTokens(bankroll, tokenDecimals);
  const formattedMaxStake = formatTokens(maxStake, tokenDecimals);

  return (
    <div className="w-full">
      {/* Top Banner / Chips Grid */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-[3px] bg-white p-3 shadow-md"
        style={{ borderColor: NAVY, boxShadow: `4px 4px 0 ${NAVY}` }}>
        
        {/* Left: User Balance & Claimable */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Main Balance Chip */}
          <div
            className="flex items-center gap-2 rounded-xl border-2 px-3 py-1.5"
            style={{ borderColor: NAVY, background: "#f0fdf4" }}
            title="Your VIPER token balance"
          >
            <span className="text-sm">🪙</span>
            <div>
              <p className="font-pixel text-[9px] uppercase tracking-wider text-zinc-500">
                BALANCE
              </p>
              <p className="font-pixel text-[11px] font-bold" style={{ color: NAVY }}>
                {formattedBal} <span className="text-[9px]">{tokenSymbol}</span>
              </p>
            </div>
          </div>

          {/* Pending Claimable Chip (Shown if > 0) */}
          {pendingWithdrawal > BigInt(0) && (
            <div
              className="flex items-center gap-2 rounded-xl border-2 px-3 py-1.5 animate-pulse"
              style={{ borderColor: NAVY, background: "#fef3c7" }}
            >
              <div>
                <p className="font-pixel text-[9px] uppercase tracking-wider text-amber-800">
                  CLAIMABLE
                </p>
                <p className="font-pixel text-[11px] font-bold text-amber-900">
                  +{formattedPending} {tokenSymbol}
                </p>
              </div>
              <button
                type="button"
                onClick={onClaim}
                disabled={claiming}
                className="font-pixel rounded-lg border-2 bg-[#22c55e] px-2.5 py-1 text-[9px] text-white transition hover:bg-[#16a34a] active:translate-y-0.5 disabled:opacity-50"
                style={{ borderColor: NAVY }}
              >
                {claiming ? "CLAIMING…" : "CLAIM"}
              </button>
            </div>
          )}

          {/* Fast Play Session Key Status */}
          <button
            type="button"
            onClick={onOpenSessionModal}
            className={`flex items-center gap-1.5 rounded-xl border-2 px-3 py-1.5 transition active:translate-y-0.5 ${
              sessionActive ? "bg-[#e0e7ff] text-[#1e1b4b]" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
            }`}
            style={{ borderColor: NAVY }}
            title="Fast Play (Session Keys) eliminates wallet popups mid-game"
          >
            <span className="text-xs">⚡</span>
            <span className="font-pixel text-[9px]">
              {sessionActive ? "FAST PLAY ON" : "FAST PLAY OFF"}
            </span>
          </button>
        </div>

        {/* Right: House Bankroll & Rules button */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Bankroll & Max Stake Chip */}
          <div
            className="flex items-center gap-2 rounded-xl border-2 px-3 py-1.5 text-right"
            style={{ borderColor: NAVY, background: "#f8fafc" }}
            title="10% max stake per flip guarantees house solvency"
          >
            <div>
              <p className="font-pixel text-[8px] uppercase tracking-wider text-zinc-500">
                HOUSE BANKROLL
              </p>
              <p className="font-pixel text-[10px] font-bold" style={{ color: NAVY }}>
                {formattedBankroll} · MAX {formattedMaxStake}
              </p>
            </div>
            <span className="text-xs">🏦</span>
          </div>

          {/* How-to Rules Button */}
          <button
            type="button"
            onClick={onOpenRulesModal}
            className="font-pixel flex h-9 w-9 items-center justify-center rounded-xl border-2 bg-white text-xs font-bold transition hover:bg-zinc-100 active:translate-y-0.5"
            style={{ borderColor: NAVY }}
            title="How to play"
          >
            ?
          </button>
        </div>
      </div>
    </div>
  );
}
