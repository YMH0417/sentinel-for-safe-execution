import { test } from "node:test";
import assert from "node:assert/strict";
import { DEMO_TOKEN_RISK_TAGS } from "../src/services/chainQuoteService.js";
import { isRateLimitError } from "../src/utils/rpcRetry.js";

test("demo token risk tags match DemoPoolRegistry.TokenRiskTag enum", () => {
  assert.equal(DEMO_TOKEN_RISK_TAGS.USDC, 0);
  assert.equal(DEMO_TOKEN_RISK_TAGS.GOOD, 0);
  assert.equal(DEMO_TOKEN_RISK_TAGS.BAD, 1);
  assert.equal(DEMO_TOKEN_RISK_TAGS.BAIT, 2);
});

test("rpc retry treats missing revert data as rate limit", () => {
  const err = {
    code: "CALL_EXCEPTION",
    message: 'missing revert data (action="call", data=null)',
  };
  assert.equal(isRateLimitError(err), true);
});
