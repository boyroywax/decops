/**
 * OrbitDB Server Connector Service — multi-instance manager around remote
 * `orbitdb-server` deployments accessed via their HTTP RPC API
 * (OrbitDB v2, Kubo-aligned `POST /api/v0/*` endpoints).
 *
 * Each {@link OrbitdbServerNode} owns one endpoint configuration plus a
 * cached identity + local database registry. The HTTP layer is plain
 * `fetch` (no extra deps). Live state lives here (not in zustand); the
 * React provider mirrors {@link OrbitdbServerManagerSnapshot} via
 * `subscribe()`.
 */

import { logError } from "@/services/logging";
import type {
    OrbitdbServerStatus,
    OrbitdbServerSnapshot,
    OrbitdbServerPeerInfo,
    OrbitdbServerConnectOptions,
    OrbitdbServerManagerSnapshot,
    OrbitdbServerDatabaseEntry,
    OrbitdbServerStoreType,
    OrbitdbServerWriteResult,
} from "./types/orbitdbServer";

type ManagerListener = (state: OrbitdbServerManagerSnapshot) => void;

const NODES_STORAGE_KEY = "decops:orbitdb-server-nodes:v1";
const ENTRY_LIMIT = 200;
const DEFAULT_TIMEOUT_MS = 20_000;
const PREVIEW_LIMIT = 25;

interface PersistedNode {
    id: string;
    label: string;
    endpoint: string;
    authorization?: string;
    timeoutMs?: number;
    databases: OrbitdbServerDatabaseEntry[];
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

/** Combine an external AbortSignal with an automatic timeout. */
function withTimeout(parent: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; cancel: () => void } {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
    const cancel = () => clearTimeout(timer);
    ctrl.signal.addEventListener("abort", cancel, { once: true });
    if (parent) {
        if (parent.aborted) ctrl.abort(parent.reason);
        else parent.addEventListener("abort", () => ctrl.abort(parent.reason), { once: true });
    }
    return { signal: ctrl.signal, cancel };
}

function trimTrailingSlash(s: string): string {
    return s.replace(/\/+$/, "");
}

function joinQuery(params: Record<string, string | number | boolean | undefined>): string {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null || v === "") continue;
        parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
    return parts.length === 0 ? "" : `?${parts.join("&")}`;
}

class OrbitdbServerNode {
    readonly id: string;
    label: string;
    endpoint: string;
    authorization?: string;
    timeoutMs: number;
    /** Local database registry — persisted across reloads. */
    databases: OrbitdbServerDatabaseEntry[] = [];
    /** Most recent swarm peers (volatile — not persisted). */
    swarmPeers: Array<{ peerId: string; addr: string }> = [];

    private status: OrbitdbServerStatus = "disconnected";
    private error?: string;
    private connectedAt?: string;
    private peer: OrbitdbServerPeerInfo | null = null;
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

