/**
 * Helia Service — multi-instance manager around Helia (in-browser IPFS) nodes.
 *
 * Each {@link HeliaNode} composes on top of a running libp2p instance owned
 * by the libp2p toolkit: when started without a libp2p binding, a fresh
 * libp2p node is spawned via `libp2pService.addNode(...)` and started
 * automatically. Heavy modules (`helia`, `@helia/unixfs`, …) are
 * dynamically imported on first `.start()` to keep the initial bundle slim.
 *
 * Live `Helia` instances live here (NOT in zustand or React state); the
 * React provider mirrors {@link HeliaManagerSnapshot} via `subscribe()`.
 */

import type { Libp2p } from "libp2p";
import { libp2pService } from "@/toolkits/libp2p/service";
import { logError } from "@/services/logging";
import type {
    HeliaStatus,
    HeliaSnapshot,
    HeliaContentEntry,
    HeliaStartOptions,
    HeliaManagerSnapshot,
} from "./types/helia";

type ManagerListener = (state: HeliaManagerSnapshot) => void;

// Minimal structural interfaces — we keep `any` at the boundary because the
// Helia types are heavy and dynamically imported.
/* eslint-disable @typescript-eslint/no-explicit-any */
interface HeliaLike {
    libp2p: Libp2p;
    blockstore: any;
    datastore?: any;
    pins?: any;
    gc?: () => Promise<void>;
    stop?: () => Promise<void>;
}

interface UnixfsLike {
    addBytes: (bytes: Uint8Array) => Promise<any>;
    cat: (cid: any) => AsyncIterable<Uint8Array>;
}

interface StringsLike {
    add: (text: string) => Promise<any>;
    get: (cid: any) => Promise<string>;
}

interface JsonLike {
    add: (value: unknown) => Promise<any>;
    get: (cid: any) => Promise<unknown>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const NODES_STORAGE_KEY = "decops:helia-nodes:v1";

interface PersistedNode {
    id: string;
    label: string;
    libp2pNodeId: string | null;
    entries: HeliaContentEntry[];
}

interface PersistedManager {
    activeId: string | null;
    nextSeq: number;
    nodes: PersistedNode[];
}

function loadPersistedManager(): PersistedManager | null {
    try {
        if (typeof localStorage === "undefined") return null;
        const raw = localStorage.getItem(NODES_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.nodes)) return null;
        return parsed as PersistedManager;
    } catch { return null; }
}

function savePersistedManager(state: PersistedManager): void {
    try {
        if (typeof localStorage === "undefined") return;
        localStorage.setItem(NODES_STORAGE_KEY, JSON.stringify(state));
    } catch { /* quota / private mode */ }
}

const PREVIEW_CHARS = 240;
const ENTRY_LIMIT = 200;

class HeliaNode {
    readonly id: string;
    label: string;
    /** Local libp2p node id to bind to (null = create a fresh libp2p on start). */
    libp2pNodeId: string | null;
    /** Cached content entries (also persisted). */
    entries: HeliaContentEntry[] = [];

    private status: HeliaStatus = "stopped";
    private error?: string;
    private startedAt?: string;
    private helia: HeliaLike | null = null;
    private fs: UnixfsLike | null = null;
    private strings: StringsLike | null = null;
    private json: JsonLike | null = null;
    private startPromise: Promise<void> | null = null;
    private onChange: () => void;

    constructor(id: string, label: string, libp2pNodeId: string | null, onChange: () => void) {
        this.id = id;
        this.label = label;
        this.libp2pNodeId = libp2pNodeId;
        this.onChange = onChange;
    }

    snapshot(): HeliaSnapshot {
        const libp2p = this.libp2pNodeId ? libp2pService.getLibp2pInstance(this.libp2pNodeId) : null;
        let peerId: string | null = null;
        try { peerId = libp2p ? libp2p.peerId.toString() : null; } catch { /* noop */ }
        let totalBytes = 0;
        let pinnedCount = 0;
        for (const e of this.entries) {
            if (typeof e.bytes === "number") totalBytes += e.bytes;
            if (e.pinned) pinnedCount += 1;
        }
        return {
            nodeId: this.id,
            label: this.label,
            status: this.status,
            error: this.error,
            startedAt: this.startedAt,
            libp2pNodeId: this.libp2pNodeId,
            peerId,
            entries: this.entries.slice(),
            pinnedCount,
            totalBytes,
        };
    }

    toPersisted(): PersistedNode {
        return {
            id: this.id,
            label: this.label,
            libp2pNodeId: this.libp2pNodeId,
            entries: this.entries.slice(0, ENTRY_LIMIT),
        };
    }

