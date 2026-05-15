/**
 * Modular logging backends (sinks).
 *
 * Each backend implements `LogBackend` — a minimal interface for writing
 * log entries to a specific destination.  The LogAggregator routes entries
 * to one or more backends based on the kit's `LogSinkConfig`.
 *
 * Supported backends:
 *   • ConsoleBackend  — browser / Node console (default)
 *   • FileBackend     — filesystem via configurable path & rotation
 *   • IPFSBackend     — content-addressable blobs on IPFS
 *   • IPLDBackend     — append-only DAG on IPFS using IPLD codecs
 *   • HTTPBackend     — forward batches to an HTTP endpoint
 *   • CustomBackend   — user-supplied handler
 *
 * All backends are designed to be tree-shakeable: if the platform doesn't
 * import a backend it won't be bundled.
 */

import type { ToolkitLogEntry, LogSinkConfig } from "@/services/toolkits/types";

// ═══════════════════════════════════════════════════
//  Backend interface
// ═══════════════════════════════════════════════════

export interface LogBackend {
  /** Human-readable backend name. */
  readonly name: string;
  /** Initialize the backend (open connections, create files, etc.). */
  init?(): Promise<void>;
  /** Write a single log entry. */
  write(entry: ToolkitLogEntry): void | Promise<void>;
  /** Write a batch of entries (default: serial `write` calls). */
  writeBatch?(entries: ToolkitLogEntry[]): Promise<void>;
  /** Flush any buffered data. */
  flush?(): Promise<void>;
  /**
   * Retrieve the root CID (IPFS/IPLD backends only).
   * Returns `undefined` for non-content-addressable backends.
   */
  getRootCid?(): string | undefined;
  /** Graceful shutdown — flush + close connections. */
  destroy?(): Promise<void>;
}

// ═══════════════════════════════════════════════════
//  Console Backend
// ═══════════════════════════════════════════════════

const LEVEL_COLORS: Record<string, string> = {
  trace: "color:#888",
  debug: "color:#6ee7b7",
  info: "color:#60a5fa",
  warn: "color:#fbbf24",
  error: "color:#f87171",
  fatal: "color:#ef4444;font-weight:bold",
};

export class ConsoleBackend implements LogBackend {
  readonly name = "console";
  private json: boolean;
  private color: boolean;

  constructor(config?: LogSinkConfig["console"]) {
    this.json = config?.json ?? false;
    this.color = config?.color ?? true;
  }

  write(entry: ToolkitLogEntry): void {
    if (this.json) {
      console.log(JSON.stringify(entry));
      return;
    }

    const style = this.color ? LEVEL_COLORS[entry.level] ?? "" : "";
    const prefix = `[${entry.level.toUpperCase().padEnd(5)}]`;
    const src = entry.sourceKit ? ` (${entry.sourceKit})` : "";
    const chan = entry.channel ? ` #${entry.channel}` : "";
    const msg = `${prefix}${src}${chan} ${entry.message}`;

    if (this.color && typeof console.log === "function") {
      console.log(`%c${msg}`, style, entry.data ?? "");
    } else {
      console.log(msg, entry.data ?? "");
    }
  }
}

// ═══════════════════════════════════════════════════
//  File Backend
// ═══════════════════════════════════════════════════

/**
 * File backend — writes structured log entries to the filesystem.
 *
 * In a browser context this falls back to `console.warn` with a notice.
 * Server-side (Node / Deno / Bun) it uses the `fs` module for writing.
 */
export class FileBackend implements LogBackend {
  readonly name = "file";
  private config: NonNullable<LogSinkConfig["file"]>;
  private buffer: string[] = [];

  constructor(config: NonNullable<LogSinkConfig["file"]>) {
    this.config = config;
  }

  write(entry: ToolkitLogEntry): void {
    const line =
      this.config.format === "json"
        ? JSON.stringify(entry)
        : this.config.format === "csv"
          ? [entry.timestamp, entry.level, entry.sourceKit ?? "", entry.channel ?? "", `"${entry.message}"`].join(",")
          : `${entry.timestamp} [${entry.level.toUpperCase()}] ${entry.sourceKit ?? "-"}/${entry.channel ?? "-"}: ${entry.message}`;

    this.buffer.push(line);

    // Auto-flush when buffer reaches a reasonable size
    if (this.buffer.length >= 100) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0);

