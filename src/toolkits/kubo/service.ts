/**
 * Kubo IPFS Connector Service — multi-instance manager around remote Kubo
 * daemons accessed via their HTTP RPC API.
 *
 * Each {@link KuboNode} owns one {@link KuboRPCClient} connection plus a
 * cached identity / activity log. Heavy modules (`kubo-rpc-client`) are
 * dynamically imported on first `.connect()` to keep the initial bundle
 * slim. Live client instances live here (NOT in zustand or React state);
 * the React provider mirrors {@link KuboManagerSnapshot} via `subscribe()`.
 */

import { logError } from "@/services/logging";
import type {
    KuboStatus,
    KuboSnapshot,
    KuboContentEntry,
    KuboPeerInfo,
    KuboConnectOptions,
    KuboManagerSnapshot,
} from "./types/kubo";

type ManagerListener = (state: KuboManagerSnapshot) => void;

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Structural shape we rely on from `kubo-rpc-client`. Keeping `any` at the
 * boundary because the real types are heavy and dynamically imported.
 */
interface KuboClientLike {
    id: (opts?: any) => Promise<any>;
    version: (opts?: any) => Promise<any>;
    add: (entry: any, opts?: any) => Promise<{ cid: any; size: number; path: string }>;
    cat: (path: any, opts?: any) => AsyncIterable<Uint8Array>;
    get: (path: any, opts?: any) => AsyncIterable<Uint8Array>;
    ls: (path: any, opts?: any) => AsyncIterable<any>;
    pin: {
        add: (cid: any, opts?: any) => Promise<any>;
        rm: (cid: any, opts?: any) => Promise<any>;
        ls: (opts?: any) => AsyncIterable<{ cid: any; type: string }>;
    };
    swarm: {
        peers: (opts?: any) => Promise<any[]>;
        connect: (addr: any, opts?: any) => Promise<void>;
        disconnect: (addr: any, opts?: any) => Promise<void>;
    };
    stop?: (opts?: any) => Promise<void>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const NODES_STORAGE_KEY = "decops:kubo-nodes:v1";
const PREVIEW_CHARS = 240;
const ENTRY_LIMIT = 200;
const DEFAULT_TIMEOUT_MS = 20_000;

interface PersistedNode {
    id: string;
    label: string;
    endpoint: string;
    authorization?: string;
    timeoutMs?: number;
    entries: KuboContentEntry[];
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

function tryPreviewBytes(bytes: Uint8Array): string | undefined {
    try {
        const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, PREVIEW_CHARS * 2));
        return text.slice(0, PREVIEW_CHARS);
    } catch { return undefined; }
}

/** Combine an external AbortSignal with an automatic timeout. */
function withTimeout(parent: AbortSignal | undefined, timeoutMs: number): AbortSignal {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
    ctrl.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
    if (parent) {
        if (parent.aborted) ctrl.abort(parent.reason);
        else parent.addEventListener("abort", () => ctrl.abort(parent.reason), { once: true });
    }
    return ctrl.signal;
}

class KuboNode {
    readonly id: string;
    label: string;
    endpoint: string;
    authorization?: string;
    timeoutMs: number;
    /** Cached content activity (also persisted). */
    entries: KuboContentEntry[] = [];

    private status: KuboStatus = "disconnected";
    private error?: string;
    private connectedAt?: string;
    private peer: KuboPeerInfo | null = null;
    private client: KuboClientLike | null = null;
    private connectPromise: Promise<void> | null = null;
    private onChange: () => void;

    constructor(
        id: string,
        label: string,
        endpoint: string,
        onChange: () => void,
        authorization?: string,
        timeoutMs?: number,
    ) {
        this.id = id;
        this.label = label;
        this.endpoint = endpoint;
        this.authorization = authorization;
        this.timeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.onChange = onChange;
    }