    setLabel(label: string): void {
        this.label = label;
        this.onChange();
    }

    /** Bind this Helia node to a specific libp2p node id. Must be stopped. */
    setLibp2pBinding(libp2pNodeId: string | null): void {
        if (this.status === "running" || this.status === "starting") {
            throw new Error("Stop the helia node before changing its libp2p binding");
        }
        this.libp2pNodeId = libp2pNodeId;
        this.onChange();
    }

    private setStatus(status: HeliaStatus, error?: string) {
        this.status = status;
        this.error = error;
        this.onChange();
    }

    /**
     * Start the Helia node. When `opts.libp2pNodeId` is given, bind to that
     * libp2p node (must exist; will be started if stopped). When omitted and
     * this node has no binding, a fresh libp2p node is created and started.
     */
    async start(opts: HeliaStartOptions = {}): Promise<void> {
        if (this.status === "running") return;
        if (this.startPromise) return this.startPromise;

        this.setStatus("starting");
        this.startPromise = (async () => {
            try {
                // ── 1) Resolve / acquire the libp2p instance ──────────────
                if (opts.libp2pNodeId) {
                    this.libp2pNodeId = opts.libp2pNodeId;
                }
                if (!this.libp2pNodeId) {
                    // Create a new libp2p node specifically for this helia.
                    const label = opts.newLibp2pLabel ?? `${this.label} (libp2p)`;
                    this.libp2pNodeId = libp2pService.addNode(label);
                }

                let libp2pNode;
                try {
                    libp2pNode = libp2pService.getNode(this.libp2pNodeId);
                } catch (err) {
                    throw new Error(
                        `libp2p node "${this.libp2pNodeId}" not found — pick another or leave the selection empty`,
                    );
                }

                if (!libp2pNode.isRunning()) {
                    await libp2pNode.start();
                }
                const libp2p = libp2pNode.getLibp2pInstance();
                if (!libp2p) {
                    throw new Error("Failed to obtain a running libp2p instance");
                }

                // ── 2) Dynamic import — keep the bundle slim ──────────────
                const [
                    { createHelia },
                    { unixfs },
                    { strings },
                    { json },
                ] = await Promise.all([
                    import("helia"),
                    import("@helia/unixfs"),
                    import("@helia/strings"),
                    import("@helia/json"),
                ]);

                // ── 3) Boot Helia using the existing libp2p instance ──────
                // Cast to `any` — helia's Libp2p generic is stricter than ours.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const helia = await createHelia({ libp2p: libp2p as any });
                this.helia = helia as unknown as HeliaLike;
                this.fs = unixfs(helia) as unknown as UnixfsLike;
                this.strings = strings(helia) as unknown as StringsLike;
                this.json = json(helia) as unknown as JsonLike;

                this.startedAt = new Date().toISOString();
                this.setStatus("running");
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                logError("helia.start", err, { nodeId: this.id });
                this.setStatus("error", msg);
                throw err;
            } finally {
                this.startPromise = null;
            }
        })();
        return this.startPromise;
    }

    async stop(): Promise<void> {
        if (this.status === "stopped" || !this.helia) {
            this.setStatus("stopped");
            return;
        }
        this.setStatus("stopping");
        try {
            await this.helia.stop?.();
        } catch (err) {
            logError("helia.stop", err, { nodeId: this.id }, { warn: true });
        }
        this.helia = null;
        this.fs = null;
        this.strings = null;
        this.json = null;
        this.startedAt = undefined;
        this.setStatus("stopped");
    }

    private requireRunning(): void {
        if (this.status !== "running" || !this.helia) {
            throw new Error(`Helia node "${this.label}" is not running`);
        }
    }

    /** Add raw bytes via unixfs. Returns the resulting CID. */
    async addBytes(bytes: Uint8Array, label?: string): Promise<HeliaContentEntry> {
        this.requireRunning();
        if (!this.fs) throw new Error("unixfs not initialised");
        const cid = await this.fs.addBytes(bytes);
        return this.recordEntry({
            cid: cid.toString(),
            codec: "raw",
            bytes: bytes.byteLength,
            label,
            preview: tryPreviewBytes(bytes),
            source: "added",
        });
    }

    /** Add a UTF-8 string via `@helia/strings`. */
    async addString(text: string, label?: string): Promise<HeliaContentEntry> {
        this.requireRunning();
        if (!this.strings) throw new Error("@helia/strings not initialised");
        const cid = await this.strings.add(text);
        return this.recordEntry({
            cid: cid.toString(),
            codec: "raw",
            bytes: new TextEncoder().encode(text).byteLength,
            label,
            preview: text.slice(0, PREVIEW_CHARS),
            source: "added",
        });
    }

