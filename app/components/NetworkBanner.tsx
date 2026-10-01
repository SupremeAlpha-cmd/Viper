"use client";

import { useState } from "react";
import { useAccount, useSwitchChain, useWalletClient } from "wagmi";
import { activeChain } from "../lib/chain";
import { NAVY } from "./cartoon";

/**
 * Wrong-network detection: wagmi is configured with a single expected chain
 * (Robinhood Chain in production, Anvil in NEXT_PUBLIC_LOCAL_TEST=1).
 * If the connected wallet sits on any other chain, writes would target the
 * wrong network — show a banner with a one-click switch.
 */
export function NetworkBanner() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isConnected || chainId === undefined || chainId === activeChain.id) {
    return null;
  }

  const handleSwitch = () => {
    setError(null);
    switchChain(
      { chainId: activeChain.id },
      {
        onError: async (e: any) => {
          // 4902 = chain unknown to the wallet → add it, then the user switches.
          const code = e?.cause?.code ?? e?.code;
          if (code === 4902 || /not recognized|not added/i.test(e?.message ?? "")) {
            try {
              setAdding(true);
              const rpcUrls = activeChain.rpcUrls.default.http;
              const explorer =
                activeChain.blockExplorers?.default?.url;
              await walletClient?.request({
                method: "wallet_addEthereumChain",
                params: [
                  {
                    chainId: `0x${activeChain.id.toString(16)}`,
                    chainName: activeChain.name,
                    nativeCurrency: activeChain.nativeCurrency,
                    rpcUrls,
                    blockExplorerUrls: explorer ? [explorer] : undefined,
                  },
                ],
              });
              // After adding, retry the switch.
              switchChain({ chainId: activeChain.id });
            } catch (ae: any) {
              setError(ae?.shortMessage || ae?.message || "Failed to add network");
            } finally {
              setAdding(false);
            }
          } else {
            setError(e?.shortMessage || e?.message || "Network switch failed");
          }
        },
      }
    );
  };

  const busy = switching || adding;

  return (
    <div
      className="mb-6 rounded-2xl border-[3px] bg-amber-300 p-4"
      style={{ borderColor: NAVY, boxShadow: `4px 4px 0 ${NAVY}` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-pixel text-[11px]" style={{ color: NAVY }}>
            ⚠ WRONG NETWORK
          </div>
          <div
            className="mt-1 text-sm font-medium"
            style={{ color: NAVY, opacity: 0.8 }}
          >
            Your wallet is on chain {chainId}. Switch to{" "}
            <span className="font-bold">{activeChain.name}</span> to play.
          </div>
          {error && (
            <div className="mt-1 text-xs font-bold text-red-700">{error}</div>
          )}
        </div>
        <button
          onClick={handleSwitch}
          disabled={busy}
          className="font-pixel rounded-2xl border-[3px] bg-white px-5 py-2.5 text-[10px] transition active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-40"
          style={{
            borderColor: NAVY,
            color: NAVY,
            boxShadow: `3px 3px 0 ${NAVY}`,
          }}
        >
          {busy ? "SWITCHING…" : `SWITCH TO ${activeChain.name.toUpperCase()}`}
        </button>
      </div>
    </div>
  );
}
