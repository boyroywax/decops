const PERF_DEBUG_KEY = "decops:perf-debug";
const PERF_EVENT_NAME = "decops:perf-event";

export function isPerfDebugEnabled(): boolean {
  if (typeof globalThis === "undefined") return false;
  try {
    return globalThis.localStorage?.getItem(PERF_DEBUG_KEY) === "1";
  } catch {
    return false;
  }
}

export interface PerfEventRecord {
  event: string;
  payload: Record<string, unknown>;
  ts: number;
}

export function subscribePerfEvents(
  listener: (record: PerfEventRecord) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (evt: Event) => {
    const custom = evt as CustomEvent<PerfEventRecord>;
    if (custom.detail) listener(custom.detail);
  };
  window.addEventListener(PERF_EVENT_NAME, handler);
  return () => window.removeEventListener(PERF_EVENT_NAME, handler);
}

export function perfNow(): number {
  if (typeof globalThis !== "undefined" && globalThis.performance && typeof globalThis.performance.now === "function") {
    return globalThis.performance.now();
  }
  return Date.now();
}

export function perfLog(event: string, payload: Record<string, unknown>): void {
  if (!isPerfDebugEnabled()) return;
  const record: PerfEventRecord = {
    event,
    payload,
    ts: Date.now(),
  };
  try {
    console.debug(`[perf] ${event}`, payload);
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent<PerfEventRecord>(PERF_EVENT_NAME, { detail: record }));
    }
  } catch {
    // Ignore logging failures.
  }
}
