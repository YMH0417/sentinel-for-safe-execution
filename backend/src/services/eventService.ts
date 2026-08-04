import { Event } from "../types.js";
import { getEventsRepository } from "../storage/eventsRepository.js";
import { usePostgresStorage } from "../storage/config.js";

export async function addEvent(event: Omit<Event, "id" | "timestamp">): Promise<Event> {
  const repo = await getEventsRepository();
  return repo.addEvent(event);
}

export async function getEvents(): Promise<Event[]> {
  const repo = await getEventsRepository();
  return repo.getEvents();
}

export async function clearEvents(): Promise<void> {
  const repo = await getEventsRepository();
  await repo.clearEvents();
}

export async function getEventsFilePath(): Promise<string> {
  const repo = await getEventsRepository();
  return repo.getFilePath();
}

export async function getEventsStorageLabel(): Promise<string> {
  return usePostgresStorage() ? "postgres://events" : await getEventsFilePath();
}
