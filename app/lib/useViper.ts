import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { decodeEventLog } from "viem";
import {
  VIPER_ARENA_ADDRESS,
  isDeployed,
  viperAbi,
  erc20Abi,
} from "./contract";

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
  const [error, setError] = useState<string | null>(null);

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
  }, [publicClient, read]);

  useEffect(() => {
    if (!isDeployed) return;
    sync();
    const t = setInterval(sync, POLL_MS);
    return () => clearInterval(t);
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
  const move = useCallback(
    (dx: number, dy: number) => write("move", "move", [dx, dy]),
    [write]
  );
  const plantBomb = useCallback(() => write("bomb", "plantBomb"), [write]);
  const poke = useCallback(() => write("poke", "poke"), [write]);

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
    joined, myTurnAlive, me,
    join, startMatch, move, plantBomb, poke, sync,
  };
}

export function formatTokens(v: bigint, decimals: number): string {
  const s = v.toString().padStart(decimals + 1, "0");
  const int = s.slice(0, -decimals) || "0";
  const frac = s.slice(-decimals).replace(/0+$/, "").slice(0, 4);
  return frac ? `${int}.${frac}` : int;
}
