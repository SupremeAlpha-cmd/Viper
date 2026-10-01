"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { shortAddr } from "../lib/contract";
import { NAVY } from "./cartoon";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        className="rounded-full border-[3px] bg-white/10 px-4 py-2 font-mono text-sm text-white transition hover:bg-white/20"
        style={{ borderColor: "rgba(255,255,255,0.35)" }}
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
      className="font-pixel rounded-full border-[3px] bg-white px-5 py-2.5 text-[10px] transition hover:bg-[#dbeafe] disabled:opacity-50"
      style={{ borderColor: NAVY, color: NAVY }}
    >
      {isPending ? "CONNECTING…" : "CONNECT"}
    </button>
  );
}
