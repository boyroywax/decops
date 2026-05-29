/**
 * React hook: subscribe to the activity bus with a filter, returning the
 * matching events in chronological order.
 *
 * The hook re-renders only when the bus produces events that match the
 * filter; listeners installed for other sources/severities won't cause
 * re-renders here.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { activityBus } from "./bus";
import type { ActivityEvent, ActivityFilter } from "./types";

/**
 * Subscribe to the activity bus with the given filter.
 *
 * @param filter Filter applied to both initial query and live subscription.
 *   Pass `undefined` / omit to get every event.
 * @returns The matching events in chronological order (oldest first).
 */
export function useActivityFeed(filter?: ActivityFilter): ActivityEvent[] {
  // Stable filter reference so the subscribe effect doesn't churn when the
  // caller passes an inline literal each render.
  const filterKey = JSON.stringify(filter ?? null);
  const stableFilter = useMemo(() => filter, [filterKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const [events, setEvents] = useState<ActivityEvent[]>(() => activityBus.query(stableFilter));
  const limitRef = useRef(filter?.limit ?? 0);
  limitRef.current = filter?.limit ?? 0;

  useEffect(() => {
    // Seed with a fresh query in case the filter changed.
    setEvents(activityBus.query(stableFilter));
    const disposePublish = activityBus.subscribe((evt) => {
      setEvents((prev) => {
        // Upsert by id: if an event with the same id is already in the
        // list, drop it and re-append so the envelope reflects its latest
        // state and floats to the newest position. Otherwise append.
        const existingIdx = prev.findIndex((e) => e.id === evt.id);
        const next = existingIdx !== -1
          ? [...prev.slice(0, existingIdx), ...prev.slice(existingIdx + 1), evt]
          : prev.concat(evt);
        const cap = limitRef.current;
        if (cap > 0 && next.length > cap) return next.slice(next.length - cap);
        return next;
      });
    }, stableFilter);
    // Removals are global (filter-agnostic on the bus side) — drop any
    // row whose id matches, regardless of whether the originating event
    // would have passed our filter at the time it was published.
    const disposeRemoval = activityBus.subscribeRemovals((id) => {
      setEvents((prev) => {
        const idx = prev.findIndex((e) => e.id === id);
        return idx === -1 ? prev : [...prev.slice(0, idx), ...prev.slice(idx + 1)];
      });
    });
    return () => {
      disposePublish();
      disposeRemoval();
    };
  }, [stableFilter]);

  return events;
}
