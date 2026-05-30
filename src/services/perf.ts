const PERF_DEBUG_KEY = "decops:perf-debug";

function isPerfDebugEnabled(): boolean {
  if (typeof globalThis === "undefined") return false;
  try {
    return globalThis.localStorage?.getItem(PERF_DEBUG_KEY) === "1";
  } catch {
    return false;
  }
}

export function perfNow(): number {
  if (typeof globalThis !== "undefined" && globalThis.performance && typeof globalThis.performance.now === "function") {
    return globalThis.performance.now();
  }
  return Date.now();
}

export function perfLog(event: string, payload: Record<string, unknown>): void {
  if (!isPerfDebugEnabled()) return;
  try {
    console.debug(`[perf] ${event}`, payload);
  } catch {
    // Ignore logging failures.
  }
}
