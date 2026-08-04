/**
 * Evaluate all 48 demo routes and compare to design expectations.
 * Run: CHAIN_MODE=demo RPC_URL=... tsx test/evaluate-all-routes.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { config as loadEnv } from "dotenv";
import { resolve } from "path";

loadEnv({ path: resolve(process.cwd(), ".env") });

import { generateAllRouteNames, parseRouteName, tokenSymbolFromKey } from "../src/config/demoRoutes.js";
import type { DecisionType } from "../src/types.js";

type ExpectedDecision = DecisionType | "ALLOW|FALLBACK";

function expectedDecision(routeId: string, amountIn: number): ExpectedDecision {
  const parsed = parseRouteName(routeId);
  assert.ok(parsed, `bad route id ${routeId}`);
  const tokenOut = tokenSymbolFromKey(parsed.tokenOutKey)!;

  if (tokenOut === "BAD" || tokenOut === "BAIT") return "REJECT";
  if (parsed.poolKey === "sda") return "REJECT";
  if (parsed.poolKey === "safe") return "ALLOW";
  if (parsed.poolKey === "toxic") return "REJECT";
  // shallow — amount dependent
  if (amountIn >= 50) return "FALLBACK_TO_SAFE_ROUTE";
  return "ALLOW|FALLBACK";
}

test("all 48 routes match design expectations (normal profile)", async (t) => {
  if (process.env.RUN_ROUTE_EVAL_TEST !== "1") {
    t.skip("set RUN_ROUTE_EVAL_TEST=1 with live demo RPC to run");
    return;
  }

  process.env.CHAIN_MODE = "demo";
  const { evaluateRoute } = await import("../src/services/agentService.js");
  const routes = generateAllRouteNames();

  for (const amountIn of [1, 100]) {
    await t.test(`amountIn=${amountIn}`, async () => {
      const mismatches: string[] = [];
      for (const routeId of routes) {
        const expected = expectedDecision(routeId, amountIn);
        const decision = await evaluateRoute(routeId, "normal", {
          amountIn,
        });
        const ok =
          expected === decision.decision ||
          (expected === "ALLOW|FALLBACK" &&
            (decision.decision === "ALLOW" || decision.decision === "FALLBACK_TO_SAFE_ROUTE"));
        if (!ok) {
          mismatches.push(
            `${routeId}: expected ${expected}, got ${decision.decision} (score=${decision.riskScore})`
          );
        }
      }
      if (mismatches.length > 0) {
        assert.fail(mismatches.join("\n"));
      }
    });
  }
});

test("static expectation matrix covers 48 routes", () => {
  const routes = generateAllRouteNames();
  assert.equal(routes.length, 48);
  for (const routeId of routes) {
    assert.ok(expectedDecision(routeId, 1));
    assert.ok(expectedDecision(routeId, 100));
  }
});
