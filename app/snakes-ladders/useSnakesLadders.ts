"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import {
  createWalletClient,
  decodeEventLog,
  http,
  type PublicClient,
  type WalletClient,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { activeChain } from "../lib/chain";
import { formatTokens } from "../lib/format";
import {
  VIPER_SL_ADDRESS,
  isDeployed,
  viperSlAbi,
  erc20Abi,
  Team,
  TURN_TIMEOUT_BLOCKS,
} from "./contract";

export { formatTokens };

export interface SessionKey {
  address: `0x${string}`;
  expiresAt: number;
}

const SESSION_TTL_SECONDS = 2 * 60 * 60;
const TOP_UP_ROLLS = 100;
const GAS_PAD_BPS = 13000;
const LOW_GAS_ROLL_BUFFER = 10;
const POLL_MS = 2000;

const num = (v: unknown): number => Number(v as bigint);

export class SlSessionSender {
  private client: WalletClient;
  private publicClient: PublicClient;
  private nonce: number | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(privateKey: `0x${string}`, publicClient: PublicClient) {
    const account = privateKeyToAccount(privateKey);
    this.client = createWalletClient({
      account,
      chain: activeChain,
      transport: http(activeChain.rpcUrls.default.http[0]),
    });
    this.publicClient = publicClient;
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

  send(fn: "roll", args: unknown[] = []): Promise<`0x${string}`> {
    const run = this.queue.then(() => this._send(fn, args));
    this.queue = run.catch(() => {});
    return run;
  }

  private async _send(fn: "roll", args: unknown[]): Promise<`0x${string}`> {
    const account = this.client.account!;
    const attempt = async () =>
      this.client.writeContract({
        address: VIPER_SL_ADDRESS,
        abi: viperSlAbi,
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
        this.nonce = null;
        return await attempt();
      }
      throw e;
    }
  }
}

export function useSnakesLadders() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [phase, setPhase] = useState<"lobby" | "live" | null>("lobby");
  const [matchId, setMatchId] = useState<number>(0);
  const [lobbyEndsAt, setLobbyEndsAt] = useState<number>(0);
  const [currentTurn, setCurrentTurn] = useState<Team>(Team.RED);
  const [turnStartBlock, setTurnStartBlock] = useState<number>(0);
  const [blockNumber, setBlockNumber] = useState<number>(0);
  const [positions, setPositions] = useState<[number, number, number, number]>([0, 0, 0, 0]);
  const [teamStakes, setTeamStakes] = useState<[bigint, bigint, bigint, bigint]>([
    BigInt(0), BigInt(0), BigInt(0), BigInt(0),
  ]);
  const [teamPlayers, setTeamPlayers] = useState<Record<Team, `0x${string}`[]>>({
    [Team.RED]: [],
    [Team.BLUE]: [],
    [Team.GREEN]: [],
    [Team.YELLOW]: [],
  });
  const [pot, setPot] = useState<bigint>(BigInt(0));
  const [entryFee, setEntryFee] = useState<bigint>(BigInt(100) * BigInt(10 ** 18));
  const [stakeToken, setStakeToken] = useState<`0x${string}` | null>(null);
  const [tokenSymbol, setTokenSymbol] = useState<string>("VIPER");
  const [tokenDecimals, setTokenDecimals] = useState<number>(18);
  const [playerBalance, setPlayerBalance] = useState<bigint>(BigInt(0));
  const [pendingWithdrawal, setPendingWithdrawal] = useState<bigint>(BigInt(0));

  // User status
  const [hasJoined, setHasJoined] = useState<boolean>(false);
  const [myTeam, setMyTeam] = useState<Team | null>(null);
  const [myStake, setMyStake] = useState<bigint>(BigInt(0));

