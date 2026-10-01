/**
 * Run: anvil --port 8545 & forge script script/DeployLocal.s.sol:DeployLocal --rpc-url http://127.0.0.1:8545 --unlocked --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 --broadcast; node app/scripts/session-e2e.cjs
 * Addresses below are deterministic for a fresh anvil + this deploy order.
 */
/**
 * E2E: session-key fast play on local anvil.
 * Mirrors the real client path exactly:
 *  - player wallet = anvil unlocked account via eth_sendTransaction
 *    (anvil signs server-side; no private key handled here)
 *  - session key = ephemeral viem keypair, local signing, raw broadcast
 *    (same as app/lib/session.ts SessionSender)
 *
 * Flow: A approves -> A joinWithSession(K) -> A tops up K -> B joins ->
 * warp 61s -> startMatch -> K moves x3 + plants (zero wallet involvement)
 * -> K self-revokes -> K move reverts.
 */
const {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  getAddress,
} = require("/home/hatch/workspace/viper/app/node_modules/viem");
const { generatePrivateKey, privateKeyToAccount } = require("/home/hatch/workspace/viper/app/node_modules/viem/accounts");
const arenaAbi = require("/home/hatch/workspace/viper/app/lib/abi.json");

const RPC = "http://127.0.0.1:8545";
const TOKEN = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const ARENA = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const A = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const B = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

const erc20Abi = [
  { type: "function", name: "approve", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "nonpayable" },
  { type: "function", name: "balanceOf", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
];

const chain = { id: 31337, name: "Anvil", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const publicClient = createPublicClient({ chain, transport: http(RPC) });
// Address-only accounts: anvil signs via eth_sendTransaction (unlocked).
const walletFor = (addr) => createWalletClient({ account: getAddress(addr), chain, transport: http(RPC) });

const ok = (cond, msg) => { console.log(cond ? `  PASS ${msg}` : `  FAIL ${msg}`); if (!cond) process.exitCode = 1; };

(async () => {
  const wA = walletFor(A), wB = walletFor(B);
  const ENTRY = parseEther("10");

  console.log("== entry: approve + joinWithSession + top-up (player wallet, 3 txs) ==");
  // Ephemeral session key — generated in memory, exactly like the client.
  const sessionPriv = generatePrivateKey();
  const sessionAcct = privateKeyToAccount(sessionPriv);
  const K = sessionAcct.address;
  const expiry = Math.floor(Date.now() / 1000) + 2 * 3600;
  console.log("  session key:", K);

  let h = await wA.writeContract({ address: TOKEN, abi: erc20Abi, functionName: "approve", args: [ARENA, ENTRY], chain });
  await publicClient.waitForTransactionReceipt({ hash: h });
  h = await wA.writeContract({ address: ARENA, abi: arenaAbi, functionName: "joinWithSession", args: [K, expiry], chain });
  await publicClient.waitForTransactionReceipt({ hash: h });
  const topUp = parseEther("0.01");
  h = await wA.sendTransaction({ to: K, value: topUp, chain });
  await publicClient.waitForTransactionReceipt({ hash: h });
  const reg = await publicClient.readContract({ address: ARENA, abi: arenaAbi, functionName: "sessions", args: [K] });
  ok(reg[0].toLowerCase() === A.toLowerCase() && !reg[2], "session registered for A");
  ok((await publicClient.getBalance({ address: K })) === topUp, "session key funded");

  console.log("== B joins, lobby closes, match starts ==");
  h = await wB.writeContract({ address: TOKEN, abi: erc20Abi, functionName: "approve", args: [ARENA, ENTRY], chain });
  await publicClient.waitForTransactionReceipt({ hash: h });
  h = await wB.writeContract({ address: ARENA, abi: arenaAbi, functionName: "join", chain });
  await publicClient.waitForTransactionReceipt({ hash: h });
  await publicClient.request({ method: "evm_increaseTime", params: [61] });
  await publicClient.request({ method: "evm_mine", params: [] });
  h = await wA.writeContract({ address: ARENA, abi: arenaAbi, functionName: "startMatch", chain });
  await publicClient.waitForTransactionReceipt({ hash: h });
  ok(Number(await publicClient.readContract({ address: ARENA, abi: arenaAbi, functionName: "phase" })) === 1, "match live");

  console.log("== gameplay via session key: local signing, raw broadcast, NO wallet ==");
  // Mirror of app/lib/session.ts SessionSender (nonce manager + queue).
  const sessionClient = createWalletClient({ account: sessionAcct, chain, transport: http(RPC) });
  let nonce = await publicClient.getTransactionCount({ address: K, blockTag: "pending" });
  let queue = Promise.resolve();
  const send = (fn, args) => {
    const run = queue.then(async () => {
      const hash = await sessionClient.writeContract({ address: ARENA, abi: arenaAbi, functionName: fn, args, chain, nonce: nonce++ });
      return publicClient.waitForTransactionReceipt({ hash });
    });
    queue = run.catch(() => {});
    return run;
  };

  const pxBefore = Number(await publicClient.readContract({ address: ARENA, abi: arenaAbi, functionName: "px", args: [A] }));
  await send("move", [1, 0]);
  await send("move", [1, 0]);
  await send("move", [0, 1]);
  const pxAfter = Number(await publicClient.readContract({ address: ARENA, abi: arenaAbi, functionName: "px", args: [A] }));
  const pyAfter = Number(await publicClient.readContract({ address: ARENA, abi: arenaAbi, functionName: "py", args: [A] }));
  ok(pxAfter === pxBefore + 2 && pyAfter === 1, `session moves landed on A's coords (${pxBefore},0 -> ${pxAfter},${pyAfter})`);

  await send("plantBomb", []);
  const bombs = await publicClient.readContract({ address: ARENA, abi: arenaAbi, functionName: "getBombs" });
  const live = bombs.filter((b) => b.live);
  ok(live.length === 1 && live[0].planter.toLowerCase() === A.toLowerCase(), "bomb planter is the player, not the key");
  ok(live[0].x === pxAfter && live[0].y === pyAfter, "bomb on player's tile");

  console.log("== self-revoke kills the key ==");
  await send("revokeSession", [K]);
  let reverted = false;
  try {
    await send("move", [1, 0]);
  } catch (e) {
    reverted = /no session/i.test(String(e?.message ?? e)) || /revert/i.test(String(e?.message ?? e));
  }
  ok(reverted, "revoked key cannot move");

  console.log(process.exitCode ? "E2E FAILED" : "E2E OK — 4 gameplay txs, zero wallet pop-ups");
})().catch((e) => { console.error("E2E ERROR", e); process.exit(1); });
