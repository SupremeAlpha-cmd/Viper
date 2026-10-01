"use client";

import React, { useEffect, useState } from "react";
import { NAVY, SKY, BLUE, AMBER, ChunkyButton } from "../components/cartoon";

const STORAGE_KEY = "viper_don_rules_dismissed";

export interface HowToOverlayProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function HowToOverlay({ isOpen: controlledOpen, onClose }: HowToOverlayProps) {
  const [internalOpen, setInternalOpen] = useState(false);

  // Auto-open on entry if not dismissed yet
  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(STORAGE_KEY);
      if (!dismissed) {
        setInternalOpen(true);
      }
    } catch {
      // LocalStorage unavailable in SSR or private mode
    }
  }, []);

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;

  const handleDismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    setInternalOpen(false);
    onClose?.();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div
        className="relative w-full max-w-lg rounded-3xl border-[4px] bg-white p-6 shadow-2xl transition-all"
        style={{
          borderColor: NAVY,
          boxShadow: `8px 8px 0 ${NAVY}`,
        }}
      >
        {/* Header Marquee */}
        <div
          className="-mx-6 -mt-6 mb-5 rounded-t-[20px] border-b-[4px] px-6 py-4 text-center"
          style={{ borderColor: NAVY, background: "#fbbf24" }}
        >
          <p className="font-pixel text-[10px] tracking-widest text-amber-900">
            ★ VIPER ARCADE RULES ★
          </p>
          <h2 className="font-pixel mt-1 text-base text-[#0b1230]">
            DOUBLE OR NOTHING
          </h2>
        </div>

        {/* Content Body */}
        <div className="space-y-3.5 text-xs text-[#0b1230]">
          <div className="flex items-start gap-3 rounded-2xl border-2 bg-slate-50 p-3" style={{ borderColor: NAVY }}>
            <span className="text-xl">1️⃣</span>
            <div>
              <p className="font-pixel text-[10px] font-bold">PICK & STAKE</p>
              <p className="mt-0.5 text-zinc-600 leading-relaxed">
                Choose Heads or Tails and stake your VIPER. Max stake is capped at 10% of the bankroll to protect house solvency.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border-2 bg-slate-50 p-3" style={{ borderColor: NAVY }}>
            <span className="text-xl">2️⃣</span>
            <div>
              <p className="font-pixel text-[10px] font-bold">HIDDEN COMMITMENT</p>
              <p className="mt-0.5 text-zinc-600 leading-relaxed">
                Your browser hashes your pick with a random secret (<code className="font-mono text-[10px]">keccak256(choice, secret)</code>) so no one can front-run your guess.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border-2 bg-slate-50 p-3" style={{ borderColor: NAVY }}>
            <span className="text-xl">3️⃣</span>
            <div>
              <p className="font-pixel text-[10px] font-bold">REVEAL & FAIR COIN</p>
              <p className="mt-0.5 text-zinc-600 leading-relaxed">
                Reveal within 50 blocks. The contract flips a fair coin. Win pays <strong>1.9x</strong> (2x minus 5% arcade fee) from the bankroll! Lose, and the stake goes to the house bankroll.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border-2 bg-slate-50 p-3" style={{ borderColor: NAVY }}>
            <span className="text-xl">4️⃣</span>
            <div>
              <p className="font-pixel text-[10px] font-bold">50-BLOCK SAFETY REFUND</p>
              <p className="mt-0.5 text-zinc-600 leading-relaxed">
                If not revealed within 50 blocks, your entire stake is 100% reclaimable via the refund button.
              </p>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="mt-6 flex justify-center">
          <ChunkyButton onClick={handleDismiss} className="w-full text-center">
            GOT IT! LET’S FLIP 🎲
          </ChunkyButton>
        </div>
      </div>
    </div>
  );
}
