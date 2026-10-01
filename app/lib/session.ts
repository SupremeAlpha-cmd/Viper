import {
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { activeChain } from "./chain";

/**
 * session.ts — self-funded session keys for zero-pop-up gameplay.
 *
 * The player authorizes a browser-held ephemeral key once (folded into
 * join via joinWithSession). The key pays its own gas from a small native
 * top-up, and every gameplay action is signed + broadcast locally — the
 * injected wallet never sees mid-game actions, so there are no pop-ups.
 *
 * Security bounds (contract-enforced): the key resolves to its player ONLY
 * in gameplay functions, only in the match it joined, only while unexpired
 * and unrevoked. It can never move tokens. Worst case if the browser is
 * compromised: someone plays badly on your behalf in one match, spending
 * your gas dust. Revoke on-chain any time via revokeSession().
 *
 * Key custody: memory-only (React ref in the game hook). Dies with the tab.
 * This is the safest default; a reload means re-joining the next lobby.
 *
 * Multi-game: SessionSender and estimateTopUp take a `target`
 * { address, abi } so every arcade game shares this file unchanged.
 */

export const SESSION_TTL_SECONDS = 2 * 60 * 60; // 2h — comfortably exceeds any match
export const TOP_UP_MOVES = 300; // top-up covers ~this many actions
const GAS_PAD_BPS = 13000; // +30% headroom on the move estimate (plantBomb is heavier)
const LOW_GAS_MOVE_BUFFER = 20; // warn when fewer than ~this many moves remain

export interface SessionKey {
  address: `0x${string}`;
  expiresAt: number; // unix seconds, mirrors the on-chain expiry
}

export interface SessionHandle {
  session: SessionKey;
  sender: SessionSender;
  /** Native top-up sizing, computed at session creation. */
  topUpWei: bigint;
  topUpMoves: number;
  gasPerMove: bigint;
  gasPrice: bigint;
}

export function createSessionKey(): {
  privateKey: `0x${string}`;
  session: SessionKey;
} {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return {
    privateKey,
    session: {
      address: account.address,
      expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    },
  };
}

/**
 * Serialized, locally-nonce-managed sender for session-key gameplay txs.
 * Actions are fire-and-forget through a promise queue so rapid keypresses
 * can't collide on nonces; on a nonce error we resync from chain once.
 */
export interface SessionTarget {
  address: `0x${string}`;
  abi: any;
}

export class SessionSender {
  private client: WalletClient;
  private publicClient: PublicClient;
  private target: SessionTarget;
  private nonce: number | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    privateKey: `0x${string}`,
    publicClient: PublicClient,
    target: SessionTarget
  ) {
    const account = privateKeyToAccount(privateKey);
    this.client = createWalletClient({
      account,
      chain: activeChain,
      transport: http(activeChain.rpcUrls.default.http[0]),
    });
    this.publicClient = publicClient;
    this.target = target;
  }

  get address(): `0x${string}` {
    return (this.client.account as { address: `0x${string}` }).address;
  }

  private async nextNonce(): Promise<number> {
    let n = this.nonce;
    if (n === null) {
      n = await this.publicClient.getTransactionCount({
        address: this.address,
        blockTag: "pending",
      });
    }
    this.nonce = n + 1;
    return n;
  }

  send(fn: string, args: unknown[]): Promise<`0x${string}`> {
    const run = this.queue.then(() => this._send(fn, args));
    // Keep the queue alive past individual failures.
    this.queue = run.catch(() => {});
    return run;
  }

  private async _send(fn: string, args: unknown[]): Promise<`0x${string}`> {
    const account = this.client.account!;
    const attempt = async () =>
      this.client.writeContract({
        address: this.target.address,
        abi: this.target.abi,
        functionName: fn,
        args,
        account,
        chain: activeChain,
        nonce: await this.nextNonce(),
      });
    try {
      return await attempt();
    } catch (e: unknown) {
      const msg = String((e as Error)?.message ?? e);
      if (/nonce|replacement|already known/i.test(msg)) {
        this.nonce = null; // resync from chain and retry once
        return await attempt();
      }
      throw e;
    }
  }
}

const FALLBACK_GAS_PER_MOVE = BigInt(120_000);

/** Size the native top-up: padded per-action gas x gas price x TOP_UP_MOVES. */
export async function estimateTopUp(
  publicClient: PublicClient,
  sessionAddress: `0x${string}`,
  target: SessionTarget,
  fn = "move",
  args: unknown[] = [1, 0]
): Promise<{ wei: bigint; gasPerMove: bigint; gasPrice: bigint }> {
  let gasPerMove = FALLBACK_GAS_PER_MOVE;
  try {
    const est = await publicClient.estimateContractGas({
      address: target.address,
      abi: target.abi,
      functionName: fn,
      args,
      account: sessionAddress,
    });
    gasPerMove = (est * BigInt(GAS_PAD_BPS)) / BigInt(10_000);
  } catch {
    /* un-deployed / unreachable — fall back to the constant */
  }
  let gasPrice = BigInt(0);
  try {
    gasPrice = await publicClient.getGasPrice();
  } catch {
    /* leave 0 — the UI will show the top-up as unavailable */
  }
  return {
    wei: gasPerMove * gasPrice * BigInt(TOP_UP_MOVES),
    gasPerMove,
    gasPrice,
  };
}

export function isSessionLive(session: SessionKey | null): boolean {
  return !!session && Date.now() / 1000 < session.expiresAt;
}

/** True when the session key's native balance covers fewer than ~20 moves. */
export async function isSessionGasLow(
  publicClient: PublicClient,
  sessionAddress: `0x${string}`,
  gasPerMove: bigint,
  gasPrice: bigint
): Promise<boolean> {
  try {
    const bal = await publicClient.getBalance({ address: sessionAddress });
    return bal < gasPerMove * gasPrice * BigInt(LOW_GAS_MOVE_BUFFER);
  } catch {
    return false;
  }
}
