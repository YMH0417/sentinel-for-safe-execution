// backend/src/index.ts — local dev server
import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import http from "http";

loadEnv({ path: resolve(process.cwd(), ".env"), override: true });

import { bootstrapApp, createApp, logStartupBanner } from "./app.js";

const app = createApp();
const PORT = Number(process.env.PORT) || 8080;
const server = http.createServer(app);

async function main(): Promise<void> {
  await bootstrapApp();
  server.listen(PORT, "127.0.0.1", () => {
    logStartupBanner(PORT);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

export default app;
