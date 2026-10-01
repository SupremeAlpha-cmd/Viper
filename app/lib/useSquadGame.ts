"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { decodeEventLog } from "viem";
import {
  VIPER_SQUAD_GAME_ADDRESS,
  isSquadGameDeployed,
  squadGameAbi,
  erc20Abi,
} from "./squad-game";
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

export interface SquadPlayer {
  address: `0x${string}`;
  alive: boolean;
  checkedIn: boolean;
  checkInTime: number;
  paidFee: bigint;
}

export interface SquadElimination {
  player: `0x${string}`;
  reason: number; // 0 = missed window, 1 = slowest quartile
  round: number;
  key: number;
}

export interface SquadResult {
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
 * useSquadGame — live view of the squad arena.
 * Polls getMatchState() every 2s (one call: no multicall3 on this chain),
 * layers elimination flashes + match results from event logs.
 */
export function useSquadGame() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [phase, setPhase] = useState<"lobby" | "live" | null>(null);
  const [matchId, setMatchId] = useState<number>(0);
  const [lobbyEndsAt, setLobbyEndsAt] = useState<number>(0);
  const [round, setRound] = useState<number>(0);
  const [roundEndsAt, setRoundEndsAt] = useState<number>(0);
  const [roundDuration, setRoundDuration] = useState<number>(45);
  const [blockNumber, setBlockNumber] = useState<number>(0);
  const [players, setPlayers] = useState<SquadPlayer[]>([]);
  const [pot, setPot] = useState<bigint>(BigInt(0));
  const [aliveCount, setAliveCount] = useState<number>(0);
  const [checkInCount, setCheckInCount] = useState<number>(0);
  const [maxPlayers, setMaxPlayers] = useState<number>(32);
  const [entryFee, setEntryFee] = useState<bigint>(BigInt(0));
  const [stakeToken, setStakeToken] = useState<`0x${string}` | null>(null);
  const [tokenSymbol, setTokenSymbol] = useState<string>("tokens");
  const [tokenDecimals, setTokenDecimals] = useState<number>(18);
  const [passEnabled, setPassEnabled] = useState<boolean>(false);
  const [eliminations, setEliminations] = useState<SquadElimination[]>([]);
  const [result, setResult] = useState<SquadResult | null>(null);
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
  const elimKey = useRef(0);

  const target = { address: VIPER_SQUAD_GAME_ADDRESS, abi: squadGameAbi };

  const read = useCallback(
    async <T,>(fn: string, args: unknown[] = []): Promise<T> => {
      if (!publicClient || !isSquadGameDeployed) throw new Error("no client");
      return publicClient.readContract({
        address: VIPER_SQUAD_GAME_ADDRESS,
        abi: squadGameAbi,
        functionName: fn,
        args,
      }) as Promise<T>;
    },
    [publicClient]
  );

