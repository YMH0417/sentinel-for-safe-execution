import type { Event } from "../types";

/** Match backend event context fields to a connected wallet (checksum or lower). */
export function eventMatchesAccount(event: Event, account: string): boolean {
  const lower = account.toLowerCase();
  const ctx = event.context ?? {};
  for (const key of ["account", "recipient", "user"] as const) {
    const value = ctx[key];
    if (typeof value === "string" && value.toLowerCase() === lower) {
      return true;
    }
  }
  return false;
}

/** Events before account tagging (legacy demo data). */
export function isUnattributedTradeEvent(event: Event): boolean {
  const ctx = event.context ?? {};
  return !ctx.account && !ctx.recipient && !ctx.user;
}