  // Game events feedback
  const [lastRoll, setLastRoll] = useState<{
    team: Team;
    dice: number;
    from: number;
    to: number;
    timestamp: number;
  } | null>(null);
  const [lastClimb, setLastClimb] = useState<{
    team: Team;
    from: number;
    to: number;
    timestamp: number;
  } | null>(null);
  const [lastSlide, setLastSlide] = useState<{
    team: Team;
    from: number;
    to: number;
    timestamp: number;
  } | null>(null);
  const [winner, setWinner] = useState<Team | null>(null);

  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Session keys
  const [session, setSession] = useState<SessionKey | null>(null);
  const [sessionLowGas, setSessionLowGas] = useState(false);
  const sessionPrivRef = useRef<`0x${string}` | null>(null);
  const sessionSenderRef = useRef<SlSessionSender | null>(null);
  const sessionGasRef = useRef<{ gasPerMove: bigint; gasPrice: bigint } | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lastBlockRef = useRef<bigint>(BigInt(0));
  const matchIdRef = useRef<number>(0);

  const read = useCallback(
    async <T,>(fn: string, args: unknown[] = []): Promise<T> => {
      if (!publicClient || !isDeployed) throw new Error("no client");
      return publicClient.readContract({
        address: VIPER_SL_ADDRESS,
        abi: viperSlAbi,
        functionName: fn,
        args,
      }) as Promise<T>;
    },
    [publicClient]
  );

