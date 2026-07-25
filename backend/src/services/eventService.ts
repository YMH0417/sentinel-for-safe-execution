// backend/src/services/eventService.ts — Dev D: 事件日志管理
import { Event } from "../types.js";

const events: Event[] = [];

export function addEvent(event: Omit<Event, "id" | "timestamp">): Event {
  const fullEvent: Event = {
    ...event,
    id: `evt_${Date.now()}_${events.length + 1}`,
    timestamp: Date.now(),
  };
  events.push(fullEvent);
  return fullEvent;
}

export function getEvents(): Event[] {
  return [...events];
}

export function clearEvents(): void {
  events.length = 0;
}
