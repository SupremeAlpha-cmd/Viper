"use client";

import { useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { erc20Abi } from "../lib/snake";

/**
 * BalanceChip — the USDG entry-token balance, always visible while playing.
 * Tracks session P&L per game (localStorage `viper-pnl-<game>`): the first
 * balance seen becomes the session baseline. Between matches, a -25% / -50%
 * drawdown surfaces the check-in card: keep going or top up?
 */
export function BalanceChip({
  game,
  usdg,
  tokenSymbol,
  tokenDecimals,
  betweenMatches,
}: {
  game: string;
  usdg: `0x${string}` | null;
  tokenSymbol: string;
  tokenDecimals: number;
  betweenMatches: boolean;
}) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [balance, setBalance] = useState<bigint | null>(null);
  const [baseline, setBaseline] = useState<bigint | null>(null);
  const [dismissedAt, setDismissedAt] = useState<number>(0);

  useEffect(() => {
    if (!publicClient || !usdg || !address) return;
    let stop = false;
    const load = async () => {
      try {
        const bal = (await publicClient.readContract({
          address: usdg,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        })) as bigint;
        if (stop) return;
        setBalance(bal);
        const key = `viper-pnl-${game}`;
        try {
          const saved = localStorage.getItem(key);
          if (saved === null) {
            localStorage.setItem(key, bal.toString());
            setBaseline(bal);
          } else {
            setBaseline(BigInt(saved));
          }
        } catch {
          setBaseline(bal);
        }
      } catch { /* ignore */ }
    };
    load();
    const t = setInterval(load, 15000);
    return () => { stop = true; clearInterval(t); };
  }, [publicClient, usdg, address, game]);

  if (balance === null || !address) return null;

  const fmt = (v: bigint) => {
    const neg = v < BigInt(0);
    const a = neg ? -v : v;
    const whole = a / BigInt(10 ** tokenDecimals);
    const frac = a % BigInt(10 ** tokenDecimals);
    const fracStr = frac.toString().padStart(tokenDecimals, "0").slice(0, 2);
    return `${neg ? "-" : ""}${whole.toString()}.${fracStr}`;
  };

  const pnl = baseline !== null ? balance - baseline : BigInt(0);
  const drawdown =
    baseline !== null && baseline > BigInt(0)
      ? Number((baseline - balance) * BigInt(10000) / baseline) / 100
      : 0;
  const showCheckIn =
    betweenMatches && drawdown >= 25 && Date.now() - dismissedAt > 5 * 60 * 1000;

  return (
    <>
      <div
        className="font-pixel inline-flex items-center gap-2 rounded-full border-2 border-[#1e293b] bg-[#0b1020] px-4 py-2 text-[10px] text-zinc-200"
        title="Your USDG balance"
      >
        <span>🪙</span>
        <span>{fmt(balance)} {tokenSymbol}</span>
        {baseline !== null && pnl !== BigInt(0) && (
          <span style={{ color: pnl > BigInt(0) ? "#22c55e" : "#ef4444" }}>
            {pnl > BigInt(0) ? "+" : ""}{fmt(pnl)}
          </span>
        )}
      </div>
      {showCheckIn && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(4,8,16,0.82)" }}
        >
          <div className="w-full max-w-sm rounded-3xl border-2 border-amber-400 bg-[#0b1020] p-6 text-center">
            <div className="text-4xl">⚠️</div>
            <h3 className="font-pixel mt-3 text-xs leading-relaxed text-amber-300">
              DOWN {drawdown.toFixed(0)}% THIS SESSION
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              You're down {fmt(-pnl)} {tokenSymbol} since you started {game}.
              Want to keep going or top up first?
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                onClick={() => setDismissedAt(Date.now())}
                className="font-pixel rounded-2xl bg-amber-400 py-3 text-[10px] text-black transition active:scale-[0.98]"
              >
                KEEP GOING
              </button>
              <button
                onClick={() => {
                  try {
                    localStorage.setItem(`viper-pnl-${game}`, balance.toString());
                  } catch { /* ignore */ }
                  setBaseline(balance);
                  setDismissedAt(Date.now());
                }}
                className="font-pixel rounded-2xl border-2 border-amber-400 py-3 text-[10px] text-amber-300 transition active:scale-[0.98]"
                title="Reset the session baseline from your current balance"
              >
                TOPPED UP
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
