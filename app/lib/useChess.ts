"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { decodeEventLog } from "viem";
import {
  VIPER_CHESS_ADDRESS,
  isChessDeployed,
  chessAbi,
  erc20Abi,
} from "./chess";
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

export interface ChessResult {
  kind: "win" | "draw" | "cancelled";
  /** 0 = white side, 1 = black side (win only). */
  winningSide?: number;
  /** win: 0=checkmate 1=resign 2=timeout; draw: 0=stalemate 1=fifty-move 2=ply-cap. */
  reason?: number;
  /** This player's credited payout, when known. */
  prize?: bigint;
  matchId: number;
}

const POLL_MS = 2000;
const num = (v: unknown): number => Number(v as bigint);

export const REASON_WIN = ["checkmate", "resignation", "timeout"];
export const REASON_DRAW = ["stalemate", "fifty-move rule", "move cap"];

/**
 * useChess — live view of the team chess table.
 * Polls getMatchState() every 2s (one call: no multicall3 on this chain),
 * layers match results from event logs.
 */
export function useChess() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [phase, setPhase] = useState<"lobby" | "live" | null>(null);
  const [matchId, setMatchId] = useState<number>(0);
  const [sideToMove, setSideToMove] = useState<number>(0);
  const [board, setBoard] = useState<number[]>(() => Array(64).fill(0));
  const [whitePlayers, setWhitePlayers] = useState<`0x${string}`[]>([]);
  const [blackPlayers, setBlackPlayers] = useState<`0x${string}`[]>([]);
  const [lastFrom, setLastFrom] = useState<number>(64);
  const [lastTo, setLastTo] = useState<number>(64);
  const [plyCount, setPlyCount] = useState<number>(0);
  const [moveDeadline, setMoveDeadline] = useState<number>(0);
  const [lobbyEndsAt, setLobbyEndsAt] = useState<number>(0);
  const [pot, setPot] = useState<bigint>(BigInt(0));
  const [entryFee, setEntryFee] = useState<bigint>(BigInt(0));
  const [moveTimeout, setMoveTimeout] = useState<number>(300);
  const [stakeToken, setStakeToken] = useState<`0x${string}` | null>(null);
  const [tokenSymbol, setTokenSymbol] = useState<string>("tokens");
  const [tokenDecimals, setTokenDecimals] = useState<number>(18);
  const [result, setResult] = useState<ChessResult | null>(null);
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
  const addressRef = useRef(address);
  addressRef.current = address;

  const target = { address: VIPER_CHESS_ADDRESS, abi: chessAbi };

  const read = useCallback(
    async <T,>(fn: string, args: unknown[] = []): Promise<T> => {
      if (!publicClient || !isChessDeployed) throw new Error("no client");
      return publicClient.readContract({
        address: VIPER_CHESS_ADDRESS,
        abi: chessAbi,
        functionName: fn,
        args,
      }) as Promise<T>;
    },
    [publicClient]
  );

  const sync = useCallback(async () => {
    if (!publicClient || !isChessDeployed) return;
    try {
      const [block, fee, timeout, token] = await Promise.all([
        publicClient.getBlockNumber(),
        read<bigint>("entryFee"),
        read<bigint>("MOVE_TIMEOUT"),
        read<`0x${string}`>("stakeToken"),
      ]);
      setEntryFee(fee);
      setMoveTimeout(num(timeout));
      setStakeToken(token);

      // Whole match state in one call.
      const [
        ph, mid, stm, boardV, whites, blacks,
        lFrom, lTo, , ply, deadline, potV,
      ] = (await read<unknown[]>("getMatchState")) as [
        number, bigint, number, unknown[], `0x${string}`[], `0x${string}`[],
        number, number, unknown, bigint, bigint, bigint
      ];
      const midNum = num(mid);
      if (midNum !== matchIdRef.current) {
        matchIdRef.current = midNum;
        setMatchId(midNum);
        setResult(null);
        setLastFrom(64);
        setLastTo(64);
        sessionPrivRef.current = null;
        sessionSenderRef.current = null;
        sessionGasRef.current = null;
        setSession(null);
        setTopUp(null);
        setSessionLowGas(false);
      }
      setPhase(ph === 0 ? "lobby" : "live");
      setSideToMove(stm);
      setBoard((boardV as unknown[]).map(num));
      setWhitePlayers(whites);
      setBlackPlayers(blacks);
      setLastFrom(num(lFrom));
      setLastTo(num(lTo));
      setPlyCount(num(ply));
      setMoveDeadline(num(deadline));
      setPot(potV);

      if (ph === 0) {
        try { setLobbyEndsAt(num(await read<bigint>("lobbyEndsAt"))); } catch { /* fresh */ }
      }

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

      const me = addressRef.current;
      if (me) {
        try {
          const pw = (await publicClient.readContract({
            address: VIPER_CHESS_ADDRESS,
            abi: chessAbi,
            functionName: "pendingWithdrawals",
            args: [me],
          })) as bigint;
          setPendingWithdrawal(pw);
        } catch { /* none */ }
      }

      // Events since last poll: results + personal payouts.
      const from = lastBlockRef.current === BigInt(0) ? block : lastBlockRef.current + BigInt(1);
      if (from <= block) {
        const logs = await publicClient.getLogs({
          address: VIPER_CHESS_ADDRESS,
          fromBlock: from,
          toBlock: block,
        });
        for (const log of logs) {
          let decoded: { eventName: string; args: any } | null = null;
          try {
            decoded = decodeEventLog({ abi: chessAbi, data: log.data, topics: log.topics }) as {
              eventName: string;
              args: any;
            };
          } catch { continue; }
          const { eventName, args } = decoded;
          if (eventName === "MatchEnded") {
            setResult({
              kind: "win",
              winningSide: num(args.winningSide),
              reason: num(args.reason),
              matchId: num(args.matchId),
            });
          } else if (eventName === "Draw") {
            setResult({ kind: "draw", reason: num(args.reason), matchId: num(args.matchId) });
          } else if (eventName === "MatchCancelled") {
            setResult({ kind: "cancelled", matchId: num(args.matchId) });
          } else if (eventName === "WithdrawalCredited" && me &&
            (args.to as string).toLowerCase() === me.toLowerCase()) {
            setResult((r) => (r ? { ...r, prize: args.amount as bigint } : r));
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
    if (!isChessDeployed) return;
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
          address: VIPER_CHESS_ADDRESS,
          abi: chessAbi,
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

  const ensureAllowance = useCallback(async () => {
    if (!walletClient || !address || !publicClient || !stakeToken) return;
    const allowance = (await publicClient.readContract({
      address: stakeToken, abi: erc20Abi, functionName: "allowance",
      args: [address, VIPER_CHESS_ADDRESS],
    })) as bigint;
    if (allowance < entryFee) {
      const hash = await walletClient.writeContract({
        address: stakeToken, abi: erc20Abi, functionName: "approve",
        args: [VIPER_CHESS_ADDRESS, entryFee],
        account: address, chain: walletClient.chain,
      });
      await publicClient.waitForTransactionReceipt({ hash });
    }
  }, [walletClient, address, publicClient, stakeToken, entryFee]);

  /** Join a side: 0 = white, 1 = black. */
  const join = useCallback(async (side: number) => {
    if (!walletClient || !address) return;
    setPending("join");
    setError(null);
    try {
      await ensureAllowance();
      await write("join", "join", [side]);
    } catch (e: any) {
      setError(e?.shortMessage || e?.message || "join failed");
    } finally {
      setPending(null);
    }
  }, [walletClient, address, ensureAllowance, write]);

  /** Fast join: session key signs moves, zero wallet pop-ups mid-game. */
  const joinFast = useCallback(async (side: number) => {
    if (!walletClient || !address || !publicClient) return;
    setPending("join");
    setError(null);
    try {
      const { privateKey, session: newSession } = createSessionKey();
      const { wei: topUpWei, gasPerMove, gasPrice } = await estimateTopUp(
        publicClient,
        newSession.address,
        target,
        "move",
        [12, 28, 0]
      );
      if (topUpWei === BigInt(0) || gasPrice === BigInt(0)) {
        throw new Error("could not estimate gas — check the network and try again");
      }
      await ensureAllowance();
      const joinHash = await walletClient.writeContract({
        address: VIPER_CHESS_ADDRESS, abi: chessAbi, functionName: "joinWithSession",
        args: [side, newSession.address, newSession.expiresAt],
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
  }, [walletClient, address, publicClient, ensureAllowance, sync, target]);

  const startMatch = useCallback(() => write("start", "startMatch"), [write]);
  const resign = useCallback(() => write("resign", "resign"), [write]);
  const claimTimeout = useCallback(() => write("timeout", "claimTimeout"), [write]);
  const claimWinnings = useCallback(() => write("claim", "claim"), [write]);

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
        setError("Fast-play session ended — moves will ask your wallet again. Rejoin the next lobby for zero pop-ups.");
      }
      await write("move", fn, args);
    },
    [session, write, scheduleSync]
  );

  /** Submit a move. promo: 0 = auto-queen, 2/3/4/5 = N/B/R/Q. */
  const move = useCallback(
    (from: number, to: number, promo: number) => sessionSend("move", [from, to, promo]),
    [sessionSend]
  );

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

  const mySide: number | null = address
    ? whitePlayers.some((p) => p.toLowerCase() === address.toLowerCase())
      ? 0
      : blackPlayers.some((p) => p.toLowerCase() === address.toLowerCase())
        ? 1
        : null
    : null;
  const joined = mySide !== null;
  const myTurn = phase === "live" && joined && sideToMove === mySide;

  return {
    ready: isChessDeployed,
    isConnected, address,
    phase, matchId, sideToMove, board,
    whitePlayers, blackPlayers,
    lastFrom, lastTo, plyCount, moveDeadline, lobbyEndsAt, pot,
    entryFee, moveTimeout, stakeToken, tokenSymbol, tokenDecimals,
    result, pending, error,
    pendingWithdrawal,
    joined, mySide, myTurn,
    join, joinFast, startMatch, move, resign, claimTimeout, claimWinnings, sync,
    session,
    sessionLive: isSessionLive(session),
    topUp,
    sessionLowGas,
    revokeSession,
  };
}
