import { randomUUID } from "crypto";
import { mkdirSync, appendFileSync, readFileSync, existsSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { Event } from "../types.js";
import { isDemoChainMode } from "../config/demoConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EVENTS_DIR = join(__dirname, "../../data");
const EVENTS_FILE = join(EVENTS_DIR, "events.jsonl");

function currentChainMode(): "mock" | "demo" | "rpc" {
  const mode = process.env.CHAIN_MODE?.trim().toLowerCase();
  if (mode === "mock") return "mock";
  if (mode === "demo") return "demo";
  if (mode === "rpc") return "rpc";
  if (isDemoChainMode()) return "demo";
  return "rpc";
}

export class FileEventsRepository {
  private events: Event[] = [];
  private loaded = false;

  getFilePath(): string {
    return EVENTS_FILE;
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    if (!existsSync(EVENTS_FILE)) return;
    const raw = readFileSync(EVENTS_FILE, "utf-8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        this.events.push(JSON.parse(trimmed) as Event);
      } catch {
        // skip corrupt lines
      }
    }
  }

  private persistEvent(event: Event): void {
    mkdirSync(EVENTS_DIR, { recursive: true });
    appendFileSync(EVENTS_FILE, `${JSON.stringify(event)}\n`, "utf-8");
  }

  async addEvent(event: Omit<Event, "id" | "timestamp">): Promise<Event> {
    this.ensureLoaded();
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
    this.events.push(fullEvent);
    this.persistEvent(fullEvent);
    return fullEvent;
  }

  async getEvents(): Promise<Event[]> {
    this.ensureLoaded();
    return [...this.events];
  }

  async clearEvents(): Promise<void> {
    this.ensureLoaded();
    this.events.length = 0;
    mkdirSync(EVENTS_DIR, { recursive: true });
    writeFileSync(EVENTS_FILE, "", "utf-8");
  }

  async countEvents(): Promise<number> {
    this.ensureLoaded();
    return this.events.length;
  }
}