    snapshot(): OrbitdbServerSnapshot {
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
            databases: this.databases.slice(),
            swarmPeers: this.swarmPeers.slice(),
        };
    }

    toPersisted(): PersistedNode {
        return {
            id: this.id,
            label: this.label,
            endpoint: this.endpoint,
            authorization: this.authorization,
            timeoutMs: this.timeoutMs,
            databases: this.databases.slice(0, ENTRY_LIMIT),
        };
    }

    setLabel(label: string): void {
        this.label = label;
        this.onChange();
    }

    setConfig(patch: { endpoint?: string; authorization?: string | null; timeoutMs?: number }): void {
        if (this.status === "connected" || this.status === "connecting") {
            throw new Error("Disconnect before changing endpoint configuration");
        }
        if (typeof patch.endpoint === "string" && patch.endpoint.trim()) {
            this.endpoint = trimTrailingSlash(patch.endpoint.trim());
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

    private setStatus(status: OrbitdbServerStatus, error?: string) {
        this.status = status;
        this.error = error;
        this.onChange();
    }

    /** Build full URL for an `/api/v0/...` path. */
    private apiUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
        const base = trimTrailingSlash(this.endpoint);
        const p = path.startsWith("/") ? path : `/${path}`;
        const prefixed = p.startsWith("/api/") ? p : `/api/v0${p}`;
        return `${base}${prefixed}${params ? joinQuery(params) : ""}`;
    }

    private buildHeaders(extra?: Record<string, string>): Headers {
        const h = new Headers(extra ?? {});
        if (this.authorization && this.authorization.trim()) {
            h.set("Authorization", this.authorization.trim());
        }
        return h;
    }

    /**
     * Low-level request helper. All orbitdb-server endpoints are POST.
     * Returns parsed JSON, or `null` for 204 / empty responses.
     */
    private async request<T = unknown>(
        path: string,
        opts: {
            params?: Record<string, string | number | boolean | undefined>;
            body?: unknown;
            method?: "POST" | "GET";
            allowMissingAuth?: boolean;
            parentSignal?: AbortSignal;
        } = {},
    ): Promise<T> {
        const { signal, cancel } = withTimeout(opts.parentSignal, this.timeoutMs);
        const method = opts.method ?? "POST";
        let body: BodyInit | undefined;
        const headers = this.buildHeaders();
        if (opts.body !== undefined && opts.body !== null) {
            if (opts.body instanceof Uint8Array || opts.body instanceof ArrayBuffer) {
                body = opts.body as BodyInit;
                if (!headers.has("Content-Type")) {
                    headers.set("Content-Type", "application/octet-stream");
                }
            } else if (typeof opts.body === "string") {
                body = opts.body;
                if (!headers.has("Content-Type")) {
                    headers.set("Content-Type", "application/json");
                }
            } else {
                body = JSON.stringify(opts.body);
                headers.set("Content-Type", "application/json");
            }
        }

        if (!opts.allowMissingAuth && !this.authorization) {
            // Not strictly required by the server for /health, but the rest
            // of the API will 401 — surface a clearer error than fetch will.
            // We still attempt the request so health probes work.
        }

        let response: Response;
        try {
            response = await fetch(this.apiUrl(path, opts.params), {
                method,
                headers,
                body,
                signal,
                credentials: "omit",
                mode: "cors",
            });
        } catch (err) {
            cancel();
            throw this.classifyNetworkError(err, path);
        }

        cancel();

        if (!response.ok) {
            const txt = await response.text().catch(() => "");
            let detail = txt;
            try {
                const parsed = JSON.parse(txt);
                if (parsed && typeof parsed === "object" && parsed.error) {
                    detail = String(parsed.error);
                } else if (typeof parsed === "string") {
                    detail = parsed;
                }
            } catch { /* not json */ }
            const err = new Error(
                `orbitdb-server ${method} ${path} → ${response.status} ${response.statusText}${detail ? `: ${detail.slice(0, 240)}` : ""}`,
            );
            (err as unknown as { status: number }).status = response.status;
            throw err;
        }

        if (response.status === 204) return null as T;
        const text = await response.text();
        if (!text) return null as T;
        try {
            return JSON.parse(text) as T;
        } catch {
            return text as unknown as T;
        }
    }

    private classifyNetworkError(err: unknown, path: string): Error {
        const rawMsg = err instanceof Error ? err.message : String(err);
        // See docs/adr/0005-cors-proxy-removal.md — the previous PROXY-DOWN
        // branch was removed along with the /orbitdb-server-proxy route.
        const isFailedToFetch = err instanceof TypeError && /failed to fetch|network/i.test(rawMsg);
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
                `CORS / network blocked the request to ${this.endpoint}${path}. ` +
                `The remote orbitdb-server is not allowing origin ${appOrigin}. ` +
                `Configure CORS on the server (Access-Control-Allow-Origin / -Methods / -Headers including Authorization) and restart it. ` +
                `Bearer-token auth is independent of CORS and still required.`;
        } else {
            msg = rawMsg;
        }
        return new Error(msg);
    }

    /**
     * Open a connection to the remote server. Handshakes via `/health` then
     * `/id`, populating the peer block on success.
     */
    async connect(opts: OrbitdbServerConnectOptions = {}): Promise<void> {
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
                // Health probe first — does not require auth.
                await this.request("/health", { allowMissingAuth: true });
                // Identity — proves auth works and gives us the peer / DID.
                const idResult = await this.request<Record<string, unknown>>("/id");
                this.peer = this.parsePeer(idResult);

                // Try to list open databases so the registry is correct.
                try {
                    const listed = await this.request<Record<string, unknown>>("/db/list");
                    this.reconcileDatabaseList(listed);
                } catch { /* non-fatal — list endpoint may not be ACL'd for this token */ }

                this.connectedAt = new Date().toISOString();
                this.setStatus("connected");
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                logError("orbitdbServer.connect", err, { nodeId: this.id, endpoint: this.endpoint });
                this.peer = null;
                this.setStatus("error", msg);
                throw err instanceof Error ? err : new Error(msg);
            } finally {
                this.connectPromise = null;
            }
        })();
        return this.connectPromise;
    }

    disconnect(): void {
        this.peer = null;
        this.connectedAt = undefined;
        this.setStatus("disconnected");
    }

    async refresh(): Promise<OrbitdbServerPeerInfo | null> {
        this.requireConnected();
        const idResult = await this.request<Record<string, unknown>>("/id");
        this.peer = this.parsePeer(idResult);
        this.onChange();
        return this.peer;
    }

    private requireConnected(): void {
        if (this.status !== "connected") {
            throw new Error(`orbitdb-server "${this.label}" is not connected`);
        }
    }

    private parsePeer(idResult: Record<string, unknown>): OrbitdbServerPeerInfo {
        const peerId =
            typeof idResult.peerId === "string" ? idResult.peerId :
            typeof idResult.id === "string" ? idResult.id :
            (idResult.id && typeof (idResult.id as { toString: () => string }).toString === "function"
                ? (idResult.id as { toString: () => string }).toString()
                : "");
        const did = typeof idResult.did === "string" ? idResult.did : undefined;
        const addresses = Array.isArray(idResult.addresses)
            ? (idResult.addresses as unknown[]).map((m) =>
                m && typeof (m as { toString: () => string }).toString === "function"
                    ? (m as { toString: () => string }).toString()
                    : String(m))
            : undefined;
        const pnetBlock = idResult.pnet as { mode?: unknown; fingerprint?: unknown } | undefined;
        const pnetMode =
            pnetBlock && (pnetBlock.mode === "private" || pnetBlock.mode === "public")
                ? pnetBlock.mode
                : undefined;
        const pnetFingerprint = pnetBlock && typeof pnetBlock.fingerprint === "string"
            ? pnetBlock.fingerprint
            : undefined;
        const serverVersion = typeof idResult.version === "string" ? idResult.version : undefined;
        return {
            peerId,
            did,
            addresses,
            pnetMode,
            pnetFingerprint,
            serverVersion,
        };
    }

    private reconcileDatabaseList(result: unknown): void {
        // Tolerate either `{databases: [...]}` or `[...]` shapes.
        const arr: unknown[] = Array.isArray(result)
            ? result
            : (result && typeof result === "object" && Array.isArray((result as { databases?: unknown[] }).databases)
                ? (result as { databases: unknown[] }).databases
                : []);
        const remote = new Map<string, { type: OrbitdbServerStoreType }>();
        for (const r of arr) {
            if (!r || typeof r !== "object") continue;
            const rec = r as { name?: unknown; type?: unknown };
            const name = typeof rec.name === "string" ? rec.name : null;
            const type = typeof rec.type === "string" ? (rec.type as OrbitdbServerStoreType) : "keyvalue";
            if (!name) continue;
            remote.set(name, { type });
        }

        // Mark local-confirmed flag.
        for (const db of this.databases) {
            db.confirmedOnServer = remote.has(db.name);
        }
        // Add any server dbs we didn't know about.
        for (const [name, info] of remote) {
            if (!this.databases.find((d) => d.name === name)) {
                this.databases.unshift({
                    name,
                    type: info.type,
                    openedAt: new Date().toISOString(),
                    confirmedOnServer: true,
                });
            }
        }
        if (this.databases.length > ENTRY_LIMIT) {
            this.databases.length = ENTRY_LIMIT;
        }
        this.onChange();
    }

    // ── Identity / status ──

    async health(): Promise<{ ok: boolean; version?: string }> {
        const r = await this.request<Record<string, unknown>>("/health", { allowMissingAuth: true });
        return {
            ok: !!(r && (r.ok ?? true)),
            version: typeof r?.version === "string" ? r.version : undefined,
        };
    }

    // ── Database lifecycle ──

    async createDatabase(name: string, type: OrbitdbServerStoreType): Promise<OrbitdbServerDatabaseEntry> {
        this.requireConnected();
        await this.request<Record<string, unknown>>("/db/create", { params: { name, type } });
        return this.recordDatabase({ name, type, confirmedOnServer: true });
    }

    async dropDatabase(name: string): Promise<void> {
        this.requireConnected();
        await this.request<Record<string, unknown>>("/db/drop", { params: { name } });
        const idx = this.databases.findIndex((d) => d.name === name);
        if (idx >= 0) {
            this.databases.splice(idx, 1);
            this.onChange();
        }
    }

    async listDatabases(): Promise<OrbitdbServerDatabaseEntry[]> {
        this.requireConnected();
        const r = await this.request<Record<string, unknown>>("/db/list");
        this.reconcileDatabaseList(r);
        return this.databases.slice();
    }

    // ── Data operations ──

    async put(name: string, key: string | undefined, value: unknown): Promise<OrbitdbServerWriteResult> {
        this.requireConnected();
        const params: Record<string, string> = { db: name };
        if (typeof key === "string" && key.length > 0) params.key = key;
        const r = await this.request<Record<string, unknown>>("/db/put", { params, body: value });
        this.touchDatabase(name);
        return {
            hash: typeof r?.hash === "string" ? r.hash : undefined,
            key: typeof r?.key === "string" ? r.key : key,
        };
    }

    async get(name: string, key: string): Promise<unknown> {
        this.requireConnected();
        const r = await this.request<unknown>("/db/get", { params: { db: name, key } });
        this.touchDatabase(name);
        return r;
    }

    async del(name: string, key: string): Promise<void> {
        this.requireConnected();
        await this.request("/db/del", { params: { db: name, key } });
        this.touchDatabase(name);
    }

    async all(name: string): Promise<unknown[]> {
        this.requireConnected();
        const r = await this.request<unknown>("/db/all", { params: { db: name } });
        const arr: unknown[] = Array.isArray(r) ? r : [];
        const db = this.databases.find((d) => d.name === name);
        if (db) {
            db.entryCount = arr.length;
            db.preview = arr.slice(0, PREVIEW_LIMIT).map((row) => this.toPreviewRow(row));
            db.lastActivityAt = new Date().toISOString();
            this.onChange();
        }
        return arr;
    }

    async query(name: string, filter: Record<string, unknown>): Promise<unknown[]> {
        this.requireConnected();
        const r = await this.request<unknown>("/db/query", { params: { db: name }, body: { filter } });
        const arr: unknown[] = Array.isArray(r) ? r : [];
        this.touchDatabase(name);
        return arr;
    }

    async add(name: string, value: unknown): Promise<OrbitdbServerWriteResult> {
        this.requireConnected();
        const r = await this.request<Record<string, unknown>>("/db/add", { params: { db: name }, body: value });
        this.touchDatabase(name);
        return { hash: typeof r?.hash === "string" ? r.hash : undefined };
    }

    // ── Swarm ──

    async swarmListPeers(): Promise<Array<{ peerId: string; addr: string }>> {
        this.requireConnected();
        const r = await this.request<unknown>("/swarm/peers");
        const arr: unknown[] = Array.isArray(r) ? r : [];
        const peers = arr.map((p) => {
            const rec = (p ?? {}) as { peerId?: unknown; peer?: unknown; addr?: unknown };
            const peerId = typeof rec.peerId === "string" ? rec.peerId : typeof rec.peer === "string" ? rec.peer : "";
            const addr = typeof rec.addr === "string" ? rec.addr : "";
            return { peerId, addr };
        });
        this.swarmPeers = peers;
        if (this.peer) this.peer.connectedPeers = peers.length;
        this.onChange();
        return peers;
    }

    async swarmConnect(multiaddr: string): Promise<void> {
        this.requireConnected();
        await this.request("/swarm/connect", { params: { addr: multiaddr } });
    }

    // ── Pnet ──

    async pnetStatus(): Promise<{ mode: "private" | "public"; fingerprint?: string }> {
        this.requireConnected();
        const r = await this.request<Record<string, unknown>>("/pnet/status");
        const mode = r?.mode === "private" || r?.mode === "public" ? r.mode : "public";
        const fingerprint = typeof r?.fingerprint === "string" ? r.fingerprint : undefined;
        if (this.peer) {
            this.peer.pnetMode = mode;
            this.peer.pnetFingerprint = fingerprint;
            this.onChange();
        }
        return { mode, fingerprint };
    }

    async pnetGenerate(): Promise<{ key: string }> {
        this.requireConnected();
        const r = await this.request<Record<string, unknown>>("/pnet/generate");
        const key = typeof r?.key === "string" ? r.key : "";
        return { key };
    }

    // ── Local bookkeeping ──

    listDatabasesLocal(): OrbitdbServerDatabaseEntry[] {
        return this.databases.slice();
    }

    private recordDatabase(partial: Omit<OrbitdbServerDatabaseEntry, "openedAt"> & { openedAt?: string }): OrbitdbServerDatabaseEntry {
        const existing = this.databases.find((d) => d.name === partial.name);
        if (existing) {
            existing.type = partial.type;
            existing.confirmedOnServer = partial.confirmedOnServer ?? existing.confirmedOnServer;
            existing.lastActivityAt = new Date().toISOString();
            this.onChange();
            return existing;
        }
        const entry: OrbitdbServerDatabaseEntry = {
            name: partial.name,
            type: partial.type,
            openedAt: partial.openedAt ?? new Date().toISOString(),
            lastActivityAt: new Date().toISOString(),
            confirmedOnServer: !!partial.confirmedOnServer,
        };
        this.databases.unshift(entry);
        if (this.databases.length > ENTRY_LIMIT) this.databases.length = ENTRY_LIMIT;
        this.onChange();
        return entry;
    }

    private touchDatabase(name: string): void {
        const db = this.databases.find((d) => d.name === name);
        if (db) {
            db.lastActivityAt = new Date().toISOString();
            this.onChange();
        }
    }

    private toPreviewRow(row: unknown): { key?: string; value: unknown; hash?: string } {
        if (row && typeof row === "object" && !Array.isArray(row)) {
            const rec = row as { key?: unknown; value?: unknown; hash?: unknown };
            if ("value" in rec || "key" in rec || "hash" in rec) {
                return {
                    key: typeof rec.key === "string" ? rec.key : undefined,
                    value: rec.value ?? rec,
                    hash: typeof rec.hash === "string" ? rec.hash : undefined,
                };
            }
        }
        return { value: row };
    }
}