    snapshot(): KuboSnapshot {
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
            endpoint: this.endpoint,
            authorization: this.authorization,
            timeoutMs: this.timeoutMs,
            connectedAt: this.connectedAt,
            peer: this.peer,
            entries: this.entries.slice(),
            pinnedCount,
            totalBytes,
        };
    }

    toPersisted(): PersistedNode {
        return {
            id: this.id,
            label: this.label,
            endpoint: this.endpoint,
            authorization: this.authorization,
            timeoutMs: this.timeoutMs,
            entries: this.entries.slice(0, ENTRY_LIMIT),
        };
    }

    setLabel(label: string): void {
        this.label = label;
        this.onChange();
    }

    /** Update endpoint config. Must be disconnected. */
    setConfig(patch: { endpoint?: string; authorization?: string | null; timeoutMs?: number }): void {
        if (this.status === "connected" || this.status === "connecting") {
            throw new Error("Disconnect before changing endpoint configuration");
        }
        if (typeof patch.endpoint === "string" && patch.endpoint.trim()) {
            this.endpoint = patch.endpoint.trim();
        }
        if (patch.authorization !== undefined) {
            this.authorization = patch.authorization === null || patch.authorization === ""
                ? undefined
                : patch.authorization;
        }
        if (typeof patch.timeoutMs === "number" && patch.timeoutMs > 0) {
            this.timeoutMs = patch.timeoutMs;
        }
        this.onChange();
    }

    private setStatus(status: KuboStatus, error?: string) {
        this.status = status;
        this.error = error;
        this.onChange();
    }

    /**
     * Open a connection to the remote Kubo daemon. Resolves once the
     * `id()` handshake succeeds; surfaces the resolved peer identity on
     * the node snapshot.
     */
    async connect(opts: KuboConnectOptions = {}): Promise<void> {
        if (this.status === "connected") return;
        if (this.connectPromise) return this.connectPromise;

        if (opts.url !== undefined || opts.authorization !== undefined || opts.timeoutMs !== undefined) {
            this.setConfig({
                endpoint: opts.url,
                authorization: opts.authorization,
                timeoutMs: opts.timeoutMs,
            });
        }

        if (!this.endpoint || !/^https?:\/\//i.test(this.endpoint)) {
            const msg = "endpoint must be a valid http(s) URL";
            this.setStatus("error", msg);
            throw new Error(msg);
        }

        this.setStatus("connecting");
        this.connectPromise = (async () => {
            try {
                const mod = await import("kubo-rpc-client");
                /* eslint-disable @typescript-eslint/no-explicit-any */
                const create = (mod as any).create as (opts: any) => KuboClientLike;
                /* eslint-enable @typescript-eslint/no-explicit-any */
                if (typeof create !== "function") {
                    throw new Error("kubo-rpc-client.create is not a function");
                }

                const headers: Record<string, string> = {};
                if (this.authorization && this.authorization.trim()) {
                    headers.Authorization = this.authorization.trim();
                }

                this.client = create({
                    url: this.endpoint,
                    headers: Object.keys(headers).length > 0 ? headers : undefined,
                    timeout: this.timeoutMs,
                });

                // Handshake: id() proves the daemon is reachable and is a Kubo.
                const idResult = await this.client.id({
                    signal: withTimeout(undefined, this.timeoutMs),
                });
                this.peer = {
                    peerId: idResult.id?.toString?.() ?? String(idResult.id ?? ""),
                    publicKey: typeof idResult.publicKey === "string" ? idResult.publicKey : undefined,
                    agentVersion: typeof idResult.agentVersion === "string" ? idResult.agentVersion : undefined,
                    protocolVersion: typeof idResult.protocolVersion === "string" ? idResult.protocolVersion : undefined,
                    addresses: Array.isArray(idResult.addresses)
                        ? idResult.addresses.map((m: unknown) => (m && typeof (m as { toString: () => string }).toString === "function" ? (m as { toString: () => string }).toString() : String(m)))
                        : undefined,
                };

                // Best-effort peer count.
                try {
                    const peers = await this.client.swarm.peers({ signal: withTimeout(undefined, this.timeoutMs) });
                    if (this.peer) this.peer.connectedPeers = Array.isArray(peers) ? peers.length : undefined;
                } catch { /* non-fatal */ }

                this.connectedAt = new Date().toISOString();
                this.setStatus("connected");
            } catch (err) {
                const rawMsg = err instanceof Error ? err.message : String(err);
                // Browsers report opaque network failures (CORS preflight, DNS,
                // mixed-content, etc.) as "TypeError: Failed to fetch". When the
                // endpoint is cross-origin and HTTP(S), that almost always means
                // the remote daemon isn't sending the right Access-Control-*
                // headers for this origin. See docs/adr/0005-cors-proxy-removal.md
                // for the daemon-side `ipfs config` recipe.
                const isFailedToFetch =
                    err instanceof TypeError && /failed to fetch|network/i.test(rawMsg);
                let appOrigin = "";
                let endpointOrigin = this.endpoint;
                try {
                    if (typeof location !== "undefined") appOrigin = location.origin;
                    endpointOrigin = new URL(this.endpoint).origin;
                } catch { /* keep defaults */ }
                const sameOrigin = !!appOrigin && appOrigin === endpointOrigin;
                const looksLikeCors = isFailedToFetch && !sameOrigin && /^https?:\/\//i.test(this.endpoint);

                let msg: string;
                if (looksLikeCors) {
                    msg =
                        `CORS / network blocked the request to ${this.endpoint}. The remote Kubo daemon is not allowing origin ${appOrigin}. ` +
                        `On the daemon host run:  ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["*"]'  && ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["GET","POST","PUT","OPTIONS"]'  && ipfs config --json API.HTTPHeaders.Access-Control-Allow-Headers '["Authorization","Content-Type","X-Requested-With"]'  then restart the daemon. ` +
                        `Auth via API.Authorizations Bearer token still applies and is unaffected by CORS.`;
                } else {
                    msg = rawMsg;
                }

                logError("kubo.connect", err, {
                    nodeId: this.id,
                    endpoint: this.endpoint,
                    sameOrigin,
                    cors: looksLikeCors,
                });
                this.client = null;
                this.peer = null;
                this.setStatus("error", msg);
                throw new Error(msg);
            } finally {
                this.connectPromise = null;
            }
        })();
        return this.connectPromise;
    }

    /**
     * Drop the local client reference. We do NOT call `stop()` on the
     * remote daemon — that would shut down the whole IPFS node.
     */
    disconnect(): void {
        this.client = null;
        this.peer = null;
        this.connectedAt = undefined;
        this.setStatus("disconnected");
    }

    /** Re-issue the id() handshake against the remote daemon. */
    async refresh(): Promise<KuboPeerInfo | null> {
        const client = this.requireConnected();
        const idResult = await client.id({ signal: withTimeout(undefined, this.timeoutMs) });
        this.peer = {
            peerId: idResult.id?.toString?.() ?? String(idResult.id ?? ""),
            publicKey: typeof idResult.publicKey === "string" ? idResult.publicKey : undefined,
            agentVersion: typeof idResult.agentVersion === "string" ? idResult.agentVersion : undefined,
            protocolVersion: typeof idResult.protocolVersion === "string" ? idResult.protocolVersion : undefined,
            addresses: Array.isArray(idResult.addresses)
                ? idResult.addresses.map((m: unknown) => (m && typeof (m as { toString: () => string }).toString === "function" ? (m as { toString: () => string }).toString() : String(m)))
                : undefined,
        };
        try {
            const peers = await client.swarm.peers({ signal: withTimeout(undefined, this.timeoutMs) });
            if (this.peer) this.peer.connectedPeers = Array.isArray(peers) ? peers.length : undefined;
        } catch { /* non-fatal */ }
        this.onChange();
        return this.peer;
    }

    private requireConnected(): KuboClientLike {
        if (this.status !== "connected" || !this.client) {
            throw new Error(`Kubo node "${this.label}" is not connected`);
        }
        return this.client;
    }

    /** Get remote daemon version. */
    async version(): Promise<{ version: string; commit?: string; repo?: string }> {
        const client = this.requireConnected();
        const v = await client.version({ signal: withTimeout(undefined, this.timeoutMs) });
        return {
            version: typeof v?.version === "string" ? v.version : String(v?.version ?? ""),
            commit: typeof v?.commit === "string" ? v.commit : undefined,
            repo: typeof v?.repo === "string" ? v.repo : undefined,
        };
    }

    // ── Content ──

    /** Add raw bytes via the remote daemon (returns the CID it computed). */
    async addBytes(bytes: Uint8Array, label?: string, pin = true): Promise<KuboContentEntry> {
        const client = this.requireConnected();
        const result = await client.add(
            { path: label ?? "blob", content: bytes },
            { pin, signal: withTimeout(undefined, this.timeoutMs) },
        );
        const cid = result.cid?.toString?.() ?? String(result.cid);
        return this.recordEntry({
            cid,
            label,
            bytes: typeof result.size === "number" ? result.size : bytes.byteLength,
            preview: tryPreviewBytes(bytes),
            pinned: pin,
            source: "added",
        });
    }

    /** Add a UTF-8 string. */
    async addString(text: string, label?: string, pin = true): Promise<KuboContentEntry> {
        const client = this.requireConnected();
        const result = await client.add(
            { path: label ?? "string", content: text },
            { pin, signal: withTimeout(undefined, this.timeoutMs) },
        );
        const cid = result.cid?.toString?.() ?? String(result.cid);
        return this.recordEntry({
            cid,
            label,
            bytes: typeof result.size === "number" ? result.size : new TextEncoder().encode(text).byteLength,
            preview: text.slice(0, PREVIEW_CHARS),
            pinned: pin,
            source: "added",
        });
    }

    /** Add a JSON-serialisable value (encoded as UTF-8). */
    async addJson(value: unknown, label?: string, pin = true): Promise<KuboContentEntry> {
        const serialised = JSON.stringify(value);
        const entry = await this.addString(serialised, label ?? "data.json", pin);
        return entry;
    }

    /** Fetch a CID as raw bytes. */
    async catBytes(cidOrPath: string, options: { signal?: AbortSignal; offset?: number; length?: number } = {}): Promise<Uint8Array> {
        const client = this.requireConnected();
        const signal = withTimeout(options.signal, this.timeoutMs);
        const chunks: Uint8Array[] = [];
        let total = 0;
        try {
            for await (const chunk of client.cat(cidOrPath, {
                signal,
                ...(typeof options.offset === "number" ? { offset: options.offset } : {}),
                ...(typeof options.length === "number" ? { length: options.length } : {}),
            })) {
                chunks.push(chunk);
                total += chunk.byteLength;
            }
        } catch (err) {
            if (signal.aborted) {
                throw new Error(`cat ${cidOrPath.slice(0, 16)}\u2026 timed out — block not available on remote node`);
            }
            throw err;
        }
        const combined = new Uint8Array(total);
        let offset = 0;
        for (const c of chunks) { combined.set(c, offset); offset += c.byteLength; }
        this.recordEntry({
            cid: cidOrPath,
            bytes: total,
            preview: tryPreviewBytes(combined),
            pinned: this.entries.find((e) => e.cid === cidOrPath)?.pinned ?? false,
            source: "fetched",
        });
        return combined;
    }

    /** Fetch a CID as a UTF-8 string. */
    async catString(cidOrPath: string): Promise<string> {
        const combined = await this.catBytes(cidOrPath);
        const text = new TextDecoder().decode(combined);
        const entry = this.entries.find((e) => e.cid === cidOrPath);
        if (entry) {
            entry.preview = text.slice(0, PREVIEW_CHARS);
            this.onChange();
        }
        return text;
    }

    /** Directory / file listing — async iterator from kubo. */
    async ls(cidOrPath: string): Promise<Array<{ cid: string; name: string; size: number; type: "file" | "dir" }>> {
        const client = this.requireConnected();
        const signal = withTimeout(undefined, this.timeoutMs);
        const out: Array<{ cid: string; name: string; size: number; type: "file" | "dir" }> = [];
        try {
            for await (const entry of client.ls(cidOrPath, { signal })) {
                out.push({
                    cid: entry.cid?.toString?.() ?? String(entry.cid ?? ""),
                    name: String(entry.name ?? ""),
                    size: Number(entry.size ?? 0),
                    type: entry.type === "dir" ? "dir" : "file",
                });
            }
        } catch (err) {
            if (signal.aborted) {
                throw new Error(`ls ${cidOrPath.slice(0, 16)}\u2026 timed out`);
            }
            throw err;
        }
        return out;
    }

    // ── Pinning ──

    async pin(cidStr: string, opts: { recursive?: boolean; name?: string } = {}): Promise<void> {
        const client = this.requireConnected();
        const { CID } = await import("multiformats/cid");
        const cid = CID.parse(cidStr);
        await client.pin.add(cid, {
            recursive: opts.recursive ?? true,
            name: opts.name,
            signal: withTimeout(undefined, this.timeoutMs),
        });
        this.markPinned(cidStr, true);
    }

    async unpin(cidStr: string, opts: { recursive?: boolean } = {}): Promise<void> {
        const client = this.requireConnected();
        const { CID } = await import("multiformats/cid");
        const cid = CID.parse(cidStr);
        await client.pin.rm(cid, {
            recursive: opts.recursive ?? true,
            signal: withTimeout(undefined, this.timeoutMs),
        });
        this.markPinned(cidStr, false);
    }

    /** List pinned CIDs (drains the iterator into an array). */
    async listPins(filter?: "recursive" | "direct" | "indirect" | "all"): Promise<Array<{ cid: string; type: string }>> {
        const client = this.requireConnected();
        const signal = withTimeout(undefined, this.timeoutMs);
        const out: Array<{ cid: string; type: string }> = [];
        for await (const entry of client.pin.ls({
            ...(filter ? { type: filter } : {}),
            signal,
        })) {
            out.push({
                cid: entry.cid?.toString?.() ?? String(entry.cid ?? ""),
                type: String(entry.type ?? "recursive"),
            });
        }
        // Reconcile our local entries' `pinned` flag where possible.
        const pinnedSet = new Set(out.map((p) => p.cid));
        let mutated = false;
        for (const e of this.entries) {
            const nowPinned = pinnedSet.has(e.cid);
            if (e.pinned !== nowPinned) {
                e.pinned = nowPinned;
                mutated = true;
            }
        }
        if (mutated) this.onChange();
        return out;
    }

    // ── Swarm ──

    async listPeers(): Promise<Array<{ peer: string; addr: string }>> {
        const client = this.requireConnected();
        const peers = await client.swarm.peers({ signal: withTimeout(undefined, this.timeoutMs) });
        return peers.map((p: { peer?: { toString: () => string }; addr?: { toString: () => string } }) => ({
            peer: p.peer?.toString?.() ?? "",
            addr: p.addr?.toString?.() ?? "",
        }));
    }

    async swarmConnect(multiaddr: string): Promise<void> {
        const client = this.requireConnected();
        const { multiaddr: makeAddr } = await import("@multiformats/multiaddr");
        await client.swarm.connect(makeAddr(multiaddr), { signal: withTimeout(undefined, this.timeoutMs) });
    }

    // ── Activity bookkeeping ──

    listEntries(): KuboContentEntry[] {
        return this.entries.slice();
    }

    clearEntries(): void {
        this.entries = [];
        this.onChange();
    }

    private recordEntry(partial: Omit<KuboContentEntry, "addedAt"> & { addedAt?: string }): KuboContentEntry {
        const existing = this.entries.find((e) => e.cid === partial.cid);
        if (existing) {
            existing.label = partial.label ?? existing.label;
            existing.preview = partial.preview ?? existing.preview;
            existing.bytes = partial.bytes ?? existing.bytes;
            existing.pinned = partial.pinned ?? existing.pinned;
            existing.source = partial.source ?? existing.source;
            existing.addedAt = new Date().toISOString();
            this.onChange();
            return existing;
        }
        const entry: KuboContentEntry = {
            ...partial,
            addedAt: partial.addedAt ?? new Date().toISOString(),
        } as KuboContentEntry;
        this.entries.unshift(entry);
        if (this.entries.length > ENTRY_LIMIT) this.entries.length = ENTRY_LIMIT;
        this.onChange();
        return entry;
    }

    private markPinned(cidStr: string, pinned: boolean): void {
        const entry = this.entries.find((e) => e.cid === cidStr);
        if (entry) {
            entry.pinned = pinned;
            entry.addedAt = new Date().toISOString();
        } else {
            this.entries.unshift({
                cid: cidStr,
                pinned,
                source: "added",
                addedAt: new Date().toISOString(),
            });
        }
        this.onChange();
    }
}

