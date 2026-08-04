import type { Event } from "../types.js";

export interface EventsRepository {
  getFilePath(): string;
  addEvent(event: Omit<Event, "id" | "timestamp">): Promise<Event>;
  getEvents(): Promise<Event[]>;
  clearEvents(): Promise<void>;
  countEvents(): Promise<number>;
}

let eventsRepo: EventsRepository | null = null;

export async function getEventsRepository(): Promise<EventsRepository> {
  if (eventsRepo) return eventsRepo;
  const { usePostgresStorage } = await import("./config.js");
  if (usePostgresStorage()) {
    const { PostgresEventsRepository } = await import("./postgresEventsRepository.js");
    eventsRepo = new PostgresEventsRepository();
  } else {
    const { FileEventsRepository } = await import("./fileEventsRepository.js");
    eventsRepo = new FileEventsRepository();
  }
  return eventsRepo;
}

export function resetEventsRepositoryForTests(): void {
  eventsRepo = null;
}