class OrbitdbServerManager {
    private nodes = new Map<string, OrbitdbServerNode>();
    private order: string[] = [];
    private activeId: string | null = null;
    private listeners = new Set<ManagerListener>();
    private nextSeq = 1;

    constructor() {
        const persisted = loadPersistedManager();
        if (persisted && persisted.nodes.length > 0) {
            this.nextSeq = Math.max(persisted.nextSeq ?? 1, 1);
            for (const p of persisted.nodes) {
                const node = new OrbitdbServerNode(p.id, p.label, p.endpoint, () => this.emit(), p.authorization, p.timeoutMs);
                node.databases = Array.isArray(p.databases) ? p.databases.slice(0, ENTRY_LIMIT) : [];
                this.nodes.set(p.id, node);
                this.order.push(p.id);
            }
            this.activeId = persisted.activeId && this.nodes.has(persisted.activeId)
                ? persisted.activeId
                : (this.order[0] ?? null);
        } else {
            this.addNode("Local orbitdb-server", "http://127.0.0.1:3000");
        }
    }

    subscribe(fn: ManagerListener): () => void {
        this.listeners.add(fn);
        try { fn(this.snapshot()); } catch { /* noop */ }
        return () => { this.listeners.delete(fn); };
    }

    snapshot(): OrbitdbServerManagerSnapshot {
        return {
            activeId: this.activeId,
            nodes: this.order
                .map((id) => this.nodes.get(id))
                .filter((n): n is OrbitdbServerNode => !!n)
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
                .filter((n): n is OrbitdbServerNode => !!n)
                .map((n) => n.toPersisted());
            savePersistedManager({
                activeId: this.activeId,
                nextSeq: this.nextSeq,
                nodes,
            });
        } catch (err) {
            logError("orbitdbServer.manager.persist", err, undefined, { warn: true });
        }
    }

