"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { shortAddr } from "../lib/contract";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-zinc-200 transition hover:border-white/30"
        title="Disconnect"
      >
        {shortAddr(address)}
      </button>
    );
  }
  return (
    <button
      onClick={() => connectors[0] && connect({ connector: connectors[0] })}
      disabled={isPending}
      className="rounded-full bg-lime-400 px-5 py-2 text-sm font-semibold text-black transition hover:bg-lime-300 disabled:opacity-50"
    >
      {isPending ? "Connecting…" : "Connect wallet"}
    </button>
  );
}
