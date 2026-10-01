"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { decodeEventLog } from "viem";
import {
  VIPER_SNAKE_ADDRESS,
  isSnakeDeployed,
  snakeAbi,
  erc20Abi,
  SNAKE_GRID,
} from "./snake";
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

export interface SnakePlayer {
  address: `0x${string}`;
  /** Packed cells, head-first. Unpack: x = c >> 8, y = c & 0xff. */
  segments: number[];
  dir: number;
  score: number;
  alive: boolean;
}

export interface SnakeResult {
  kind: "win" | "split" | "weighted" | "cancelled";
  winner?: `0x${string}`;
  prize?: bigint;
  recipients?: number;
  share?: bigint;
  matchId: number;
}

const POLL_MS = 2000;
const num = (v: unknown): number => Number(v as bigint);
const unpack = (c: number): [number, number] => [c >> 8, c & 0xff];
export const unpackCell = unpack;

/**
 * useSnake — live view of the snake pit.
 * Polls getMatchState() every 2s (one call: no multicall3 on this chain),
 * layers death flashes + match results from event logs.
 */
export function useSnake() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [phase, setPhase] = useState<"lobby" | "live" | null>(null);
  const [matchId, setMatchId] = useState<number>(0);
  const [lobbyEndsAt, setLobbyEndsAt] = useState<number>(0);
  const [liveEndsAt, setLiveEndsAt] = useState<number>(0);
  const [blockNumber, setBlockNumber] = useState<number>(0);
  const [currentTick, setCurrentTick] = useState<number>(0);
  const [matchTicks, setMatchTicks] = useState<number>(0);
  const [players, setPlayers] = useState<SnakePlayer[]>([]);
  const [coins, setCoins] = useState<number[]>([]);
  const [pot, setPot] = useState<bigint>(BigInt(0));
  const [aliveCount, setAliveCount] = useState<number>(0);
  const [entryFee, setEntryFee] = useState<bigint>(BigInt(0));
  const [stakeToken, setStakeToken] = useState<`0x${string}` | null>(null);
  const [tokenSymbol, setTokenSymbol] = useState<string>("tokens");
  const [tokenDecimals, setTokenDecimals] = useState<number>(18);
  const [deaths, setDeaths] = useState<{ x: number; y: number; key: number }[]>([]);
  const [result, setResult] = useState<SnakeResult | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [pendingWithdrawal, setPendingWithdrawal] = useState<bigint>(BigInt(0));
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionKey | null>(null);
  const [topUp, setTopUp] = useState<{ wei: bigint; moves: number } | null>(null);
  const [sessionLowGas, setSessionLowGas] = useState(false);
  const sessionPrivRef = useRef<`0x${string}` | null>(null);
  const sessionSenderRef = useRef<SessionSender | null>(null);
  const sessionGasRef = useRef<{ gasPerMove: bigint; gasPrice: bigint } | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lastBlockRef = useRef<bigint>(BigInt(0));
  const matchIdRef = useRef<number>(0);
  const deathKey = useRef(0);
  // Ref mirror of players for use inside sync() without re-creating it.
  const playersRef = useRef<SnakePlayer[]>([]);
  playersRef.current = players;

  const target = { address: VIPER_SNAKE_ADDRESS, abi: snakeAbi };

  const read = useCallback(
    async <T,>(fn: string, args: unknown[] = []): Promise<T> => {
      if (!publicClient || !isSnakeDeployed) throw new Error("no client");
      return publicClient.readContract({
        address: VIPER_SNAKE_ADDRESS,
        abi: snakeAbi,
        functionName: fn,
        args,
      }) as Promise<T>;
    },
    [publicClient]
  );

  const sync = useCallback(async () => {
    if (!publicClient || !isSnakeDeployed) return;
    try {
      const [ph, mid, block] = await Promise.all([
        read<number>("phase"),
        read<bigint>("matchId"),
        publicClient.getBlockNumber(),
      ]);
      const midNum = num(mid);
      setBlockNumber(num(block));

      if (midNum !== matchIdRef.current) {
        matchIdRef.current = midNum;
        setMatchId(midNum);
        setResult(null);
        setDeaths([]);
        sessionPrivRef.current = null;
        sessionSenderRef.current = null;
        sessionGasRef.current = null;
        setSession(null);
        setTopUp(null);
        setSessionLowGas(false);
      }

      setPhase(ph === 0 ? "lobby" : "live");

      const [potV, aliveN, fee, token, ticks] = await Promise.all([
        read<bigint>("pot"),
        read<bigint>("aliveCount"),
        read<bigint>("entryFee"),
        read<`0x${string}`>("stakeToken"),
        read<bigint>("MATCH_TICKS"),
      ]);
      setPot(potV);
      setAliveCount(num(aliveN));
      setEntryFee(fee);
      setStakeToken(token);
      setMatchTicks(num(ticks));

      if (ph === 0) {
        setLobbyEndsAt(num(await read<bigint>("lobbyEndsAt")));
      } else {
        const [ends, tick] = await Promise.all([
          read<bigint>("liveEndsAt"),
          read<bigint>("currentTick"),
        ]);
        setLiveEndsAt(num(ends));
        setCurrentTick(num(tick));
      }

      // Whole match state in one call.
      const [addrs, , , dirs, scores, alives, allSegs, coinCells] =
        (await read<unknown[]>("getMatchState")) as [
          `0x${string}`[],
          unknown,
          unknown,
          bigint[],
          bigint[],
          boolean[],
          bigint[][],
          bigint[]
        ];
      setPlayers(
        addrs.map((a, i) => ({
          address: a,
          segments: (allSegs[i] || []).map(num),
          dir: num(dirs[i]),
          score: num(scores[i]),
          alive: alives[i],
        }))
      );
      setCoins((coinCells || []).map(num));

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

      if (address) {
        try {
          const pw = (await publicClient.readContract({
            address: VIPER_SNAKE_ADDRESS,
            abi: snakeAbi,
            functionName: "pendingWithdrawals",
            args: [address],
          })) as bigint;
          setPendingWithdrawal(pw);
        } catch { /* none */ }
      }

      // Events since last poll: deaths + results.
      const from = lastBlockRef.current === BigInt(0) ? block : lastBlockRef.current + BigInt(1);
      if (from <= block) {
        const logs = await publicClient.getLogs({
          address: VIPER_SNAKE_ADDRESS,
          fromBlock: from,
          toBlock: block,
        });
        for (const log of logs) {
          let decoded: { eventName: string; args: any } | null = null;
          try {
            decoded = decodeEventLog({ abi: snakeAbi, data: log.data, topics: log.topics }) as {
              eventName: string;
              args: any;
            };
          } catch { continue; }
          const { eventName, args } = decoded;
          if (eventName === "SnakeEliminated") {
            const k = ++deathKey.current;
            // Flash at the victim's last known head position.
            const victim = playersRef.current.find(
              (p) => p.address.toLowerCase() === (args.player as string).toLowerCase()
            );
            const [vx, vy] = victim && victim.segments.length > 0 ? unpack(victim.segments[0]) : [12, 12];
            setDeaths((d) => [...d.slice(-24), { x: vx, y: vy, key: k }]);
            setTimeout(() => setDeaths((d) => d.filter((x) => x.key !== k)), 900);
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
          } else if (eventName === "PotSplitWeighted") {
            setResult({ kind: "weighted", recipients: num(args.recipients), matchId: num(args.matchId) });
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
    if (!isSnakeDeployed) return;
    sync();
    const t = setInterval(sync, POLL_MS);
    return () => clearInterval(t);
  }, [sync]);

  useEffect(() => {
    if (!session || !publicClient) return;
    const g = sessionGasRef.current;
    if (!g) return;
    let stop = false;
    const check = async () => {
      const low = await isSessionGasLow(publicClient, session.address, g.gasPerMove, g.gasPrice);
      if (!stop) setSessionLowGas(low);
    };
    check();
    const t = setInterval(check, 15000);
    return () => { stop = true; clearInterval(t); };
  }, [session, publicClient]);

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
          address: VIPER_SNAKE_ADDRESS,
          abi: snakeAbi,
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

  const join = useCallback(async () => {
    if (!walletClient || !address || !publicClient || !stakeToken) return;
    setPending("join");
    setError(null);
    try {
      const allowance = (await publicClient.readContract({
        address: stakeToken, abi: erc20Abi, functionName: "allowance",
        args: [address, VIPER_SNAKE_ADDRESS],
      })) as bigint;
      if (allowance < entryFee) {
        const hash = await walletClient.writeContract({
          address: stakeToken, abi: erc20Abi, functionName: "approve",
          args: [VIPER_SNAKE_ADDRESS, entryFee],
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
  const claimWinnings = useCallback(() => write("claim", "claim"), [write]);
  const poke = useCallback(() => write("poke", "poke"), [write]);

  const sessionSend = useCallback(
    async (fn: string, args: unknown[]) => {
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
        setError("Fast-play session ended — steering will ask your wallet again. Rejoin the next lobby for zero pop-ups.");
      }
      await write(fn === "setDirection" ? "steer" : "boost", fn, args);
    },
    [session, write, scheduleSync]
  );

  /** Commit a heading (0=up 1=right 2=down 3=left). Applies next tick. */
  const setDirection = useCallback((dir: number) => sessionSend("setDirection", [dir]), [sessionSend]);
  const setBoost = useCallback((b: boolean) => sessionSend("setBoost", [b]), [sessionSend]);

  const joinFast = useCallback(async () => {
    if (!walletClient || !address || !publicClient || !stakeToken) return;
    setPending("join");
    setError(null);
    try {
      const { privateKey, session: newSession } = createSessionKey();
      const { wei: topUpWei, gasPerMove, gasPrice } = await estimateTopUp(
        publicClient,
        newSession.address,
        target,
        "setDirection",
        [1]
      );
      if (topUpWei === BigInt(0) || gasPrice === BigInt(0)) {
        throw new Error("could not estimate gas — check the network and try again");
      }
      const allowance = (await publicClient.readContract({
        address: stakeToken, abi: erc20Abi, functionName: "allowance",
        args: [address, VIPER_SNAKE_ADDRESS],
      })) as bigint;
      if (allowance < entryFee) {
        const hash = await walletClient.writeContract({
          address: stakeToken, abi: erc20Abi, functionName: "approve",
          args: [VIPER_SNAKE_ADDRESS, entryFee],
          account: address, chain: walletClient.chain,
        });
        await publicClient.waitForTransactionReceipt({ hash });
      }
      const joinHash = await walletClient.writeContract({
        address: VIPER_SNAKE_ADDRESS, abi: snakeAbi, functionName: "joinWithSession",
        args: [newSession.address, newSession.expiresAt],
        account: address, chain: walletClient.chain,
      });
      await publicClient.waitForTransactionReceipt({ hash: joinHash });
      const topHash = await walletClient.sendTransaction({
        to: newSession.address,
        value: topUpWei,
        account: address,
        chain: walletClient.chain,
      });
      await publicClient.waitForTransactionReceipt({ hash: topHash });
      sessionPrivRef.current = privateKey;
      sessionSenderRef.current = new SessionSender(privateKey, publicClient, target);
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
  }, [walletClient, address, publicClient, stakeToken, entryFee, sync, target]);

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

  const me = players.find((p) => address && p.address.toLowerCase() === address.toLowerCase());
  const joined = !!me;
  const myTurnAlive = !!me?.alive;

  return {
    ready: isSnakeDeployed,
    isConnected, address,
    phase, matchId, lobbyEndsAt, liveEndsAt, blockNumber, currentTick, matchTicks,
    players, coins, pot, aliveCount,
    entryFee, stakeToken, tokenSymbol, tokenDecimals,
    deaths, result, pending, error,
    pendingWithdrawal,
    joined, myTurnAlive, me,
    join, joinFast, startMatch, setDirection, setBoost, poke, claimWinnings, sync,
    session,
    sessionLive: isSessionLive(session),
    topUp,
    sessionLowGas,
    revokeSession,
  };
}