    addNode(label?: string, endpoint = "http://127.0.0.1:3000"): string {
        const seq = this.nextSeq++;
        const id = `obs-${seq}-${Math.random().toString(36).slice(2, 6)}`;
        const node = new OrbitdbServerNode(id, label ?? `orbitdb-server ${seq}`, endpoint, () => this.emit());
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
    getNode(id?: string | null): OrbitdbServerNode {
        const target = id ?? this.activeId;
        if (!target) throw new Error("No active orbitdb-server node");
        const node = this.nodes.get(target);
        if (!node) throw new Error(`orbitdb-server node "${target}" not found`);
        return node;
    }

    // Convenience proxies — default to active node.
    connect(opts?: OrbitdbServerConnectOptions, id?: string) { return this.getNode(id).connect(opts); }
    disconnect(id?: string) { return this.getNode(id).disconnect(); }
    refresh(id?: string) { return this.getNode(id).refresh(); }
    health(id?: string) { return this.getNode(id).health(); }

    createDatabase(name: string, type: OrbitdbServerStoreType, id?: string) {
        return this.getNode(id).createDatabase(name, type);
    }
    dropDatabase(name: string, id?: string) { return this.getNode(id).dropDatabase(name); }
    listDatabases(id?: string) { return this.getNode(id).listDatabases(); }
    listDatabasesLocal(id?: string) { return this.getNode(id).listDatabasesLocal(); }
    put(name: string, key: string | undefined, value: unknown, id?: string) {
        return this.getNode(id).put(name, key, value);
    }
    get(name: string, key: string, id?: string) { return this.getNode(id).get(name, key); }
    del(name: string, key: string, id?: string) { return this.getNode(id).del(name, key); }
    all(name: string, id?: string) { return this.getNode(id).all(name); }
    query(name: string, filter: Record<string, unknown>, id?: string) { return this.getNode(id).query(name, filter); }
    add(name: string, value: unknown, id?: string) { return this.getNode(id).add(name, value); }
    swarmListPeers(id?: string) { return this.getNode(id).swarmListPeers(); }
    swarmConnect(multiaddr: string, id?: string) { return this.getNode(id).swarmConnect(multiaddr); }
    pnetStatus(id?: string) { return this.getNode(id).pnetStatus(); }
    pnetGenerate(id?: string) { return this.getNode(id).pnetGenerate(); }
}

export const orbitdbServerService = new OrbitdbServerManager();
export type { OrbitdbServerManager, OrbitdbServerNode };