    /** Add a JSON-serialisable value via `@helia/json` (dag-json). */
    async addJson(value: unknown, label?: string): Promise<HeliaContentEntry> {
        this.requireRunning();
        if (!this.json) throw new Error("@helia/json not initialised");
        const cid = await this.json.add(value);
        const serialised = (() => {
            try { return JSON.stringify(value); } catch { return ""; }
        })();
        return this.recordEntry({
            cid: cid.toString(),
            codec: "dag-json",
            bytes: serialised ? new TextEncoder().encode(serialised).byteLength : undefined,
            label,
            preview: serialised.slice(0, PREVIEW_CHARS),
            source: "added",
        });
    }

    /** Fetch a CID as a UTF-8 string. */
    async catString(cidStr: string): Promise<string> {
        this.requireRunning();
        if (!this.fs) throw new Error("unixfs not initialised");
        const { CID } = await import("multiformats/cid");
        const cid = CID.parse(cidStr);
        const chunks: Uint8Array[] = [];
        let total = 0;
        for await (const chunk of this.fs.cat(cid)) {
            chunks.push(chunk);
            total += chunk.byteLength;
        }
        const combined = new Uint8Array(total);
        let offset = 0;
        for (const c of chunks) { combined.set(c, offset); offset += c.byteLength; }
        const text = new TextDecoder().decode(combined);
        // Record as a fetched entry so it shows up in the entries list.
        this.recordEntry({
            cid: cidStr,
            codec: "raw",
            bytes: total,
            preview: text.slice(0, PREVIEW_CHARS),
            source: "fetched",
        });
        return text;
    }

    async pin(cidStr: string): Promise<void> {
        this.requireRunning();
        if (!this.helia || !this.helia.pins) throw new Error("pins API unavailable");
        const { CID } = await import("multiformats/cid");
        const cid = CID.parse(cidStr);
        // helia.pins.add is an async iterable — drain it.
        for await (const _ of this.helia.pins.add(cid)) { void _; }
        this.markPinned(cidStr, true);
    }

    async unpin(cidStr: string): Promise<void> {
        this.requireRunning();
        if (!this.helia || !this.helia.pins) throw new Error("pins API unavailable");
        const { CID } = await import("multiformats/cid");
        const cid = CID.parse(cidStr);
        for await (const _ of this.helia.pins.rm(cid)) { void _; }
        this.markPinned(cidStr, false);
    }

    listEntries(): HeliaContentEntry[] {
        return this.entries.slice();
    }

    clearEntries(): void {
        this.entries = [];
        this.onChange();
    }

    private recordEntry(partial: Omit<HeliaContentEntry, "addedAt" | "pinned">): HeliaContentEntry {
        const existing = this.entries.find((e) => e.cid === partial.cid);
        if (existing) {
            // Update preview/bytes/label if newly known.
            existing.label = partial.label ?? existing.label;
            existing.preview = partial.preview ?? existing.preview;
            existing.bytes = partial.bytes ?? existing.bytes;
            existing.codec = partial.codec ?? existing.codec;
            this.onChange();
            return existing;
        }
        const entry: HeliaContentEntry = {
            ...partial,
            addedAt: new Date().toISOString(),
            pinned: false,
        };
        this.entries.unshift(entry);
        if (this.entries.length > ENTRY_LIMIT) this.entries.length = ENTRY_LIMIT;
        this.onChange();
        return entry;
    }

    private markPinned(cidStr: string, pinned: boolean): void {
        const entry = this.entries.find((e) => e.cid === cidStr);
        if (entry) {
            entry.pinned = pinned;
        } else {
            this.entries.unshift({
                cid: cidStr,
                addedAt: new Date().toISOString(),
                pinned,
                source: "added",
            });
        }
        this.onChange();
    }
}

function tryPreviewBytes(bytes: Uint8Array): string | undefined {
    try {
        const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, PREVIEW_CHARS * 2));
        return text.slice(0, PREVIEW_CHARS);
    } catch { return undefined; }
}

class HeliaManager {
    private nodes = new Map<string, HeliaNode>();
    private order: string[] = [];
    private activeId: string | null = null;
    private listeners = new Set<ManagerListener>();
    private nextSeq = 1;

