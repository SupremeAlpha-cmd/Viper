/**
 * Slice-2 verification: drives a full match against a local anvil
 * deployment using the SAME interaction patterns as lib/useViper.ts
 * (reads, multicall, approve+join, event decode via decodeEventLog).
 *
 * Usage: node scripts/e2e-anvil.mjs <arenaAddress> <tokenAddress>
 */
import {
  createPublicClient,
  http,
  decodeEventLog,
  parseEther,
  encodeFunctionData,
} from "viem";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const abi = require("../lib/abi.json");

const [arenaAddr, tokenAddr] = process.argv.slice(2);
if (!arenaAddr || !tokenAddr) {
  console.error("usage: node scripts/e2e-anvil.mjs <arena> <token>");
  process.exit(1);
}

const anvil = { id: 31337, name: "Anvil", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } } };
const transport = http("http://127.0.0.1:8545");
const publicClient = createPublicClient({ chain: anvil, transport });

// anvil default accounts — anvil auto-unlocks them, so eth_sendTransaction
// signs server-side. (Local signing libs are version-fussy; the reads and
// event-decoding below are the parts this script is actually verifying.)
const A = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const B = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

/** Send a tx from an unlocked anvil account, wait for receipt. */
async function send(from, to, data) {
  const hash = await publicClient.request({
    method: "eth_sendTransaction",
    params: [{ from, to, data }],
  });
  return publicClient.waitForTransactionReceipt({ hash });
}
const arenaCall = (from, fn, args = []) =>
  send(from, ARENA, encodeFunctionData({ abi, functionName: fn, args }));

const ARENA = arenaAddr;
const TOKEN = tokenAddr;
const read = (fn, args = []) =>
  publicClient.readContract({ address: ARENA, abi, functionName: fn, args });
const erc20 = [
  { type: "function", name: "approve", inputs: [{ name: "s", type: "address" }, { name: "a", type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "nonpayable" },
  { type: "function", name: "balanceOf", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
];
const ok = (name, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) process.exitCode = 1;
};

async function joinFlow(acct) {
  const fee = await read("entryFee");
  await send(acct, TOKEN, encodeFunctionData({ abi: erc20, functionName: "approve", args: [ARENA, fee] }));
  await arenaCall(acct, "join");
}

async function main() {
  // --- hook-style sync: phase, matchId, players, pot ---
  const phase0 = await read("phase");
  const mid0 = await read("matchId");
  ok("a lobby is open", phase0 === 0 && mid0 >= 1n);
  const fee = await read("entryFee");
  ok("entry fee is 10 mUSDG", fee === parseEther("10"));

  const balBefore = await publicClient.readContract({ address: TOKEN, abi: erc20, functionName: "balanceOf", args: [B] });
  await joinFlow(A);
  await joinFlow(B);
  const players = await read("getPlayers");
  const pot = await read("pot");
  ok("2 players joined", players.length === 2);
  ok("pot = 20", pot === parseEther("20"));

  // --- fast-forward past the 60s lobby, start ---
  await publicClient.request({ method: "evm_increaseTime", params: [61] });
  await publicClient.request({ method: "evm_mine", params: [] });
  const startReceipt = await arenaCall(A, "startMatch");
  ok("phase is live after start", (await read("phase")) === 1);

  // --- getMatchState, like the hook (single call, no multicall3) ---
  const [sAddrs, sXs, sYs, sAlives] = await read("getMatchState");
  ok(
    "getMatchState resolves roster with spread spawns",
    sAddrs.length === 2 &&
      sAlives.every((a) => a === true) &&
      Number(sXs[0]) === 0 && Number(sYs[0]) === 0 &&
      Number(sXs[1]) === 10 && Number(sYs[1]) === 0
  );
  console.log(`   spawn: A=(${sXs[0]},${sYs[0]}) B=(${sXs[1]},${sYs[1]})`);

  // --- move + plant, like the UI buttons ---
  const ax0 = Number(await read("px", [A]));
  await arenaCall(A, "move", [1, 0]).catch(() => {});
  const ax1 = Number(await read("px", [A]));
  console.log(`   A moved x: ${ax0} -> ${ax1} (may be unchanged at grid edge)`);

  await arenaCall(A, "plantBomb");
  const bombs = (await read("getBombs")).filter((b) => b.live);
  ok("bomb is live", bombs.length === 1);

  // --- mine past the 5-block fuse, poke, decode events like the hook ---
  const detonateAt = Number(bombs[0].detonateAt);
  let bn = Number(await publicClient.getBlockNumber());
  while (bn < detonateAt) {
    await publicClient.request({ method: "evm_mine", params: [] });
    bn = Number(await publicClient.getBlockNumber());
  }
  const pokeReceipt = await arenaCall(A, "poke");

  let sawExplosion = false;
  let sawEnd = null;
  for (const log of pokeReceipt.logs) {
    try {
      const d = decodeEventLog({ abi, data: log.data, topics: log.topics });
      if (d.eventName === "BombExploded") sawExplosion = true;
      if (d.eventName === "MatchEnded") sawEnd = d.args;
      if (d.eventName === "PlayerDied") console.log(`   PlayerDied: ${d.args.player.slice(0, 10)}…`);
    } catch { /* not ours */ }
  }
  ok("BombExploded decoded from logs (flash path)", sawExplosion);
  const aliveA = await read("alive", [A]);
  ok("A died standing on own bomb (suicide kill path)", aliveA === false);
  ok("MatchEnded decoded (result banner path)", !!sawEnd);
  if (sawEnd) {
    ok("B is the winner", sawEnd.winner.toLowerCase() === B.toLowerCase());
    ok("prize = 19 (20 minus 5% fee)", sawEnd.prize === parseEther("19"));
  }
  ok("back in lobby for next match", (await read("phase")) === 0);

  const balB = await publicClient.readContract({ address: TOKEN, abi: erc20, functionName: "balanceOf", args: [B] });
  ok("B netted +9 (10 entry in, 19 prize out)", balB === balBefore - parseEther("10") + parseEther("19"));

  // --- also decode via getLogs across blocks, exactly like useViper ---
  const logs = await publicClient.getLogs({ address: ARENA, fromBlock: startReceipt.blockNumber, toBlock: "latest" });
  const names = new Set();
  for (const log of logs) {
    try { names.add(decodeEventLog({ abi, data: log.data, topics: log.topics }).eventName); } catch {}
  }
  ok("getLogs decode finds MatchEnded", names.has("MatchEnded"));
  console.log("\nDone. events seen:", [...names].join(", "));
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