class KuboManager {
    private nodes = new Map<string, KuboNode>();
    private order: string[] = [];
    private activeId: string | null = null;
    private listeners = new Set<ManagerListener>();
    private nextSeq = 1;

    constructor() {
        const persisted = loadPersistedManager();
        if (persisted && persisted.nodes.length > 0) {
            this.nextSeq = Math.max(persisted.nextSeq ?? 1, 1);
            for (const p of persisted.nodes) {
                const node = new KuboNode(p.id, p.label, p.endpoint, () => this.emit(), p.authorization, p.timeoutMs);
                node.entries = Array.isArray(p.entries) ? p.entries.slice(0, ENTRY_LIMIT) : [];
                this.nodes.set(p.id, node);
                this.order.push(p.id);
            }
            this.activeId = persisted.activeId && this.nodes.has(persisted.activeId)
                ? persisted.activeId
                : (this.order[0] ?? null);
        } else {
            this.addNode("Local Kubo", "http://127.0.0.1:5001");
        }
    }

    subscribe(fn: ManagerListener): () => void {
        this.listeners.add(fn);
        try { fn(this.snapshot()); } catch { /* noop */ }
        return () => { this.listeners.delete(fn); };
    }

    snapshot(): KuboManagerSnapshot {
        return {
            activeId: this.activeId,
            nodes: this.order
                .map((id) => this.nodes.get(id))
                .filter((n): n is KuboNode => !!n)
                .map((n) => n.snapshot()),
        };
    }

