/**
 * Logging service — public API.
 *
 * Usage:
 *   import { logAggregator, LogAggregator } from "@/services/logging";
 *
 * The singleton `logAggregator` is the platform's central log bus.
 * Toolkits publish entries via `logAggregator.publish(entry)` or the
 * convenience `logAggregator.log(level, message, opts)`.
 */

export { LogAggregator, getLogAggregator, resetLogAggregator } from "./aggregator";
export type { LogSubscriber, LogQuery } from "./aggregator";

export { logError } from "./logError";
export type { LogErrorOptions } from "./logError";

export {
  type LogBackend,
  ConsoleBackend,
  FileBackend,
  IPFSBackend,
  IPLDBackend,
  HTTPBackend,
  createBackend,
} from "./backends";

import { getLogAggregator } from "./aggregator";

/** Convenience: the global LogAggregator instance. */
export const logAggregator = getLogAggregator();
