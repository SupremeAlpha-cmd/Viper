import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { decodeEventLog } from "viem";
import {
  VIPER_ARENA_ADDRESS,
  isDeployed,
  viperAbi,
  erc20Abi,
} from "./contract";
import {
  createSessionKey,
  estimateTopUp,
  isSessionGasLow,
  isSessionLive,
  SessionSender,
  TOP_UP_MOVES,
  type SessionKey,
} from "./session";

export { formatTokens } from "./format";

export interface PlayerState {
  address: `0x${string}`;
  x: number;
  y: number;
  alive: boolean;
}

export interface BombState {
  x: number;
  y: number;
  planter: `0x${string}`;
  detonateAt: number;
  live: boolean;
}

export interface Flash {
  x: number;
  y: number;
  key: number;
}

export interface MatchResult {
  kind: "win" | "split" | "cancelled";
  winner?: `0x${string}`;
  prize?: bigint;
  recipients?: number;
  share?: bigint;
  matchId: number;
}

const POLL_MS = 2000;

const num = (v: unknown): number => Number(v as bigint);

/**
 * useViper — live view of the arena.
 * Polls contract state every 2s, rebuilds the grid from reads,
 * and layers explosion flashes + match results from event logs.
 */
export function useViper() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [phase, setPhase] = useState<"lobby" | "live" | null>(null);
  const [matchId, setMatchId] = useState<number>(0);
  const [lobbyEndsAt, setLobbyEndsAt] = useState<number>(0);
  const [liveEndsAt, setLiveEndsAt] = useState<number>(0);
  const [blockNumber, setBlockNumber] = useState<number>(0);
  const [players, setPlayers] = useState<PlayerState[]>([]);
  const [bombs, setBombs] = useState<BombState[]>([]);
  const [pot, setPot] = useState<bigint>(BigInt(0));
  const [aliveCount, setAliveCount] = useState<number>(0);
  const [entryFee, setEntryFee] = useState<bigint>(BigInt(0));
  const [stakeToken, setStakeToken] = useState<`0x${string}` | null>(null);
  const [tokenSymbol, setTokenSymbol] = useState<string>("tokens");
  const [tokenDecimals, setTokenDecimals] = useState<number>(18);
  const [flashes, setFlashes] = useState<Flash[]>([]);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [pendingWithdrawal, setPendingWithdrawal] = useState<bigint>(BigInt(0));
  const [error, setError] = useState<string | null>(null);
  // Session-key fast play: public parts in state, the private key in a ref
  // (memory-only — never in state, never persisted).
  const [session, setSession] = useState<SessionKey | null>(null);
  const [topUp, setTopUp] = useState<{ wei: bigint; moves: number } | null>(null);
  const [sessionLowGas, setSessionLowGas] = useState(false);
  const sessionPrivRef = useRef<`0x${string}` | null>(null);
  const sessionSenderRef = useRef<SessionSender | null>(null);
  const sessionGasRef = useRef<{ gasPerMove: bigint; gasPrice: bigint } | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lastBlockRef = useRef<bigint>(BigInt(0));
  const matchIdRef = useRef<number>(0);
  const flashKey = useRef(0);

  const read = useCallback(
    async <T,>(fn: string, args: unknown[] = []): Promise<T> => {
      if (!publicClient || !isDeployed) throw new Error("no client");
      return publicClient.readContract({
        address: VIPER_ARENA_ADDRESS,
        abi: viperAbi,
        functionName: fn,
        args,
      }) as Promise<T>;
    },
    [publicClient]
  );

  const sync = useCallback(async () => {
    if (!publicClient || !isDeployed) return;
    try {
      const [ph, mid, block] = await Promise.all([
        read<number>("phase"),
        read<bigint>("matchId"),
        publicClient.getBlockNumber(),
      ]);
      const midNum = num(mid);
      setBlockNumber(num(block));

      // New match rolled over: clear result banner + flashes.
      if (midNum !== matchIdRef.current) {
        matchIdRef.current = midNum;
        setMatchId(midNum);
        setResult(null);
        setFlashes([]);
        // Sessions are match-scoped on-chain: drop the local key on rollover.
        sessionPrivRef.current = null;
        sessionSenderRef.current = null;
        sessionGasRef.current = null;
        setSession(null);
        setTopUp(null);
        setSessionLowGas(false);
      }

      setPhase(ph === 0 ? "lobby" : "live");

      const [potV, aliveN, fee, token] = await Promise.all([
        read<bigint>("pot"),
        read<bigint>("aliveCount"),
        read<bigint>("entryFee"),
        read<`0x${string}`>("stakeToken"),
      ]);
      setPot(potV);
      setAliveCount(num(aliveN));
      setEntryFee(fee);
      setStakeToken(token);

      if (ph === 0) {
        const ends = await read<bigint>("lobbyEndsAt");
        setLobbyEndsAt(num(ends));
      } else {
        const ends = await read<bigint>("liveEndsAt");
        setLiveEndsAt(num(ends));
      }

      // Whole player roster in one call (no multicall3 on Robinhood Chain).
      const [addrs, xs, ys, alives] = (await read<unknown[]>("getMatchState")) as [
        `0x${string}`[], bigint[], bigint[], boolean[]
      ];
      setPlayers(
        addrs.map((a, i) => ({
          address: a,
          x: num(xs[i]),
          y: num(ys[i]),
          alive: alives[i],
        }))
      );

      const rawBombs = await read<any[]>("getBombs");
      setBombs(
        rawBombs
          .filter((b) => b.live)
          .map((b) => ({
            x: num(b.x),
            y: num(b.y),
            planter: b.planter as `0x${string}`,
            detonateAt: num(b.detonateAt),
            live: b.live as boolean,
          }))
      );

      // Token metadata (once).
      if (token) {
        try {
          const [sym, dec] = await Promise.all([
            publicClient.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }),
            publicClient.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
          ]);
          setTokenSymbol(sym as string);
          setTokenDecimals(num(dec));
        } catch { /* non-standard token */ }
      }

      // Pull-payment balance: what the connected wallet can claim().
      if (address) {
        try {
          const pw = await publicClient.readContract({
            address: VIPER_ARENA_ADDRESS,
            abi: viperAbi,
            functionName: "pendingWithdrawals",
            args: [address],
          }) as bigint;
          setPendingWithdrawal(pw);
        } catch { /* pre-pull-payment ABI / no balance */ }
      }

      // Event logs since last poll: explosion flashes + match results.
      const from = lastBlockRef.current === BigInt(0) ? block : lastBlockRef.current + BigInt(1);
      if (from <= block) {
        const logs = await publicClient.getLogs({
          address: VIPER_ARENA_ADDRESS,
          fromBlock: from,
          toBlock: block,
        });
        for (const log of logs) {
          let decoded: { eventName: string; args: any } | null = null;
          try {
            decoded = decodeEventLog({
              abi: viperAbi,
              data: log.data,
              topics: log.topics,
            }) as { eventName: string; args: any };
          } catch { continue; }
          const { eventName, args } = decoded;
          if (eventName === "BombExploded") {
            const k = ++flashKey.current;
            const fx = num(args.x), fy = num(args.y);
            setFlashes((f) => [...f.slice(-24), { x: fx, y: fy, key: k }]);
            setTimeout(() => {
              setFlashes((f) => f.filter((x) => x.key !== k));
            }, 700);
          } else if (eventName === "MatchEnded") {
            setResult({
              kind: "win",
              winner: args.winner,
              prize: args.prize as bigint,
              matchId: num(args.matchId),
            });
          } else if (eventName === "PotSplit") {
            setResult({
              kind: "split",
              recipients: num(args.recipients),
              share: args.share as bigint,
              matchId: num(args.matchId),
            });
          } else if (eventName === "MatchCancelled") {
            setResult({ kind: "cancelled", matchId: num(args.matchId) });
          }
        }
        lastBlockRef.current = block;
      }
      setError(null);
    } catch (e: any) {
      setError(e?.shortMessage || e?.message || "sync failed");
    }
  }, [publicClient, read, address]);

  useEffect(() => {
    if (!isDeployed) return;
    sync();
    const t = setInterval(sync, POLL_MS);
    return () => clearInterval(t);
  }, [sync]);

  // Session gas watch: warn when the key's dust covers fewer than ~20 moves.
  useEffect(() => {
    if (!session || !publicClient) return;
    const g = sessionGasRef.current;
    if (!g) return;
    let stop = false;
    const check = async () => {
      const low = await isSessionGasLow(
        publicClient,
        session.address,
        g.gasPerMove,
        g.gasPrice
      );
      if (!stop) setSessionLowGas(low);
    };
    check();
    const t = setInterval(check, 15000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [session, publicClient]);

  // Trailing sync after session-key sends: one deferred poll instead of a
  // sync per keypress, so rapid moves don't spam the RPC.
  const scheduleSync = useCallback(() => {
    if (syncTimerRef.current) return;
    syncTimerRef.current = setTimeout(() => {
      syncTimerRef.current = null;
      sync();
    }, 800);
  }, [sync]);

  const write = useCallback(
    async (label: string, fn: string, args: unknown[] = []) => {
      if (!walletClient || !address) throw new Error("connect wallet first");
      setPending(label);
      setError(null);
      try {
        const hash = await walletClient.writeContract({
          address: VIPER_ARENA_ADDRESS,
          abi: viperAbi,
          functionName: fn,
          args,
          account: address,
          chain: walletClient.chain,
        });
        await publicClient?.waitForTransactionReceipt({ hash });
        await sync();
      } catch (e: any) {
        setError(e?.shortMessage || e?.message || "transaction failed");
        throw e;
      } finally {
        setPending(null);
      }
    },
    [walletClient, address, publicClient, sync]
  );

  /** Join the lobby: approves the entry fee first if needed. */
  const join = useCallback(async () => {
    if (!walletClient || !address || !publicClient || !stakeToken) return;
    setPending("join");
    setError(null);
    try {
      const allowance = (await publicClient.readContract({
        address: stakeToken, abi: erc20Abi, functionName: "allowance",
        args: [address, VIPER_ARENA_ADDRESS],
      })) as bigint;
      if (allowance < entryFee) {
        const hash = await walletClient.writeContract({
          address: stakeToken, abi: erc20Abi, functionName: "approve",
          args: [VIPER_ARENA_ADDRESS, entryFee],
          account: address, chain: walletClient.chain,
        });
        await publicClient.waitForTransactionReceipt({ hash });
      }
      await write("join", "join");
    } catch (e: any) {
      setError(e?.shortMessage || e?.message || "join failed");
    } finally {
      setPending(null);
    }
  }, [walletClient, address, publicClient, stakeToken, entryFee, write]);

  const startMatch = useCallback(() => write("start", "startMatch"), [write]);
  /** Claim pull-payment winnings credited to the connected wallet. */
  const claimWinnings = useCallback(() => write("claim", "claim"), [write]);

  /**
   * Gameplay send: routes through the session key when one is live (zero
   * pop-ups, fire-and-forget so rapid keypresses aren't throttled), else
   * falls back to the wallet path. An ended session is cleared with a
   * notice instead of silently degrading into per-move pop-ups.
   */
  const sessionSend = useCallback(
    async (fn: "move" | "plantBomb", args: unknown[]) => {
      const sender = sessionSenderRef.current;
      if (session && sender && isSessionLive(session)) {
        try {
          await sender.send(fn, args);
          scheduleSync();
        } catch (e: any) {
          setError(e?.shortMessage || e?.message || "session tx failed");
          throw e;
        }
        return;
      }
      if (session) {
        sessionPrivRef.current = null;
        sessionSenderRef.current = null;
        sessionGasRef.current = null;
        setSession(null);
        setTopUp(null);
        setError(
          "Fast-play session ended — moves will ask your wallet again. Rejoin the next lobby for zero pop-ups."
        );
      }
      await write(fn === "move" ? "move" : "bomb", fn, args);
    },
    [session, write, scheduleSync]
  );

  const move = useCallback(
    (dx: number, dy: number) => sessionSend("move", [dx, dy]),
    [sessionSend]
  );
  const plantBomb = useCallback(() => sessionSend("plantBomb", []), [sessionSend]);
  const poke = useCallback(() => write("poke", "poke"), [write]);

  /**
   * Fast join: approve (if needed) -> joinWithSession -> native top-up,
   * then the session key takes over gameplay with zero pop-ups.
   * Entry costs ~3 wallet confirmations; everything after is popup-free.
   */
  const joinFast = useCallback(async () => {
    if (!walletClient || !address || !publicClient || !stakeToken) return;
    setPending("join");
    setError(null);
    try {
      // 1. Ephemeral key — memory only, never leaves this tab.
      const { privateKey, session: newSession } = createSessionKey();
      // 2. Size the gas dust for ~300 moves.
      const { wei: topUpWei, gasPerMove, gasPrice } = await estimateTopUp(
        publicClient,
        newSession.address
      );
      if (topUpWei === BigInt(0) || gasPrice === BigInt(0)) {
        throw new Error("could not estimate gas — check the network and try again");
      }
      // 3. Entry-fee approval if needed (popup 1).
      const allowance = (await publicClient.readContract({
        address: stakeToken, abi: erc20Abi, functionName: "allowance",
        args: [address, VIPER_ARENA_ADDRESS],
      })) as bigint;
      if (allowance < entryFee) {
        const hash = await walletClient.writeContract({
          address: stakeToken, abi: erc20Abi, functionName: "approve",
          args: [VIPER_ARENA_ADDRESS, entryFee],
          account: address, chain: walletClient.chain,
        });
        await publicClient.waitForTransactionReceipt({ hash });
      }
      // 4. Join + authorize the session key in one tx (popup 2).
      const joinHash = await walletClient.writeContract({
        address: VIPER_ARENA_ADDRESS, abi: viperAbi, functionName: "joinWithSession",
        args: [newSession.address, newSession.expiresAt],
        account: address, chain: walletClient.chain,
      });
      await publicClient.waitForTransactionReceipt({ hash: joinHash });
      // 5. Native top-up so the key can pay its own gas (popup 3).
      const topHash = await walletClient.sendTransaction({
        to: newSession.address,
        value: topUpWei,
        account: address,
        chain: walletClient.chain,
      });
      await publicClient.waitForTransactionReceipt({ hash: topHash });
      // 6. Go live: the local signer takes over gameplay.
      sessionPrivRef.current = privateKey;
      sessionSenderRef.current = new SessionSender(privateKey, publicClient);
      sessionGasRef.current = { gasPerMove, gasPrice };
      setSession(newSession);
      setTopUp({ wei: topUpWei, moves: TOP_UP_MOVES });
      setSessionLowGas(false);
      await sync();
    } catch (e: any) {
      setError(e?.shortMessage || e?.message || "fast join failed");
    } finally {
      setPending(null);
    }
  }, [walletClient, address, publicClient, stakeToken, entryFee, sync]);

  /** Revoke the session key on-chain (player or key can call). */
  const revokeSession = useCallback(async () => {
    if (!session) return;
    try {
      await write("revoke", "revokeSession", [session.address]);
    } finally {
      sessionPrivRef.current = null;
      sessionSenderRef.current = null;
      sessionGasRef.current = null;
      setSession(null);
      setTopUp(null);
      setSessionLowGas(false);
    }
  }, [session, write]);

  const me = players.find(
    (p) => address && p.address.toLowerCase() === address.toLowerCase()
  );
  const joined = !!me;
  const myTurnAlive = !!me?.alive;

  return {
    ready: isDeployed,
    isConnected, address,
    phase, matchId, lobbyEndsAt, liveEndsAt, blockNumber,
    players, bombs, pot, aliveCount,
    entryFee, tokenSymbol, tokenDecimals,
    flashes, result, pending, error,
    pendingWithdrawal,
    joined, myTurnAlive, me,
    join, joinFast, startMatch, move, plantBomb, poke, claimWinnings, sync,
    // Session-key fast play.
    session,
    sessionLive: isSessionLive(session),
    topUp,
    sessionLowGas,
    revokeSession,
  };
}