    private emit(): void {
        const snap = this.snapshot();
        for (const fn of this.listeners) {
            try { fn(snap); } catch { /* swallow */ }
        }
        this.persist();
    }

    private persist(): void {
        try {
            const nodes: PersistedNode[] = this.order
                .map((id) => this.nodes.get(id))
                .filter((n): n is KuboNode => !!n)
                .map((n) => n.toPersisted());
            savePersistedManager({
                activeId: this.activeId,
                nextSeq: this.nextSeq,
                nodes,
            });
        } catch (err) {
            logError("kubo.manager.persist", err, undefined, { warn: true });
        }
    }

    /** Create a new (disconnected) node. */
    addNode(label?: string, endpoint = "http://127.0.0.1:5001"): string {
        const seq = this.nextSeq++;
        const id = `k-${seq}-${Math.random().toString(36).slice(2, 6)}`;
        const node = new KuboNode(id, label ?? `Kubo ${seq}`, endpoint, () => this.emit());
        this.nodes.set(id, node);
        this.order.push(id);
        this.activeId = id;
        this.emit();
        return id;
    }

    async removeNode(id: string): Promise<void> {
        const node = this.nodes.get(id);
        if (!node) return;
        try { node.disconnect(); } catch { /* noop */ }
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

    setConfig(id: string | undefined, patch: { endpoint?: string; authorization?: string | null; timeoutMs?: number }): void {
        this.getNode(id).setConfig(patch);
    }

    listIds(): string[] { return [...this.order]; }
    getActiveId(): string | null { return this.activeId; }
    getNode(id?: string | null): KuboNode {
        const target = id ?? this.activeId;
        if (!target) throw new Error("No active Kubo node");
        const node = this.nodes.get(target);
        if (!node) throw new Error(`Kubo node "${target}" not found`);
        return node;
    }

    // Convenience proxies — default to the active node.
    connect(opts?: KuboConnectOptions, id?: string) { return this.getNode(id).connect(opts); }
    disconnect(id?: string) { return this.getNode(id).disconnect(); }
    refresh(id?: string) { return this.getNode(id).refresh(); }
    version(id?: string) { return this.getNode(id).version(); }
    addString(text: string, label?: string, pin?: boolean, id?: string) {
        return this.getNode(id).addString(text, label, pin);
    }
    addJson(value: unknown, label?: string, pin?: boolean, id?: string) {
        return this.getNode(id).addJson(value, label, pin);
    }
    addBytes(bytes: Uint8Array, label?: string, pin?: boolean, id?: string) {
        return this.getNode(id).addBytes(bytes, label, pin);
    }
    catString(cidOrPath: string, id?: string) { return this.getNode(id).catString(cidOrPath); }
    catBytes(cidOrPath: string, id?: string) { return this.getNode(id).catBytes(cidOrPath); }
    ls(cidOrPath: string, id?: string) { return this.getNode(id).ls(cidOrPath); }
    pin(cid: string, opts?: { recursive?: boolean; name?: string }, id?: string) { return this.getNode(id).pin(cid, opts); }
    unpin(cid: string, opts?: { recursive?: boolean }, id?: string) { return this.getNode(id).unpin(cid, opts); }
    listPins(filter?: "recursive" | "direct" | "indirect" | "all", id?: string) { return this.getNode(id).listPins(filter); }
    listPeers(id?: string) { return this.getNode(id).listPeers(); }
    swarmConnect(addr: string, id?: string) { return this.getNode(id).swarmConnect(addr); }
    listEntries(id?: string) { return this.getNode(id).listEntries(); }
    clearEntries(id?: string) { this.getNode(id).clearEntries(); }
}

/** Singleton manager — shared across the app. */
export const kuboService = new KuboManager();
export type { KuboManager, KuboNode };
