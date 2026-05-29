/**
 * ActivityBus — pub/sub event log for operational signals.
 *
 * Singleton, in-memory ring buffer. Subscribers receive events that match
 * their optional filter. Survives HMR within a session but is not persisted
 * across reloads (events are ephemeral by design — durable audit lives in
 * the logging service / Notebook).
 */
import type {
  ActivityEvent,
  ActivityEventInput,
  ActivityFilter,
  ActivityListener,
} from "./types";

const DEFAULT_RETENTION = 2000;

const SEVERITY_RANK: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function matchesFilter(event: ActivityEvent, filter?: ActivityFilter): boolean {
  if (!filter) return true;
  if (filter.sources && filter.sources.length > 0 && !filter.sources.includes(event.source)) return false;
  if (filter.kinds && filter.kinds.length > 0 && !filter.kinds.includes(event.kind)) return false;
  if (filter.severities && filter.severities.length > 0 && !filter.severities.includes(event.severity)) return false;
  if (filter.channels && filter.channels.length > 0 && !filter.channels.includes(event.channel)) return false;
  if (filter.since !== undefined && event.timestamp < filter.since) return false;
  if (filter.until !== undefined && event.timestamp > filter.until) return false;
  if (filter.search) {
    const q = filter.search.toLowerCase();
    const hay = [
      event.title,
      event.message ?? "",
      event.channel,
      (event.tags ?? []).join(" "),
    ].join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export class ActivityBus {
  private buffer: ActivityEvent[] = [];
  private listeners = new Set<{ fn: ActivityListener; filter?: ActivityFilter }>();
  private removalListeners = new Set<(id: string) => void>();
  private seq = 0;
  private retention: number;

  constructor(retention: number = DEFAULT_RETENTION) {
    this.retention = retention;
  }

  /**
   * Publish an event. Returns the materialised event with id + timestamp.
   *
   * If `input.id` is provided and a buffered event already carries that id,
   * the existing entry is removed and the new event is appended — so the
   * envelope floats to the newest position. This lets long-lived signals
   * (e.g. a job lifecycle) collapse into a single, in-place-updating row
   * ordered by the timestamp of its most recent transition.
   */
  publish(input: ActivityEventInput): ActivityEvent {
    const timestamp = input.timestamp ?? Date.now();
    const providedId = input.id;
    const id = providedId ?? `act-${timestamp.toString(36)}-${(this.seq++).toString(36)}`;
    const event: ActivityEvent = {
      ...input,
      id,
      timestamp,
    };
    if (providedId) {
      const existingIdx = this.buffer.findIndex((e) => e.id === providedId);
      if (existingIdx !== -1) this.buffer.splice(existingIdx, 1);
    }
    this.buffer.push(event);
    if (this.buffer.length > this.retention) {
      this.buffer.splice(0, this.buffer.length - this.retention);
    }
    for (const sub of this.listeners) {
      if (matchesFilter(event, sub.filter)) {
        try {
          sub.fn(event);
        } catch {
          // listener errors must not break the publisher
        }
      }
    }
    return event;
  }

  /** Subscribe; returns an unsubscribe function. */
  subscribe(fn: ActivityListener, filter?: ActivityFilter): () => void {
    const sub = { fn, filter };
    this.listeners.add(sub);
    return () => {
      this.listeners.delete(sub);
    };
  }

  /**
   * Remove an event by id. Returns true if a buffered event was dropped.
   * Removal listeners are notified so subscribers (e.g. useActivityFeed)
   * can prune their derived state. This is the symmetric counterpart to
   * the upsert-by-id behaviour of `publish`.
   */
  remove(id: string): boolean {
    const idx = this.buffer.findIndex((e) => e.id === id);
    if (idx === -1) return false;
    this.buffer.splice(idx, 1);
    for (const fn of this.removalListeners) {
      try {
        fn(id);
      } catch {
        // listener errors must not break the remover
      }
    }
    return true;
  }

  /** Subscribe to removal notifications; returns an unsubscribe function. */
  subscribeRemovals(fn: (id: string) => void): () => void {
    this.removalListeners.add(fn);
    return () => {
      this.removalListeners.delete(fn);
    };
  }

  /** Return the matching events (newest last). Applies `limit` if given. */
  query(filter?: ActivityFilter): ActivityEvent[] {
    let out = filter ? this.buffer.filter((e) => matchesFilter(e, filter)) : this.buffer.slice();
    if (filter?.limit && out.length > filter.limit) {
      out = out.slice(out.length - filter.limit);
    }
    return out;
  }

  /** Drop all events (optionally only those matching a filter). */
  clear(filter?: ActivityFilter): void {
    if (!filter) {
      this.buffer = [];
      return;
    }
    this.buffer = this.buffer.filter((e) => !matchesFilter(e, filter));
  }

  /** Listener / buffer counts for debugging and tests. */
  stats(): { events: number; listeners: number; retention: number } {
    return {
      events: this.buffer.length,
      listeners: this.listeners.size,
      retention: this.retention,
    };
  }
}

// Cast: process-wide singleton survives HMR by stashing on globalThis.
const GLOBAL_KEY = "__decops_activity_bus__";
type GlobalWithBus = typeof globalThis & { [GLOBAL_KEY]?: ActivityBus };
const g = globalThis as GlobalWithBus;
export const activityBus: ActivityBus = g[GLOBAL_KEY] ?? new ActivityBus();
g[GLOBAL_KEY] = activityBus;

export { SEVERITY_RANK };
