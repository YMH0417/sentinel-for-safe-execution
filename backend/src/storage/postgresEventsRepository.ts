import { randomUUID } from "crypto";
import type { Event } from "../types.js";
import { isDemoChainMode } from "../config/demoConfig.js";
import { getSql } from "./db.js";

function currentChainMode(): "mock" | "demo" | "rpc" {
  const mode = process.env.CHAIN_MODE?.trim().toLowerCase();
  if (mode === "mock") return "mock";
  if (mode === "demo") return "demo";
  if (mode === "rpc") return "rpc";
  if (isDemoChainMode()) return "demo";
  return "rpc";
}

type EventRow = {
  id: string;
  timestamp_ms: string;
  event_type: string;
  schema_version: number;
  source: string;
  chain_mode: string | null;
  payload: Event;
};

function rowToEvent(row: EventRow): Event {
  const payload = row.payload;
  const chainMode =
    (row.chain_mode as "mock" | "demo" | "rpc" | null) ??
    (payload.context?.chainMode as "mock" | "demo" | "rpc" | undefined);
  return {
    ...payload,
    id: row.id,
    timestamp: Number(row.timestamp_ms),
    eventType: row.event_type as Event["eventType"],
    schemaVersion: row.schema_version,
    source: row.source,
    context: {
      ...payload.context,
      ...(chainMode ? { chainMode } : {}),
    },
  };
}

export class PostgresEventsRepository {
  getFilePath(): string {
    return "postgres://events";
  }

  async addEvent(event: Omit<Event, "id" | "timestamp">): Promise<Event> {
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

    const sql = getSql();
    await sql`
      INSERT INTO events (
        id, timestamp_ms, event_type, schema_version, source, chain_mode, payload
      ) VALUES (
        ${fullEvent.id},
        ${fullEvent.timestamp},
        ${fullEvent.eventType},
        ${fullEvent.schemaVersion ?? 1},
        ${fullEvent.source ?? "sentinel-backend"},
        ${fullEvent.context?.chainMode ?? null},
        ${JSON.stringify(fullEvent)}::jsonb
      )
    `;

    return fullEvent;
  }

  async getEvents(): Promise<Event[]> {
    const sql = getSql();
    const rows = (await sql`
      SELECT id, timestamp_ms, event_type, schema_version, source, chain_mode, payload
      FROM events
      ORDER BY timestamp_ms ASC
    `) as EventRow[];
    return rows.map(rowToEvent);
  }

  async clearEvents(): Promise<void> {
    const sql = getSql();
    await sql`TRUNCATE events RESTART IDENTITY CASCADE`;
  }

  async countEvents(): Promise<number> {
    const sql = getSql();
    const [row] = (await sql`SELECT COUNT(*)::int AS count FROM events`) as Array<{
      count: number;
    }>;
    return row?.count ?? 0;
  }
}
