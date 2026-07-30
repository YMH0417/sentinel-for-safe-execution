/** Normalize backend error payloads ({ code, message } | string) for display. */
export function parseApiError(error: unknown, fallback = "Request failed"): string {
  if (error === undefined || error === null) return fallback;
  if (typeof error === "string") return error || fallback;
  if (typeof error === "object") {
    const payload = error as { message?: string; code?: string };
    if (typeof payload.message === "string" && payload.message.trim()) {
      return payload.message;
    }
    if (typeof payload.code === "string" && payload.code.trim()) {
      return payload.code;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return fallback;
    }
  }
  return String(error);
}
