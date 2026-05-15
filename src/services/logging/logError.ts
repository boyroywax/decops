/**
 * logError — centralized error-logging utility.
 *
 * Replaces ad-hoc `console.error(...)` calls and silent `catch { /* … *\/ }`
 * blocks that should actually surface diagnostics. Routes every error
 * through the global `LogAggregator` so callers, sinks (file/IPFS/HTTP),
 * and the future telemetry pipeline all see consistent payloads.
 *
 * Design constraints:
 *   - Synchronous, never throws (a logger that throws is worse than no logger).
 *   - Accepts any thrown value (`unknown`) and normalises it.
 *   - Cheap on the happy path — no formatting work if no sinks/subscribers
 *     are interested (the aggregator handles that).
 *
 * Usage:
 *   import { logError } from "@/services/logging/logError";
 *
 *   try { … } catch (err) {
 *     logError("studio.draft.save", err, { draftId });
 *   }
 */

import { getLogAggregator } from "./aggregator";

export interface LogErrorOptions {
  /** Source toolkit / subsystem (defaults to first segment of context). */
  sourceKit?: string;
  /** Channel to publish on (defaults to "errors"). */
  channel?: string;
  /** Extra tags for filtering. */
  tags?: string[];
  /** Treat as warning rather than error. */
  warn?: boolean;
}

/** Normalise any thrown value into a `{ message, stack? }` pair. */
function normaliseError(err: unknown): { message: string; stack?: string; name?: string } {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack, name: err.name };
  }
  if (typeof err === "string") return { message: err };
  try {
    return { message: JSON.stringify(err) };
  } catch {
    return { message: String(err) };
  }
}

/**
 * Log an error with structured context. Never throws.
 *
 * @param context - dotted identifier of the call site, e.g. `"libp2p.service.start"`.
 * @param err - the thrown value (any type).
 * @param data - optional structured payload merged into the log entry.
 * @param opts - optional channel/source overrides.
 */
export function logError(
  context: string,
  err: unknown,
  data?: Record<string, unknown>,
  opts: LogErrorOptions = {}
): void {
  try {
    const { message, stack, name } = normaliseError(err);
    const sourceKit = opts.sourceKit ?? context.split(".")[0] ?? "unknown";
    getLogAggregator().log(opts.warn ? "warn" : "error", `[${context}] ${message}`, {
      sourceKit,
      channel: opts.channel ?? "errors",
      data: {
        context,
        errorName: name,
        stack,
        ...(data ?? {}),
      },
      tags: opts.tags,
    });
  } catch {
    // Logger must never throw. Last-ditch best-effort to surface the original.
    // eslint-disable-next-line no-console
    console.error(`[logError:${context}]`, err);
  }
}
