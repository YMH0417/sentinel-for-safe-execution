import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import test from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import analysisRouter from "../src/routes/analysis.js";

test("analysis API exposes the shipped definition and runs custom mappings", async (t) => {
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.use("/api/analysis", analysisRouter);
  const server = http.createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}/api/analysis`;

  const definitionResponse = await fetch(`${baseUrl}/definition`);
  assert.equal(definitionResponse.status, 200);
  const definition = (await definitionResponse.json()) as {
    name: string;
    fields: { category: string };
  };
  assert.equal(definition.name, "sentinel-events");
  assert.equal(definition.fields.category, "eventType");

  const runResponse = await fetch(`${baseUrl}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      records: [
        {
          order_id: "one",
          created_at: "2026-07-30T00:00:00Z",
          kind: "sale",
          status: "ok",
          amount: 12,
        },
      ],
      definition: {
        name: "orders",
        version: "1",
        fields: {
          id: "order_id",
          timestamp: "created_at",
          category: "kind",
          outcome: "status",
        },
        metrics: { value: "amount" },
      },
    }),
  });
  assert.equal(runResponse.status, 200);
  const report = (await runResponse.json()) as {
    quality: { validRows: number };
    summary: {
      categoryCounts: Record<string, number>;
      metrics: { value: { sum: number } };
    };
  };
  assert.equal(report.quality.validRows, 1);
  assert.equal(report.summary.categoryCounts.sale, 1);
  assert.equal(report.summary.metrics.value.sum, 12);

  const limitResponse = await fetch(`${baseUrl}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records: Array.from({ length: 10_001 }, () => null) }),
  });
  assert.equal(limitResponse.status, 413);
});
