/**
 * useToolkitLogger — toolkit-scoped activity emitter.
 *
 * Returns an `addLog(msg, level)` function that publishes to the activity
 * bus tagged with the given source. Used to replace each toolkit's
 * ad-hoc local `LogEntry[]` array — the bus is now the single source of
 * truth and the per-toolkit ActivityPanel reads it back via
 * `<ActivityFeed baseFilter={{ sources: [source] }} />`.
 */
import { useCallback } from "react";
import { activityBus } from "./bus";
import type { ActivitySource, ActivitySeverity } from "./types";

export type ToolkitLogLevel = "info" | "warn" | "error";

const LEVEL_TO_SEVERITY: Record<ToolkitLogLevel, ActivitySeverity> = {
  info: "info",
  warn: "warn",
  error: "error",
};

export interface ToolkitLogger {
  /**
   * Publish a message on the activity bus for this toolkit.
   *
   * @param msg     Human-readable title (becomes the row's primary text).
   * @param level   "info" (default), "warn", or "error".
   * @param extra   Optional channel / tags / data overrides.
   */
  addLog: (
    msg: string,
    level?: ToolkitLogLevel,
    extra?: { channel?: string; tags?: string[]; data?: unknown },
  ) => void;
}

export function useToolkitLogger(
  source: ActivitySource,
  defaultChannel: string = "ui",
): ToolkitLogger {
  const addLog = useCallback<ToolkitLogger["addLog"]>((msg, level = "info", extra) => {
    activityBus.publish({
      source,
      channel: extra?.channel ?? defaultChannel,
      kind: "event",
      severity: LEVEL_TO_SEVERITY[level],
      title: msg,
      tags: extra?.tags,
      data: extra?.data,
    });
  }, [source, defaultChannel]);

  return { addLog };
}