    // Browser context — cannot write to filesystem
    if (typeof globalThis.window !== "undefined") {
      console.warn(`[FileBackend] ${batch.length} entries buffered for ${this.config.path} (filesystem not available in browser)`);
      return;
    }

    // Server-side — dynamically import fs
    try {
      // Dynamic import avoids bundler resolution in browser builds.
      const fs = await (Function('return import("node:fs")')()) as typeof import("node:fs");
      const data = batch.join("\n") + "\n";
      fs.appendFileSync(this.config.path, data, "utf-8");
    } catch {
      console.error(`[FileBackend] failed to write to ${this.config.path}`);
    }
  }

  async destroy(): Promise<void> {
    await this.flush();
  }
}

// ═══════════════════════════════════════════════════
//  IPFS Backend
// ═══════════════════════════════════════════════════

/**
 * IPFS backend — stores log entries as content-addressable blobs.
 *
 * Entries are batched and flushed as a single JSON blob to the IPFS API.
 * Each blob CID is recorded so downstream consumers can retrieve logs
 * from any IPFS gateway.
 */
export class IPFSBackend implements LogBackend {
  readonly name = "ipfs";
  private config: NonNullable<LogSinkConfig["ipfs"]>;
  private buffer: ToolkitLogEntry[] = [];
  private cids: string[] = [];
  private rootCid: string | undefined;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: NonNullable<LogSinkConfig["ipfs"]>) {
    this.config = config;
  }

  async init(): Promise<void> {
    const interval = this.config.flushInterval ?? 5_000;
    if (interval > 0) {
      this.flushTimer = setInterval(() => void this.flush(), interval);
    }
  }

  write(entry: ToolkitLogEntry): void {
    this.buffer.push(entry);
    const batchSize = this.config.batchSize ?? 50;
    if (this.buffer.length >= batchSize) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0);

    try {
      const blob = JSON.stringify({ entries: batch, timestamp: new Date().toISOString() });
      const res = await fetch(`${this.config.apiUrl}/api/v0/add`, {
        method: "POST",
        body: new Blob([blob], { type: "application/json" }),
      });

      if (res.ok) {
        const result = await res.json();
        const cid = result.Hash ?? result.cid ?? result.Cid;
        if (cid) {
          this.cids.push(cid);
          this.rootCid = cid;

          // Pin if configured
          if (this.config.pin) {
            await fetch(`${this.config.apiUrl}/api/v0/pin/add?arg=${cid}`, { method: "POST" }).catch(() => {});
          }

          // Annotate each entry with its CID
          for (const entry of batch) {
            entry.cid = cid;
          }
        }
      }
    } catch (err) {
      console.error("[IPFSBackend] flush failed:", err);
      // Re-queue entries on failure
      this.buffer.unshift(...batch);
    }
  }

  getRootCid(): string | undefined {
    return this.rootCid;
  }

  async destroy(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    await this.flush();
  }
}

// ═══════════════════════════════════════════════════
//  IPLD Backend
// ═══════════════════════════════════════════════════

/**
 * IPLD backend — builds an append-only DAG of log batches.
 *
 * Each flush creates a new DAG node containing:
 *   • `entries` — the log entries in this batch
 *   • `parent`  — CID link to the previous node (forming a chain)
 *   • `meta`    — timestamp, kit ID, batch number
 *
 * The DAG can be traversed from the latest root CID back to the genesis
 * node, giving a verifiable, content-addressable log history.
 */
