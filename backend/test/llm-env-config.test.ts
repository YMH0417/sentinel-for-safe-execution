import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  maskApiKey,
  readLlmEnvConfigView,
  writeLlmEnvConfig,
} from "../src/services/llmEnvConfigService.js";

test("maskApiKey hides middle of secret", () => {
  assert.equal(maskApiKey(""), null);
  assert.equal(maskApiKey("short"), "****");
  assert.equal(maskApiKey("sk-abcdefghijklmnop"), "****mnop");
});

test("writeLlmEnvConfig persists canonical LLM keys", () => {
  const dir = mkdtempSync(join(tmpdir(), "sentinel-llm-env-"));
  const prevCwd = process.cwd();
  try {
    process.chdir(dir);
    writeFileSync(".env", "RPC_URL=http://127.0.0.1:8545\n# demo\n");

    writeLlmEnvConfig({
      apiKey: "sk-test-key-1234",
      baseUrl: "https://api.example.com/v1",
      model: "test-model",
      enabled: true,
    });

    const content = readFileSync(".env", "utf-8");
    assert.match(content, /RPC_URL=http:\/\/127\.0\.0\.1:8545/);
    assert.match(content, /LLM_API_KEY=sk-test-key-1234/);
    assert.match(content, /LLM_BASE_URL=https:\/\/api\.example\.com\/v1/);
    assert.match(content, /LLM_MODEL=test-model/);
    assert.match(content, /LLM_ANALYSIS_ENABLED=true/);

    const view = readLlmEnvConfigView();
    assert.equal(view.apiKeyConfigured, true);
    assert.equal(view.baseUrl, "https://api.example.com/v1");
    assert.equal(view.model, "test-model");
    assert.equal(view.enabled, true);
    assert.equal(view.responseLanguage, "zh");
  } finally {
    process.chdir(prevCwd);
    rmSync(dir, { recursive: true, force: true });
  }
});
