"use client";

import React, { useEffect, useState } from "react";
import { Card, ChunkyButton, NAVY, BLUE } from "../components/cartoon";

const STORAGE_KEY = "viper_sl_howto_dismissed";

interface HowToOverlayProps {
  forceOpen?: boolean;
  onClose?: () => void;
}

export function HowToOverlay({ forceOpen, onClose }: HowToOverlayProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
      return;
    }
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (!dismissed) {
      setOpen(true);
    }
  }, [forceOpen]);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setOpen(false);
    onClose?.();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      style={{ background: "rgba(11,18,48,0.75)" }}
    >
      <Card className="w-full max-w-lg animate-in fade-in zoom-in duration-200">
        <div className="text-center">
          <p
            className="font-pixel text-[10px] uppercase"
            style={{ color: NAVY, letterSpacing: "0.25em" }}
          >
            ARCADE HOW-TO
          </p>
          <h2
            className="font-pixel mt-2 text-xl leading-relaxed sm:text-2xl"
            style={{ color: NAVY }}
          >
            VIPER SNAKES & LADDERS
          </h2>
          <p className="mt-2 text-xs font-semibold" style={{ color: BLUE }}>
            4 Teams · 1 Token Per Team · First to 100 Takes 95% of Pot
          </p>
        </div>

        <div className="mt-6 space-y-3 text-xs">
          <div className="flex items-start gap-3 rounded-xl border-2 p-2.5" style={{ borderColor: NAVY }}>
            <span className="text-lg">🚩</span>
            <div>
              <span className="font-bold text-zinc-900">1. PICK YOUR TEAM & STAKE:</span>
              <p className="text-zinc-600 mt-0.5">
                Join RED, BLUE, GREEN, or YELLOW by staking USDG into the team pool during the 60s lobby. The winning team also splits a 4,000 VIPER bonus.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border-2 p-2.5" style={{ borderColor: NAVY }}>
            <span className="text-lg">🎲</span>
            <div>
              <span className="font-bold text-zinc-900">2. FIXED TURN ORDER:</span>
              <p className="text-zinc-600 mt-0.5">
                Teams race in order: RED → BLUE → GREEN → YELLOW. When it's your turn, ANY team member can roll.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border-2 p-2.5" style={{ borderColor: NAVY }}>
            <span className="text-lg">🪜</span>
            <div>
              <span className="font-bold text-zinc-900">3. LADDERS & SNAKES:</span>
              <p className="text-zinc-600 mt-0.5">
                Landing on a ladder base boosts you up. Landing on a snake head slides you back down.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border-2 p-2.5" style={{ borderColor: NAVY }}>
            <span className="text-lg">🏆</span>
            <div>
              <span className="font-bold text-zinc-900">4. WINNER TAKES 95%:</span>
              <p className="text-zinc-600 mt-0.5">
                First team to reach or exceed square 100 wins! Winning players split 95% of the USDG pot pro-rata by stake, plus a 4,000 VIPER bonus split the same way. 5% to treasury.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border-2 p-2.5" style={{ borderColor: NAVY }}>
            <span className="text-lg">⚡</span>
            <div>
              <span className="font-bold text-zinc-900">5. FAST PLAY (ZERO POP-UPS):</span>
              <p className="text-zinc-600 mt-0.5">
                Sign once at entry with a session key. Every dice roll is broadcast instantly with zero wallet confirmations!
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <ChunkyButton onClick={handleDismiss} className="w-full">
            GOT IT, LET'S RACE! →
          </ChunkyButton>
        </div>
      </Card>
    </div>
  );
}