export class IPLDBackend implements LogBackend {
  readonly name = "ipld";
  private config: NonNullable<LogSinkConfig["ipld"]>;
  private buffer: ToolkitLogEntry[] = [];
  private rootCid: string | undefined;
  private batchNumber = 0;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: NonNullable<LogSinkConfig["ipld"]>) {
    this.config = config;
  }

  async init(): Promise<void> {
    const interval = this.config.flushInterval ?? 5_000;
    if (interval > 0) {
      this.flushTimer = setInterval(() => void this.flush(), interval);
    }
  }

  write(entry: ToolkitLogEntry): void {
    // Link to the current root so entries know their parent
    if (this.rootCid) {
      entry.parentCid = this.rootCid;
    }
    this.buffer.push(entry);

    const capacity = this.config.batchSize ?? this.config.nodeCapacity ?? 100;
    if (this.buffer.length >= capacity) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0);
    this.batchNumber++;

    const codec = this.config.codec ?? "dag-cbor";
    const dagNode = {
      entries: batch,
      parent: this.rootCid ?? null,
      meta: {
        timestamp: new Date().toISOString(),
        batchNumber: this.batchNumber,
        codec,
        hashAlg: this.config.hashAlg ?? "sha2-256",
        entryCount: batch.length,
      },
    };

    try {
      // Use the IPFS dag/put endpoint for IPLD
      const endpoint = `${this.config.apiUrl}/api/v0/dag/put?format=${codec}&pin=${this.config.pin ?? false}`;
      const res = await fetch(endpoint, {
        method: "POST",
        body: new Blob([JSON.stringify(dagNode)], { type: "application/json" }),
      });

      if (res.ok) {
        const result = await res.json();
        const cid = result.Cid?.["/"] ?? result.Hash ?? result.cid;
        if (cid) {
          this.rootCid = cid;

          // Annotate entries
          for (const entry of batch) {
            entry.cid = cid;
            entry.parentCid = dagNode.parent ?? undefined;
          }
        }
      }
    } catch (err) {
      console.error("[IPLDBackend] flush failed:", err);
      this.buffer.unshift(...batch);
      this.batchNumber--;
    }
  }

  getRootCid(): string | undefined {
    return this.rootCid;
  }

  async destroy(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    await this.flush();
  }
}

// ═══════════════════════════════════════════════════
//  HTTP Backend
// ═══════════════════════════════════════════════════

/**
 * HTTP backend — forwards batched log entries to an HTTP endpoint.
 * Useful for centralized logging services (ELK, Loki, Datadog, etc.).
 */
export class HTTPBackend implements LogBackend {
  readonly name = "http";
  private config: NonNullable<LogSinkConfig["http"]>;
  private buffer: ToolkitLogEntry[] = [];

  constructor(config: NonNullable<LogSinkConfig["http"]>) {
    this.config = config;
  }

  write(entry: ToolkitLogEntry): void {
    this.buffer.push(entry);
    const batchSize = this.config.batchSize ?? 50;
    if (this.buffer.length >= batchSize) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0);

    try {
      await fetch(this.config.url, {
        method: this.config.method ?? "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.config.headers ?? {}),
        },
        body: JSON.stringify({ entries: batch }),
      });
    } catch (err) {
      console.error("[HTTPBackend] flush failed:", err);
      this.buffer.unshift(...batch);
    }
  }

  async destroy(): Promise<void> {
    await this.flush();
  }
}

// ═══════════════════════════════════════════════════
//  Factory
// ═══════════════════════════════════════════════════

/**
 * Create a `LogBackend` instance from a `LogSinkConfig`.
 * Throws if the config's `type` has no matching factory.
 */
export function createBackend(config: LogSinkConfig): LogBackend {
  switch (config.type) {
    case "console":
      return new ConsoleBackend(config.console);
    case "file":
      if (!config.file) throw new Error(`[LogBackend] "file" sink "${config.id}" requires a "file" config block`);
      return new FileBackend(config.file);
    case "ipfs":
      if (!config.ipfs) throw new Error(`[LogBackend] "ipfs" sink "${config.id}" requires an "ipfs" config block`);
      return new IPFSBackend(config.ipfs);
    case "ipld":
      if (!config.ipld) throw new Error(`[LogBackend] "ipld" sink "${config.id}" requires an "ipld" config block`);
      return new IPLDBackend(config.ipld);
    case "http":
      if (!config.http) throw new Error(`[LogBackend] "http" sink "${config.id}" requires an "http" config block`);
      return new HTTPBackend(config.http);
    case "syslog":
      // syslog is a planned extension — fall through to console
      console.warn(`[LogBackend] "syslog" not yet implemented — falling back to console`);
      return new ConsoleBackend();
    case "custom":
      // Custom backends must be supplied by the toolkit at runtime
      console.warn(`[LogBackend] "custom" sink "${config.id}" — using console fallback; supply a backend via the aggregator API`);
      return new ConsoleBackend();
    default:
      throw new Error(`[LogBackend] unknown backend type "${config.type}"`);
  }
}