    constructor() {
        const persisted = loadPersistedManager();
        if (persisted && persisted.nodes.length > 0) {
            this.nextSeq = Math.max(persisted.nextSeq ?? 1, 1);
            for (const p of persisted.nodes) {
                const node = new HeliaNode(p.id, p.label, p.libp2pNodeId ?? null, () => this.emit());
                node.entries = Array.isArray(p.entries) ? p.entries.slice(0, ENTRY_LIMIT) : [];
                this.nodes.set(p.id, node);
                this.order.push(p.id);
            }
            this.activeId = persisted.activeId && this.nodes.has(persisted.activeId)
                ? persisted.activeId
                : (this.order[0] ?? null);
        } else {
            this.addNode("Helia 1");
        }

        // Re-emit when libp2p state changes (peer id, status) so consumers
        // see live updates without re-subscribing.
        libp2pService.subscribe(() => this.emit());
    }

    subscribe(fn: ManagerListener): () => void {
        this.listeners.add(fn);
        try { fn(this.snapshot()); } catch { /* noop */ }
        return () => { this.listeners.delete(fn); };
    }

    snapshot(): HeliaManagerSnapshot {
        return {
            activeId: this.activeId,
            nodes: this.order
                .map((id) => this.nodes.get(id))
                .filter((n): n is HeliaNode => !!n)
                .map((n) => n.snapshot()),
        };
    }

    private emit(): void {
        const snap = this.snapshot();
        for (const fn of this.listeners) {
            try { fn(snap); } catch { /* swallow */ }
        }
        void this.persist();
    }

    private async persist(): Promise<void> {
        try {
            const nodes: PersistedNode[] = this.order
                .map((id) => this.nodes.get(id))
                .filter((n): n is HeliaNode => !!n)
                .map((n) => n.toPersisted());
            savePersistedManager({
                activeId: this.activeId,
                nextSeq: this.nextSeq,
                nodes,
            });
        } catch (err) {
            logError("helia.manager.persist", err, undefined, { warn: true });
        }
    }

    /** Create a fresh helia node. Optionally pre-bind to a libp2p node. */
    addNode(label?: string, libp2pNodeId: string | null = null): string {
        const seq = this.nextSeq++;
        const id = `h-${seq}-${Math.random().toString(36).slice(2, 6)}`;
        const node = new HeliaNode(id, label ?? `Helia ${seq}`, libp2pNodeId, () => this.emit());
        this.nodes.set(id, node);
        this.order.push(id);
        this.activeId = id;
        this.emit();
        return id;
    }

    async removeNode(id: string): Promise<void> {
        const node = this.nodes.get(id);
        if (!node) return;
        try { await node.stop(); } catch (err) {
            logError("helia.manager.removeNode.stop", err, { nodeId: id }, { warn: true });
        }
        this.nodes.delete(id);
        this.order = this.order.filter((x) => x !== id);
        if (this.activeId === id) {
            this.activeId = this.order[this.order.length - 1] ?? null;
        }
        if (this.nodes.size === 0) this.addNode();
        else this.emit();
    }

    setActive(id: string): void {
        if (!this.nodes.has(id)) return;
        this.activeId = id;
        this.emit();
    }

    setLabel(id: string, label: string): void {
        this.nodes.get(id)?.setLabel(label);
    }

    setLibp2pBinding(id: string | undefined, libp2pNodeId: string | null): void {
        this.getNode(id).setLibp2pBinding(libp2pNodeId);
    }

    listIds(): string[] { return [...this.order]; }
    getActiveId(): string | null { return this.activeId; }
    getNode(id?: string | null): HeliaNode {
        const target = id ?? this.activeId;
        if (!target) throw new Error("No active helia node");
        const node = this.nodes.get(target);
        if (!node) throw new Error(`helia node "${target}" not found`);
        return node;
    }

    // Convenience proxies — default to the active node.
    start(opts?: HeliaStartOptions, id?: string) { return this.getNode(id).start(opts); }
    stop(id?: string) { return this.getNode(id).stop(); }
    addString(text: string, label?: string, id?: string) { return this.getNode(id).addString(text, label); }
    addBytes(bytes: Uint8Array, label?: string, id?: string) { return this.getNode(id).addBytes(bytes, label); }
    addJson(value: unknown, label?: string, id?: string) { return this.getNode(id).addJson(value, label); }
    catString(cid: string, id?: string) { return this.getNode(id).catString(cid); }
    pin(cid: string, id?: string) { return this.getNode(id).pin(cid); }
    unpin(cid: string, id?: string) { return this.getNode(id).unpin(cid); }
    listEntries(id?: string) { return this.getNode(id).listEntries(); }
    clearEntries(id?: string) { this.getNode(id).clearEntries(); }
}

/** Singleton manager — shared across the app. */
export const heliaService = new HeliaManager();
export type { HeliaManager, HeliaNode };
