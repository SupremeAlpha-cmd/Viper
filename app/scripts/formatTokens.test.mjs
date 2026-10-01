/**
 * Unit checks for lib/format.ts — run with: node --test scripts/formatTokens.test.mjs
 * (Node >= 22 type-strips the imported .ts file; no build step needed.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTokens } from "../lib/format.ts";

test("decimals === 0 returns the raw integer (UI-01)", () => {
  assert.equal(formatTokens(0n, 0), "0");
  assert.equal(formatTokens(123n, 0), "123");
  assert.equal(formatTokens(1000000n, 0), "1000000");
});

test("18 decimals formats like viem formatUnits", () => {
  assert.equal(formatTokens(0n, 18), "0");
  assert.equal(formatTokens(1_000_000_000_000_000_000n, 18), "1");
  assert.equal(formatTokens(1_500_000_000_000_000_000n, 18), "1.5");
  assert.equal(formatTokens(1_234_567_890_123_456_789n, 18), "1.2345");
  // Pre-existing dust behavior: sub-0.0001 amounts render as "0.0000".
  assert.equal(formatTokens(5_000n, 18), "0.0000");
});

test("6 decimals (USDC-style)", () => {
  assert.equal(formatTokens(1_000_000n, 6), "1");
  assert.equal(formatTokens(1_250_000n, 6), "1.25");
  assert.equal(formatTokens(42n, 6), "0.0000");
});
