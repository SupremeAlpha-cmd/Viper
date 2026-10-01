"use client";

import React from "react";
import { NAVY, BLUE, AMBER } from "../components/cartoon";

export interface CoinVisualProps {
  choice: 0 | 1; // 0: Heads, 1: Tails
  onSelectChoice?: (choice: 0 | 1) => void;
  flipping: boolean;
  result?: {
    won: boolean;
    coin: 0 | 1;
    payout: bigint;
  } | null;
  disabled?: boolean;
}

export function CoinVisual({
  choice,
  onSelectChoice,
  flipping,
  result,
  disabled = false,
}: CoinVisualProps) {
  // Determine displayed face:
  // When flipping, rapid spin animation runs.
  // When result is present, display the result coin.
  // Otherwise, display user's current choice.
  const activeFace = result ? result.coin : choice;

  return (
    <div className="flex flex-col items-center justify-center py-4">
      {/* 3D Coin Stage */}
      <div
        className="relative flex items-center justify-center"
        style={{ perspective: 1000 }}
      >
        <div
          className={`relative h-44 w-44 rounded-full transition-transform duration-700 ${
            flipping ? "animate-spin-3d" : ""
          }`}
          style={{
            transformStyle: "preserve-3d",
            transform: flipping
              ? undefined
              : activeFace === 1
              ? "rotateY(180deg)"
              : "rotateY(0deg)",
            boxShadow: `0 12px 0 #92400e, 0 16px 20px rgba(11,18,48,0.4)`,
          }}
        >
          {/* Front: HEADS */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-full border-[5px] select-none"
            style={{
              backfaceVisibility: "hidden",
              borderColor: NAVY,
              background: "radial-gradient(circle at 35% 35%, #fef08a, #f59e0b 65%, #b45309)",
            }}
          >
            {/* Inner beaded ring */}
            <div
              className="absolute inset-2 rounded-full border-2 border-dashed opacity-40"
              style={{ borderColor: NAVY }}
            />
            {/* Icon */}
            <div className="text-4xl drop-shadow-md">🐍</div>
            <span
              className="font-pixel mt-1 text-xs font-bold tracking-widest"
              style={{ color: NAVY }}
            >
              HEADS
            </span>
            <span
              className="font-pixel text-[8px] font-medium tracking-tight opacity-75"
              style={{ color: NAVY }}
            >
              VIPER
            </span>
          </div>

          {/* Back: TAILS */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-full border-[5px] select-none"
            style={{
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
              borderColor: NAVY,
              background: "radial-gradient(circle at 35% 35%, #fed7aa, #ea580c 65%, #9a3412)",
            }}
          >
            {/* Inner beaded ring */}
            <div
              className="absolute inset-2 rounded-full border-2 border-dashed opacity-40"
              style={{ borderColor: NAVY }}
            />
            {/* Icon */}
            <div className="text-4xl drop-shadow-md">🪙</div>
            <span
              className="font-pixel mt-1 text-xs font-bold tracking-widest text-white"
              style={{ textShadow: `1px 1px 0 ${NAVY}` }}
            >
              TAILS
            </span>
            <span
              className="font-pixel text-[8px] font-medium tracking-tight text-white/90"
              style={{ textShadow: `1px 1px 0 ${NAVY}` }}
            >
              2X POT
            </span>
          </div>
        </div>

        {/* Shadow underneath */}
        <div
          className="absolute -bottom-6 h-4 w-32 rounded-full opacity-40 blur-[3px]"
          style={{ background: NAVY }}
        />
      </div>

      {/* Outcome Banner */}
      {result && !flipping && (
        <div className="mt-8 animate-bounce">
          {result.won ? (
            <div
              className="rounded-2xl border-[3px] px-6 py-2 text-center"
              style={{
                borderColor: NAVY,
                background: "#22c55e",
                color: "#ffffff",
                boxShadow: `4px 4px 0 ${NAVY}`,
              }}
            >
              <p className="font-pixel text-xs tracking-wider">★ YOU WON! ★</p>
              <p className="text-[11px] font-bold">Payout Credited (1.9x)</p>
            </div>
          ) : (
            <div
              className="rounded-2xl border-[3px] px-6 py-2 text-center"
              style={{
                borderColor: NAVY,
                background: "#ef4444",
                color: "#ffffff",
                boxShadow: `4px 4px 0 ${NAVY}`,
              }}
            >
              <p className="font-pixel text-xs tracking-wider">HOUSE WINS</p>
              <p className="text-[11px] font-bold">Stake Added to Bankroll</p>
            </div>
          )}
        </div>
      )}

      {/* Pick Side Buttons */}
      <div className="mt-8 flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => !disabled && !flipping && onSelectChoice?.(0)}
          disabled={disabled || flipping}
          className={`font-pixel flex items-center gap-2 rounded-2xl border-[3px] px-5 py-3 text-xs transition active:translate-x-[2px] active:translate-y-[2px] ${
            choice === 0
              ? "bg-[#fbbf24] text-[#0b1230] ring-4 ring-[#0b1230]/20"
              : "bg-white text-[#0b1230] opacity-80 hover:opacity-100"
          }`}
          style={{
            borderColor: NAVY,
            boxShadow: choice === 0 ? `4px 4px 0 ${NAVY}` : `2px 2px 0 ${NAVY}`,
          }}
        >
          <span>🐍</span>
          <span>HEADS</span>
          {choice === 0 && <span className="text-[10px]">✔</span>}
        </button>

        <button
          type="button"
          onClick={() => !disabled && !flipping && onSelectChoice?.(1)}
          disabled={disabled || flipping}
          className={`font-pixel flex items-center gap-2 rounded-2xl border-[3px] px-5 py-3 text-xs transition active:translate-x-[2px] active:translate-y-[2px] ${
            choice === 1
              ? "bg-[#fb923c] text-white ring-4 ring-[#0b1230]/20"
              : "bg-white text-[#0b1230] opacity-80 hover:opacity-100"
          }`}
          style={{
            borderColor: NAVY,
            boxShadow: choice === 1 ? `4px 4px 0 ${NAVY}` : `2px 2px 0 ${NAVY}`,
          }}
        >
          <span>🪙</span>
          <span>TAILS</span>
          {choice === 1 && <span className="text-[10px]">✔</span>}
        </button>
      </div>

      <style jsx>{`
        @keyframes spin3d {
          0% {
            transform: rotateY(0deg);
          }
          100% {
            transform: rotateY(1800deg);
          }
        }
        .animate-spin-3d {
          animation: spin3d 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
      `}</style>
    </div>
  );
}
