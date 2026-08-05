import type { VercelRequest, VercelResponse } from "@vercel/node";
import { bootstrapApp, createApp } from "../backend/dist/app.js";

const app = createApp();
let ready: Promise<void> | null = null;

async function ensureReady(): Promise<void> {
  if (!ready) {
    ready = bootstrapApp();
  }
  await ready;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await ensureReady();
  return app(req, res);
}
