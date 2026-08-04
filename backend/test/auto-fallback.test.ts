import { test } from "node:test";
import assert from "node:assert/strict";
import { supportsAgentAutoFallback } from "../src/config/autoFallbackConfig.js";

test("auto fallback applies to all SHALLOW routes except BAD/BAIT tokenOut", () => {
  assert.equal(supportsAgentAutoFallback("route-usdc-good-shallow"), true);
  assert.equal(supportsAgentAutoFallback("route-good-usdc-shallow"), true);
  assert.equal(supportsAgentAutoFallback("route-bad-usdc-shallow"), true);
  assert.equal(supportsAgentAutoFallback("route-usdc-bad-shallow"), false);
  assert.equal(supportsAgentAutoFallback("route-good-bait-shallow"), false);
  assert.equal(supportsAgentAutoFallback("route-usdc-good-safe"), false);
  assert.equal(supportsAgentAutoFallback("route-usdc-good-toxic"), false);
  assert.equal(supportsAgentAutoFallback("route-usdc-good-sda"), false);
});