  const sync = useCallback(async () => {
    if (!publicClient || !isDeployed) return;
    try {
      const [block, matchState, fee, token] = await Promise.all([
        publicClient.getBlockNumber(),
        read<[number, bigint, number, bigint, [number, number, number, number], [bigint, bigint, bigint, bigint], bigint, bigint]>("getMatchState"),
        read<bigint>("entryFee"),
        read<`0x${string}`>("stakeToken"),
      ]);

      const [curPhase, mid, actTurn, turnBlk, posArr, stakeArr, totalPot, lobbyEnd] = matchState;
      const midNum = num(mid);
      setBlockNumber(num(block));

      if (midNum !== matchIdRef.current) {
        matchIdRef.current = midNum;
        setMatchId(midNum);
        setWinner(null);
        setLastRoll(null);
        setLastClimb(null);
        setLastSlide(null);
        sessionPrivRef.current = null;
        sessionSenderRef.current = null;
        sessionGasRef.current = null;
        setSession(null);
        setSessionLowGas(false);
      }

      setPhase(curPhase === 0 ? "lobby" : "live");
      setCurrentTurn(actTurn as Team);
      setTurnStartBlock(num(turnBlk));
      setPositions(posArr);
      setTeamStakes(stakeArr);
      setPot(totalPot);
      setLobbyEndsAt(num(lobbyEnd));
      setEntryFee(fee);
      setStakeToken(token);

      // Fetch team player lists
      const [redP, blueP, greenP, yellowP] = await Promise.all([
        read<`0x${string}`[]>("getTeamPlayers", [Team.RED]),
        read<`0x${string}`[]>("getTeamPlayers", [Team.BLUE]),
        read<`0x${string}`[]>("getTeamPlayers", [Team.GREEN]),
        read<`0x${string}`[]>("getTeamPlayers", [Team.YELLOW]),
      ]);

      setTeamPlayers({
        [Team.RED]: redP,
        [Team.BLUE]: blueP,
        [Team.GREEN]: greenP,
        [Team.YELLOW]: yellowP,
      });

      // Token metadata
      if (token) {
        try {
          const [sym, dec] = await Promise.all([
            publicClient.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }),
            publicClient.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
          ]);
          setTokenSymbol(sym as string);
          setTokenDecimals(num(dec));
        } catch {}
      }

      // Wallet state: token balance & pull-payment pending withdrawals
      if (address) {
        try {
          const [joinedState, playerTm, stakeAmount, pw, bal] = await Promise.all([
            read<boolean>("hasJoined", [address]),
            read<number>("playerTeam", [address]),
            read<bigint>("playerStake", [address]),
            read<bigint>("pendingWithdrawals", [address]),
            token
              ? (publicClient.readContract({
                  address: token,
                  abi: [
                    {
                      name: "balanceOf",
                      type: "function",
                      stateMutability: "view",
                      inputs: [{ name: "account", type: "address" }],
                      outputs: [{ type: "uint256" }],
                    },
                  ],
                  functionName: "balanceOf",
                  args: [address],
                }) as Promise<bigint>)
              : BigInt(0),
          ]);

          setHasJoined(joinedState);
          setMyTeam(joinedState ? (playerTm as Team) : null);
          setMyStake(stakeAmount);
          setPendingWithdrawal(pw);
          setPlayerBalance(bal);
        } catch {}
      }

      // Process event logs
      const from = lastBlockRef.current === BigInt(0) ? block : lastBlockRef.current + BigInt(1);
      if (from <= block) {
        const logs = await publicClient.getLogs({
          address: VIPER_SL_ADDRESS,
          fromBlock: from,
          toBlock: block,
        });

        for (const log of logs) {
          let decoded: { eventName: string; args: any } | null = null;
          try {
            decoded = decodeEventLog({
              abi: viperSlAbi,
              data: log.data,
              topics: log.topics,
            }) as { eventName: string; args: any };
          } catch {
            continue;
          }

          const { eventName, args } = decoded;
          if (eventName === "Rolled") {
            setLastRoll({
              team: args.team as Team,
              dice: Number(args.dice),
              from: Number(args.from),
              to: Number(args.to),
              timestamp: Date.now(),
            });
          } else if (eventName === "Climbed") {
            setLastClimb({
              team: args.team as Team,
              from: Number(args.from),
              to: Number(args.to),
              timestamp: Date.now(),
            });
          } else if (eventName === "Slid") {
            setLastSlide({
              team: args.team as Team,
              from: Number(args.from),
              to: Number(args.to),
              timestamp: Date.now(),
            });
          } else if (eventName === "MatchWon") {
            setWinner(args.team as Team);
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

  // Trailing sync after session sends
  const scheduleSync = useCallback(() => {
    if (syncTimerRef.current) return;
    syncTimerRef.current = setTimeout(() => {
      syncTimerRef.current = null;
      sync();
    }, 600);
  }, [sync]);

  const write = useCallback(
    async (label: string, fn: string, args: unknown[] = []) => {
      if (!walletClient || !address) throw new Error("connect wallet first");
      setPending(label);
      setError(null);
      try {
        const hash = await walletClient.writeContract({
          address: VIPER_SL_ADDRESS,
          abi: viperSlAbi,
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

  /** Standard join with wallet */
  const join = useCallback(
    async (team: Team, customAmount?: bigint) => {
      if (!walletClient || !address || !publicClient || !stakeToken) return;
      const amount = customAmount && customAmount >= entryFee ? customAmount : entryFee;
      setPending("join");
      setError(null);
      try {
        const allowance = (await publicClient.readContract({
          address: stakeToken,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, VIPER_SL_ADDRESS],
        })) as bigint;

        if (allowance < amount) {
          const hash = await walletClient.writeContract({
            address: stakeToken,
            abi: erc20Abi,
            functionName: "approve",
            args: [VIPER_SL_ADDRESS, amount],
            account: address,
            chain: walletClient.chain,
          });
          await publicClient.waitForTransactionReceipt({ hash });
        }

        await write("join", "join", [team, amount]);
      } catch (e: any) {
        setError(e?.shortMessage || e?.message || "join failed");
      } finally {
        setPending(null);
      }
    },
    [walletClient, address, publicClient, stakeToken, entryFee, write]
  );

  /** Fast join: approve + joinWithSession + native top-up for 0-popup rolls */
  const joinFast = useCallback(
    async (team: Team, customAmount?: bigint) => {
      if (!walletClient || !address || !publicClient || !stakeToken) return;
      const amount = customAmount && customAmount >= entryFee ? customAmount : entryFee;
      setPending("joinFast");
      setError(null);
      try {
        const privateKey = generatePrivateKey();
        const account = privateKeyToAccount(privateKey);
        const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;

        let gasPerMove = BigInt(120_000);
        let gasPrice = BigInt(0);
        try {
          const est = await publicClient.estimateContractGas({
            address: VIPER_SL_ADDRESS,
            abi: viperSlAbi,
            functionName: "roll",
            account: account.address,
          });
          gasPerMove = (est * BigInt(GAS_PAD_BPS)) / BigInt(10_000);
        } catch {}

        try {
          gasPrice = await publicClient.getGasPrice();
        } catch {}

        const topUpWei = gasPerMove * gasPrice * BigInt(TOP_UP_ROLLS);

        // 1. Approval
        const allowance = (await publicClient.readContract({
          address: stakeToken,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, VIPER_SL_ADDRESS],
        })) as bigint;

        if (allowance < amount) {
          const hash = await walletClient.writeContract({
            address: stakeToken,
            abi: erc20Abi,
            functionName: "approve",
            args: [VIPER_SL_ADDRESS, amount],
            account: address,
            chain: walletClient.chain,
          });
          await publicClient.waitForTransactionReceipt({ hash });
        }

        // 2. Join with session
        const joinHash = await walletClient.writeContract({
          address: VIPER_SL_ADDRESS,
          abi: viperSlAbi,
          functionName: "joinWithSession",
          args: [team, amount, account.address, expiresAt],
          account: address,
          chain: walletClient.chain,
        });
        await publicClient.waitForTransactionReceipt({ hash: joinHash });

        // 3. Native top-up if gas price > 0
        if (topUpWei > BigInt(0)) {
          const topHash = await walletClient.sendTransaction({
            to: account.address,
            value: topUpWei,
            account: address,
            chain: walletClient.chain,
          });
          await publicClient.waitForTransactionReceipt({ hash: topHash });
        }

        sessionPrivRef.current = privateKey;
        sessionSenderRef.current = new SlSessionSender(privateKey, publicClient);
        sessionGasRef.current = { gasPerMove, gasPrice };
        setSession({ address: account.address, expiresAt });
        setSessionLowGas(false);
        await sync();
      } catch (e: any) {
        setError(e?.shortMessage || e?.message || "fast join failed");
      } finally {
        setPending(null);
      }
    },
    [walletClient, address, publicClient, stakeToken, entryFee, sync]
  );

  const startMatch = useCallback(() => write("start", "startMatch"), [write]);

  /** Roll dice (session key if available, else wallet) */
  const roll = useCallback(async () => {
    const sender = sessionSenderRef.current;
    if (session && sender && Date.now() / 1000 < session.expiresAt) {
      try {
        setPending("roll");
        await sender.send("roll");
        scheduleSync();
      } catch (e: any) {
        setError(e?.shortMessage || e?.message || "session roll failed");
        throw e;
      } finally {
        setPending(null);
      }
      return;
    }

    if (session) {
      sessionPrivRef.current = null;
      sessionSenderRef.current = null;
      setSession(null);
    }

    await write("roll", "roll");
  }, [session, write, scheduleSync]);

  const passTurn = useCallback(() => write("passTurn", "passTurn"), [write]);
  const poke = useCallback(() => write("poke", "poke"), [write]);
  const claimWinnings = useCallback(() => write("claim", "claim"), [write]);

  const revokeSession = useCallback(async () => {
    if (!session) return;
    try {
      await write("revoke", "revokeSession", [session.address]);
    } finally {
      sessionPrivRef.current = null;
      sessionSenderRef.current = null;
      setSession(null);
      setSessionLowGas(false);
    }
  }, [session, write]);

  const isMyTeamTurn = myTeam !== null && myTeam === currentTurn && phase === "live";
  const blocksRemaining = Math.max(0, turnStartBlock + TURN_TIMEOUT_BLOCKS - blockNumber);
  const turnExpired = phase === "live" && blocksRemaining === 0;

  return {
    ready: isDeployed,
    isConnected,
    address,
    phase,
    matchId,
    lobbyEndsAt,
    currentTurn,
    turnStartBlock,
    blockNumber,
    blocksRemaining,
    turnExpired,
    positions,
    teamStakes,
    teamPlayers,
    pot,
    entryFee,
    tokenSymbol,
    tokenDecimals,
    playerBalance,
    pendingWithdrawal,
    hasJoined,
    myTeam,
    myStake,
    isMyTeamTurn,
    lastRoll,
    lastClimb,
    lastSlide,
    winner,
    pending,
    error,
    session,
    sessionLive: !!session && Date.now() / 1000 < session.expiresAt,
    sessionLowGas,
    join,
    joinFast,
    startMatch,
    roll,
    passTurn,
    poke,
    claimWinnings,
    revokeSession,
    sync,
  };
}