  const sync = useCallback(async () => {
    if (!publicClient || !isSquadGameDeployed) return;
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
        setEliminations([]);
        sessionPrivRef.current = null;
        sessionSenderRef.current = null;
        sessionGasRef.current = null;
        setSession(null);
        setTopUp(null);
        setSessionLowGas(false);
      }

      setPhase(ph === 0 ? "lobby" : "live");

      const [potV, aliveN, fee, token, maxP, roundDur, passOn] = await Promise.all([
        read<bigint>("pot"),
        read<bigint>("aliveCount"),
        read<bigint>("entryFee"),
        read<`0x${string}`>("stakeToken"),
        read<bigint>("maxPlayers"),
        read<bigint>("roundDuration"),
        read<boolean>("passEnabled"),
      ]);
      setPot(potV);
      setAliveCount(num(aliveN));
      setEntryFee(fee);
      setStakeToken(token);
      setMaxPlayers(num(maxP));
      setRoundDuration(num(roundDur));
      setPassEnabled(passOn);

      if (ph === 0) {
        setLobbyEndsAt(num(await read<bigint>("lobbyEndsAt")));
      } else {
        const [r, rEnds, ciCount] = await Promise.all([
          read<bigint>("round"),
          read<bigint>("roundEndsAt"),
          read<bigint>("checkInCount"),
        ]);
        setRound(num(r));
        setRoundEndsAt(num(rEnds));
        setCheckInCount(num(ciCount));
      }

      // Whole match state in one call.
      const [addrs, alives, checkedIns, checkInTimes, paidFees] =
        (await read<unknown[]>("getMatchState")) as [
          `0x${string}`[],
          boolean[],
          boolean[],
          bigint[],
          bigint[]
        ];
      setPlayers(
        addrs.map((a, i) => ({
          address: a,
          alive: alives[i],
          checkedIn: checkedIns[i],
          checkInTime: num(checkInTimes[i]),
          paidFee: paidFees[i] as bigint,
        }))
      );

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
            address: VIPER_SQUAD_GAME_ADDRESS,
            abi: squadGameAbi,
            functionName: "pendingWithdrawals",
            args: [address],
          })) as bigint;
          setPendingWithdrawal(pw);
        } catch { /* none */ }
      }

      // Events since last poll: eliminations + results.
      const from = lastBlockRef.current === BigInt(0) ? block : lastBlockRef.current + BigInt(1);
      if (from <= block) {
        const logs = await publicClient.getLogs({
          address: VIPER_SQUAD_GAME_ADDRESS,
          fromBlock: from,
          toBlock: block,
        });
        for (const log of logs) {
          let decoded: { eventName: string; args: any } | null = null;
          try {
            decoded = decodeEventLog({ abi: squadGameAbi, data: log.data, topics: log.topics }) as {
              eventName: string;
              args: any;
            };
          } catch { continue; }
          const { eventName, args } = decoded;
          if (eventName === "PlayerEliminated") {
            const k = ++elimKey.current;
            setEliminations((e) => [
              ...e.slice(-31),
              {
                player: args.player as `0x${string}`,
                reason: num(args.reason),
                round: num(args.round),
                key: k,
              },
            ]);
            setTimeout(() => setEliminations((e) => e.filter((x) => x.key !== k)), 2500);
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
    if (!isSquadGameDeployed) return;
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
          address: VIPER_SQUAD_GAME_ADDRESS,
          abi: squadGameAbi,
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
        args: [address, VIPER_SQUAD_GAME_ADDRESS],
      })) as bigint;
      if (allowance < entryFee) {
        const hash = await walletClient.writeContract({
          address: stakeToken, abi: erc20Abi, functionName: "approve",
          args: [VIPER_SQUAD_GAME_ADDRESS, entryFee],
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
  const resolveRound = useCallback(() => write("resolve", "resolveRound"), [write]);

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
        setError("Fast-play session ended — check-ins will ask your wallet again. Rejoin the next lobby for zero pop-ups.");
      }
      await write("check-in", fn, args);
    },
    [session, write, scheduleSync]
  );

  /** Check in for the current round (green light). Session-first. */
  const survive = useCallback(() => sessionSend("survive", []), [sessionSend]);

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
        "survive",
        []
      );
      if (topUpWei === BigInt(0) || gasPrice === BigInt(0)) {
        throw new Error("could not estimate gas — check the network and try again");
      }
      const allowance = (await publicClient.readContract({
        address: stakeToken, abi: erc20Abi, functionName: "allowance",
        args: [address, VIPER_SQUAD_GAME_ADDRESS],
      })) as bigint;
      if (allowance < entryFee) {
        const hash = await walletClient.writeContract({
          address: stakeToken, abi: erc20Abi, functionName: "approve",
          args: [VIPER_SQUAD_GAME_ADDRESS, entryFee],
          account: address, chain: walletClient.chain,
        });
        await publicClient.waitForTransactionReceipt({ hash });
      }
      const joinHash = await walletClient.writeContract({
        address: VIPER_SQUAD_GAME_ADDRESS, abi: squadGameAbi, functionName: "joinWithSession",
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

  return {
    ready: isSquadGameDeployed,
    isConnected, address,
    phase, matchId, lobbyEndsAt, round, roundEndsAt, roundDuration, blockNumber,
    players, pot, aliveCount, checkInCount, maxPlayers,
    entryFee, stakeToken, tokenSymbol, tokenDecimals, passEnabled,
    eliminations, result, pending, error,
    pendingWithdrawal,
    joined, me,
    join, joinFast, startMatch, survive, resolveRound, claimWinnings, sync,
    session,
    sessionLive: isSessionLive(session),
    topUp,
    sessionLowGas,
    revokeSession,
  };
}
