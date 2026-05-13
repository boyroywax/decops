/**
 * logAudit — record a security-relevant event.
 *
 * Distinct from {@link logError} in that audit events are **expected**
 * (a successful identity export, a credential reveal, an RBAC grant). They
 * still need a durable trail so operators can answer "who did what, when?".
 *
 * Events flow through the global {@link LogAggregator} on the `"audit"`
 * channel at level `"warn"` (chosen so audit sinks default-on but the
 * platform `info` console isn't spammed). Sinks (file / HTTP / IPFS) can
 * subscribe to the channel directly.
 *
 * Synchronous, never throws.
 *
 * Usage:
 *   import { logAudit } from "@/services/logging";
 *
 *   logAudit("libp2p.identity.export", {
 *     peerId, surface: "ui-copy", initiatedBy: "user",
 *   });
 */

import { getLogAggregator } from "./aggregator";

export interface LogAuditOptions {
  /** Source toolkit / subsystem (defaults to first segment of event). */
  sourceKit?: string;
  /** Override the channel (defaults to "audit"). */
  channel?: string;
  /** Extra tags for filtering. */
  tags?: string[];
}

/**
 * Record an audit event.
 *
 * @param event - dotted identifier, e.g. `"libp2p.identity.export"`.
 * @param data - structured payload (peer id, target, initiator, etc.).
 * @param opts - optional channel/source overrides.
 */
export function logAudit(
  event: string,
  data?: Record<string, unknown>,
  opts: LogAuditOptions = {}
): void {
  try {
    const sourceKit = opts.sourceKit ?? event.split(".")[0] ?? "unknown";
    getLogAggregator().log("warn", `[audit:${event}]`, {
      sourceKit,
      channel: opts.channel ?? "audit",
      data: {
        event,
        ...(data ?? {}),
      },
      tags: opts.tags ? ["audit", ...opts.tags] : ["audit"],
    });
  } catch {
    // Logger must never throw.
    // eslint-disable-next-line no-console
    console.error(`[logAudit:${event}]`, data);
  }
}
