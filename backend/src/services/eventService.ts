import { randomUUID } from "crypto";
import { mkdirSync, appendFileSync, readFileSync, existsSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Event } from "../types.js";
import { isDemoChainMode } from "../config/demoConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EVENTS_DIR = join(__dirname, "../../data");
const EVENTS_FILE = join(EVENTS_DIR, "events.jsonl");

const events: Event[] = [];
let loaded = false;

function currentChainMode(): "mock" | "demo" | "rpc" {
  const mode = process.env.CHAIN_MODE?.trim().toLowerCase();
  if (mode === "mock") return "mock";
  if (mode === "demo") return "demo";
  if (mode === "rpc") return "rpc";
  if (isDemoChainMode()) return "demo";
  return "rpc";
}

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  if (!existsSync(EVENTS_FILE)) return;
  const raw = readFileSync(EVENTS_FILE, "utf-8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as Event);
    } catch {
      // skip corrupt lines
    }
  }
}

function persistEvent(event: Event): void {
  mkdirSync(EVENTS_DIR, { recursive: true });
  appendFileSync(EVENTS_FILE, `${JSON.stringify(event)}\n`, "utf-8");
}

export function addEvent(event: Omit<Event, "id" | "timestamp">): Event {
  ensureLoaded();
  const fullEvent: Event = {
    ...event,
    context: {
      ...event.context,
      chainMode: currentChainMode(),
    },
    id: `evt_${randomUUID()}`,
    schemaVersion: event.schemaVersion ?? 1,
    source: event.source ?? "sentinel-backend",
    timestamp: Date.now(),
  };
  events.push(fullEvent);
  persistEvent(fullEvent);
  return fullEvent;
}

export function getEvents(): Event[] {
  ensureLoaded();
  return [...events];
}

export function clearEvents(): void {
  ensureLoaded();
  events.length = 0;
  mkdirSync(EVENTS_DIR, { recursive: true });
  writeFileSync(EVENTS_FILE, "", "utf-8");
}

export function getEventsFilePath(): string {
  return EVENTS_FILE;
}
