import { http, createConfig, injected } from "wagmi";
import {
  activeChain,
  localTestChain,
  robinhoodChain,
  robinhoodTestnet,
} from "./chain";

/** Injected connector only — no WalletConnect cloud dependency. */
export const config = createConfig({
  chains: [activeChain],
  connectors: [injected()],
  transports: {
    [robinhoodChain.id]: http(),
    [robinhoodTestnet.id]: http(),
    [localTestChain.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
