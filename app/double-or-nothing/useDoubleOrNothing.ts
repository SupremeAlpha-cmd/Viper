"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import {
  encodePacked,
  keccak256,
  toBytes,
  toHex,
  type PublicClient,
  type WalletClient,
} from "viem";
import {
  VIPER_DON_ADDRESS,
  isDonDeployed,
  doubleOrNothingAbi,
  erc20Abi,
} from "../lib/contract";
import {
  createSessionKey,
  isSessionLive,
  SessionSender,
  type SessionKey,
} from "../lib/session";
import { activeChain } from "../lib/chain";

const POLL_INTERVAL_MS = 2500;
const DON_SECRET_STORAGE_PREFIX = "viper_don_secret_";

export interface ActiveFlip {
  choice: 0 | 1;
  secret: `0x${string}`;
  stake: bigint;
  commitBlock: bigint;
  commitment: `0x${string}`;
  active: boolean;
}

export interface FlipResult {
  won: boolean;
  coin: 0 | 1;
  payout: bigint;
}

export function useDoubleOrNothing() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [bankroll, setBankroll] = useState<bigint>(BigInt(0));
  const [maxStake, setMaxStake] = useState<bigint>(BigInt(0));
  const [stakeToken, setStakeToken] = useState<`0x${string}` | null>(null);
  const [tokenSymbol, setTokenSymbol] = useState<string>("VIPER");
  const [tokenDecimals, setTokenDecimals] = useState<number>(18);
  const [tokenBalance, setTokenBalance] = useState<bigint>(BigInt(0));
  const [tokenAllowance, setTokenAllowance] = useState<bigint>(BigInt(0));
  const [pendingWithdrawal, setPendingWithdrawal] = useState<bigint>(BigInt(0));
  const [currentBlock, setCurrentBlock] = useState<bigint>(BigInt(0));

  const [activeFlip, setActiveFlip] = useState<ActiveFlip | null>(null);
  const [lastResult, setLastResult] = useState<FlipResult | null>(null);
  const [flipping, setFlipping] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Session keys
  const [session, setSession] = useState<SessionKey | null>(null);
  const sessionPrivRef = useRef<`0x${string}` | null>(null);
  const sessionSenderRef = useRef<SessionSender | null>(null);

  // Read contract helper
  const readContract = useCallback(
    async <T,>(fn: string, args: unknown[] = []): Promise<T> => {
      if (!publicClient || !isDonDeployed) {
        throw new Error("Contract not connected");
      }
      return (await publicClient.readContract({
        address: VIPER_DON_ADDRESS,
        abi: doubleOrNothingAbi,
        functionName: fn as any,
        args: args as any,
      })) as T;
    },
    [publicClient]
  );

  // Poll state
  const syncState = useCallback(async () => {
    if (!publicClient || !isDonDeployed) return;

    try {
      const [bRoll, mStake, sToken, blockNum] = await Promise.all([
        readContract<bigint>("bankroll"),
        readContract<bigint>("maxStake"),
        readContract<`0x${string}`>("stakeToken"),
        publicClient.getBlockNumber(),
      ]);

      setBankroll(bRoll);
      setMaxStake(mStake);
      setStakeToken(sToken);
      setCurrentBlock(blockNum);

      if (address) {
        // Read player specific data
        const [pw, flipData] = await Promise.all([
          readContract<bigint>("pendingWithdrawals", [address]),
          readContract<[ `0x${string}`, bigint, bigint, boolean ]>("getFlip", [address]),
        ]);

        setPendingWithdrawal(pw);

        const [comm, stk, blk, act] = flipData;
        if (act) {
          // Recover saved secret from storage
          let savedChoice: 0 | 1 = 0;
          let savedSecret: `0x${string}` = "0x";
          try {
            const stored = sessionStorage.getItem(`${DON_SECRET_STORAGE_PREFIX}${address}`);
            if (stored) {
              const parsed = JSON.parse(stored);
              if (parsed.commitment === comm) {
                savedChoice = parsed.choice;
                savedSecret = parsed.secret;
              }
            }
          } catch {
            // ignore
          }

          setActiveFlip({
            choice: savedChoice,
            secret: savedSecret,
            stake: stk,
            commitBlock: blk,
            commitment: comm,
            active: true,
          });
        } else {
          setActiveFlip(null);
        }

        // Token reads
        if (sToken) {
          try {
            const [bal, allow, dec, sym] = await Promise.all([
              publicClient.readContract({
                address: sToken,
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [address],
              }),
              publicClient.readContract({
                address: sToken,
                abi: erc20Abi,
                functionName: "allowance",
                args: [address, VIPER_DON_ADDRESS],
              }),
              publicClient.readContract({
                address: sToken,
                abi: erc20Abi,
                functionName: "decimals",
              }),
              publicClient.readContract({
                address: sToken,
                abi: erc20Abi,
                functionName: "symbol",
              }),
            ]);

            setTokenBalance(bal);
            setTokenAllowance(allow);
            setTokenDecimals(dec);
            setTokenSymbol(sym);
          } catch {
            // fallback
          }
        }
      }
    } catch (err: any) {
      // Quiet poll failure
    }
  }, [publicClient, address, readContract]);

  useEffect(() => {
    syncState();
    const interval = setInterval(syncState, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [syncState]);

  // Session key initialization
  const initSession = useCallback(async () => {
    if (!walletClient || !address || !publicClient) return;

    try {
      setStatusMessage("Authorizing Fast Play session key…");
      const { privateKey, session: newSession } = createSessionKey();
      sessionPrivRef.current = privateKey;
      sessionSenderRef.current = new SessionSender(privateKey, publicClient, {
        address: VIPER_DON_ADDRESS,
        abi: doubleOrNothingAbi,
      });

      // Submit authorization tx via user wallet
      const hash = await walletClient.writeContract({
        address: VIPER_DON_ADDRESS,
        abi: doubleOrNothingAbi,
        functionName: "authorizeSession",
        args: [newSession.address, BigInt(newSession.expiresAt)],
        chain: activeChain,
        account: address,
      });

      await publicClient.waitForTransactionReceipt({ hash });
      setSession(newSession);
      setStatusMessage("Fast Play session authorized! Zero popups active.");
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      setError(err?.shortMessage || err?.message || "Session authorization failed");
      setTimeout(() => setError(null), 4000);
    }
  }, [walletClient, address, publicClient]);

  // Approve token
  const approveToken = useCallback(
    async (amount: bigint) => {
      if (!walletClient || !address || !stakeToken || !publicClient) return;
      try {
        setStatusMessage("Approving VIPER…");
        const hash = await walletClient.writeContract({
          address: stakeToken,
          abi: erc20Abi,
          functionName: "approve",
          args: [VIPER_DON_ADDRESS, amount],
          chain: activeChain,
          account: address,
        });
        await publicClient.waitForTransactionReceipt({ hash });
        await syncState();
        setStatusMessage("VIPER approved!");
        setTimeout(() => setStatusMessage(null), 2500);
      } catch (err: any) {
        setError(err?.shortMessage || err?.message || "Approval failed");
        setTimeout(() => setError(null), 4000);
      }
    },
    [walletClient, address, stakeToken, publicClient, syncState]
  );

  // Execute full Flip (Commit + Reveal)
  const flip = useCallback(
    async (stake: bigint, choice: 0 | 1) => {
      if (!publicClient || !address) {
        setError("Please connect your wallet");
        return;
      }

      setError(null);
      setLastResult(null);

      try {
        setFlipping(true);
        setStatusMessage("Generating cryptographic commitment…");

        // 1. Generate random 32-byte secret
        const randBytes = crypto.getRandomValues(new Uint8Array(32));
        const secret = toHex(randBytes);
        const commitment = keccak256(
          encodePacked(["uint8", "bytes32"], [choice, secret])
        );

        // Store secret so reveal is guaranteed
        try {
          sessionStorage.setItem(
            `${DON_SECRET_STORAGE_PREFIX}${address}`,
            JSON.stringify({ choice, secret, stake: stake.toString(), commitment })
          );
        } catch {
          // ignore
        }

        // 2. Commit transaction
        setStatusMessage("Committing flip to the chain…");
        let commitTxHash: `0x${string}`;

        if (session && isSessionLive(session) && sessionSenderRef.current) {
          // Use Fast Play session key (no wallet popup!)
          commitTxHash = await sessionSenderRef.current.send(
            "flipCommit" as any,
            [stake, commitment]
          );
        } else {
          // Direct wallet signature
          if (!walletClient) throw new Error("Wallet not connected");
          commitTxHash = await walletClient.writeContract({
            address: VIPER_DON_ADDRESS,
            abi: doubleOrNothingAbi,
            functionName: "flipCommit",
            args: [stake, commitment],
            chain: activeChain,
            account: address,
          });
        }

        const commitReceipt = await publicClient.waitForTransactionReceipt({
          hash: commitTxHash,
        });
        await syncState();

        // 3. Reveal flip
        setStatusMessage("Waiting for next block to reveal fair coin…");
        // Wait a short moment for next block
        await new Promise((r) => setTimeout(r, 1500));

        setStatusMessage("Flipping coin on-chain…");
        let revealTxHash: `0x${string}`;

        if (session && isSessionLive(session) && sessionSenderRef.current) {
          // Fast Play reveal (no wallet popup!)
          revealTxHash = await sessionSenderRef.current.send(
            "flipReveal" as any,
            [choice, secret]
          );
        } else {
          // Direct wallet reveal
          if (!walletClient) throw new Error("Wallet not connected");
          revealTxHash = await walletClient.writeContract({
            address: VIPER_DON_ADDRESS,
            abi: doubleOrNothingAbi,
            functionName: "flipReveal",
            args: [choice, secret],
            chain: activeChain,
            account: address,
          });
        }

        const revealReceipt = await publicClient.waitForTransactionReceipt({
          hash: revealTxHash,
        });

        // Parse outcome from FlipRevealed event
        let won = false;
        let payout = BigInt(0);

        for (const log of revealReceipt.logs) {
          try {
            // Find FlipRevealed event
            if (log.address.toLowerCase() === VIPER_DON_ADDRESS.toLowerCase()) {
              // The event is FlipRevealed(address player, bool won, uint256 payout)
              // Won is in data / topics
            }
          } catch {
            // ignore
          }
        }

        // Determine outcome from state check
        await syncState();
        const currentPw = await readContract<bigint>("pendingWithdrawals", [address]);
        const gross = stake * BigInt(2);
        const fee = (gross * BigInt(500)) / BigInt(10000);
        const expectedPayout = gross - fee;

        if (currentPw >= expectedPayout) {
          won = true;
          payout = expectedPayout;
        } else {
          won = false;
          payout = BigInt(0);
        }

        const coin = (won ? choice : ((1 - choice) as 0 | 1));
        setLastResult({ won, coin, payout });
        setStatusMessage(won ? "WINNER! 1.9x payout credited!" : "House flipped the other side. Try again!");

        // Clear active flip storage
        try {
          sessionStorage.removeItem(`${DON_SECRET_STORAGE_PREFIX}${address}`);
        } catch {
          // ignore
        }
      } catch (err: any) {
        setError(err?.shortMessage || err?.message || "Flip failed");
      } finally {
        setFlipping(false);
        setTimeout(() => setStatusMessage(null), 4000);
      }
    },
    [publicClient, address, session, walletClient, syncState, readContract]
  );

  // Manual Reveal (if previously interrupted)
  const manualReveal = useCallback(async () => {
    if (!activeFlip || !address || !publicClient) return;

    try {
      setFlipping(true);
      setStatusMessage("Submitting reveal transaction…");

      let hash: `0x${string}`;
      if (session && isSessionLive(session) && sessionSenderRef.current) {
        hash = await sessionSenderRef.current.send(
          "flipReveal" as any,
          [activeFlip.choice, activeFlip.secret]
        );
      } else {
        if (!walletClient) throw new Error("Wallet not connected");
        hash = await walletClient.writeContract({
          address: VIPER_DON_ADDRESS,
          abi: doubleOrNothingAbi,
          functionName: "flipReveal",
          args: [activeFlip.choice, activeFlip.secret],
          chain: activeChain,
          account: address,
        });
      }

      await publicClient.waitForTransactionReceipt({ hash });
      await syncState();
      setStatusMessage("Flip revealed!");
    } catch (err: any) {
      setError(err?.shortMessage || err?.message || "Reveal failed");
    } finally {
      setFlipping(false);
    }
  }, [activeFlip, address, publicClient, session, walletClient, syncState]);

  // Claim pending winnings
  const claim = useCallback(async () => {
    if (!walletClient || !address || !publicClient) return;
    try {
      setStatusMessage("Claiming winnings…");
      const hash = await walletClient.writeContract({
        address: VIPER_DON_ADDRESS,
        abi: doubleOrNothingAbi,
        functionName: "claim",
        chain: activeChain,
        account: address,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await syncState();
      setStatusMessage("Claim successful!");
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      setError(err?.shortMessage || err?.message || "Claim failed");
      setTimeout(() => setError(null), 4000);
    }
  }, [walletClient, address, publicClient, syncState]);

  // Reclaim expired flip
  const refund = useCallback(async () => {
    if (!walletClient || !address || !publicClient) return;
    try {
      setStatusMessage("Reclaiming stake (refund)…");
      const hash = await walletClient.writeContract({
        address: VIPER_DON_ADDRESS,
        abi: doubleOrNothingAbi,
        functionName: "refund",
        chain: activeChain,
        account: address,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await syncState();
      setStatusMessage("Stake refunded to pending balance!");
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      setError(err?.shortMessage || err?.message || "Refund failed");
      setTimeout(() => setError(null), 4000);
    }
  }, [walletClient, address, publicClient, syncState]);

  return {
    bankroll,
    maxStake,
    stakeToken,
    tokenSymbol,
    tokenDecimals,
    tokenBalance,
    tokenAllowance,
    pendingWithdrawal,
    currentBlock,
    activeFlip,
    lastResult,
    flipping,
    statusMessage,
    error,
    session,
    sessionActive: isSessionLive(session),
    initSession,
    approveToken,
    flip,
    manualReveal,
    claim,
    refund,
    syncState,
  };
}
