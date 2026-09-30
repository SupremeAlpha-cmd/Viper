import { http, createConfig, injected } from "wagmi";
import { robinhoodChain } from "./chain";

/** Injected connector only — no WalletConnect cloud dependency. */
export const config = createConfig({
  chains: [robinhoodChain],
  connectors: [injected()],
  transports: { [robinhoodChain.id]: http() },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
