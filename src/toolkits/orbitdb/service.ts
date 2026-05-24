/**
 * OrbitDB Service — multi-instance manager around OrbitDB nodes.
 *
 * Each {@link OrbitdbNode} composes on top of a running Helia (IPFS)
 * instance owned by the helia toolkit. When started without a helia
 * binding, the active helia node is used (and started if needed).
 *
 * Heavy modules (`@orbitdb/core`) are dynamically imported on first
 * `.start()` to keep the initial bundle slim. Live OrbitDB instances
 * live here (NOT in zustand or React state); the React provider mirrors
 * {@link OrbitdbManagerSnapshot} via `subscribe()`.
 */

import { heliaService } from "@/toolkits/helia/service";
import { libp2pService, type Libp2pStartOptions } from "@/toolkits/libp2p/service";
import { logError } from "@/services/logging";
import type {
    OrbitdbStatus,
    OrbitdbSnapshot,
    OrbitdbDbInfo,
    OrbitdbDbType,
    OrbitdbStartOptions,
    OrbitdbManagerSnapshot,
    OrbitdbEntry,
} from "./types/orbitdb";

/**
 * Resolve the OrbitDB identity id for the currently logged-in user.
 *
 * OrbitDB derives a deterministic identity from the `id` string we pass to
 * `createOrbitDB`, so reusing the user's DID across nodes / sessions yields
 * the same identity & public key for that user.
 */
export function getUserOrbitdbIdentityId(): string | undefined {
    try {
        const did = localStorage.getItem("user_did");
        if (did && did.trim()) return did.trim();
        const userStr = localStorage.getItem("user");
        if (userStr) {
            const user = JSON.parse(userStr) as { did?: string; id?: string; email?: string };
            if (user.did) return user.did;
            if (user.id) return `user:${user.id}`;
            if (user.email) return `user:${user.email}`;
        }
    } catch {
        /* localStorage / JSON unavailable — fall through */
    }
    return undefined;
}

/**
 * Probe whether IndexedDB is usable in this context.
 *
 * In partitioned / iframed pages (e.g. coder.com workspaces, third-party
 * cookie blocking, private browsing) Chrome will throw
 * `UnknownError: Internal error.` on first IDB open. Opening a tiny
 * throw-away database surfaces this synchronously so we can pick a
 * memory-backed keystore instead of letting OrbitDB explode.
 */
async function probeIndexedDB(): Promise<boolean> {
    if (typeof indexedDB === "undefined") return false;
    return await new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (ok: boolean) => {
            if (settled) return;
            settled = true;
            resolve(ok);
        };
        try {
            const name = `__orbitdb_probe_${Math.random().toString(36).slice(2, 8)}`;
            const req = indexedDB.open(name, 1);
            req.onerror = () => finish(false);
            req.onblocked = () => finish(false);
            req.onsuccess = () => {
                try { req.result.close(); } catch { /* ignore */ }
                try { indexedDB.deleteDatabase(name); } catch { /* ignore */ }
                finish(true);
            };
            // Some partitioned contexts hang the request indefinitely.
            setTimeout(() => finish(false), 1500);
        } catch {
            finish(false);
        }
    });
}

type ManagerListener = (state: OrbitdbManagerSnapshot) => void;

/**
 * Walk the `cause` chain of an Error and return the deepest non-empty message.
 * OrbitDB wraps the original IndexedDB failure inside `NotOpenError`, which
 * itself wraps a DOMException ("UnknownError: Internal error.").
 */
function innerCauseMessage(err: unknown): string {
    let cur: unknown = err;
    let last = "";
    for (let i = 0; i < 6 && cur; i++) {
        if (cur instanceof Error) {
            if (cur.message) last = cur.message;
            cur = (cur as { cause?: unknown }).cause;
        } else if (typeof cur === "object" && cur && "message" in (cur as Record<string, unknown>)) {
            const m = (cur as { message?: unknown }).message;
            if (typeof m === "string" && m) last = m;
            cur = (cur as { cause?: unknown }).cause;
        } else {
            break;
        }
    }
    return last;
}

/**
 * Build a user-facing message for a failed `orbitdb.start()`.
 * Surfaces the underlying cause (otherwise drowned by OrbitDB's
 * generic "Database failed to open") and appends remediation hints for
 * known transient IndexedDB failures.
 */
function formatStartError(err: unknown): string {
    const top = err instanceof Error ? err.message : String(err);
    const cause = innerCauseMessage(err);
    const joined = `${top} ${cause ?? ""}`;
    if (/pubsub has not started/i.test(joined)) {
        return (
            "OrbitDB requires an active libp2p pubsub service, but the bound Helia node is attached to a libp2p node with pubsub disabled or not started. " +
            "In the Libp2p toolkit, stop that node, enable 'Pubsub (gossipsub)' in Start options, and start it again; then restart Helia and OrbitDB."
        );
    }

    if (!cause || cause === top) return top;

    let msg = `${top} — ${cause}`;
    if (/internal error|unknown error/i.test(cause)) {
        msg += " (IndexedDB failure — try reloading the page or clearing site data for OrbitDB storage)";
    }
    return msg;
}

function isPubsubReady(ipfs: unknown): boolean {
    try {
        const libp2p = (ipfs as { libp2p?: { services?: { pubsub?: { isStarted?: () => boolean } } } })?.libp2p;
        const pubsub = libp2p?.services?.pubsub;
        if (!pubsub) return false;
        if (typeof pubsub.isStarted === "function") return pubsub.isStarted();
        return true;
    } catch {
        return false;
    }
}

function withPubsubEnabled(opts: Libp2pStartOptions): Libp2pStartOptions {
    return {
        ...opts,
        services: {
            ...(opts.services ?? {}),
            pubsub: true,
        },
    };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface OrbitdbLike {
    open: (
        addressOrName: string,
        options?: { type?: OrbitdbDbType; meta?: Record<string, unknown>; sync?: boolean; Database?: any; AccessController?: any },
    ) => Promise<DatabaseLike>;
    stop: () => Promise<void>;
    identity?: { id: string; publicKey?: string };
    ipfs?: any;
}

interface DatabaseLike {
    address: string;
    name: string;
    type: OrbitdbDbType;
    meta?: Record<string, unknown>;
    close: () => Promise<void>;
    drop: () => Promise<void>;
    // Common
    all?: () => Promise<Array<{ hash?: string; key?: string; value: unknown }>>;
    iterator?: (opts?: { amount?: number; gt?: string; gte?: string; lt?: string; lte?: string }) =>
        AsyncIterable<{ hash?: string; key?: string; value: unknown }>;
    // KV
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    put?: (...args: any[]) => Promise<string>;
    set?: (key: string, value: unknown) => Promise<string>;
    del?: (key: string) => Promise<string>;
    get?: (key: string) => Promise<unknown>;
    // Documents
    query?: (findFn: (doc: any) => boolean) => Promise<unknown[]>;
    // Events
    add?: (value: unknown) => Promise<string>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const NODES_STORAGE_KEY = "decops:orbitdb-nodes:v1";

interface PersistedDb {
    address: string;
    name: string;
    type: OrbitdbDbType;
    meta?: Record<string, unknown>;
    indexBy?: string;
}

interface PersistedNode {
    id: string;
    label: string;
    heliaNodeId: string | null;
    databases: PersistedDb[];
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

const DB_LIMIT = 100;

class OrbitdbNode {
    readonly id: string;
    label: string;
    /** Local helia node id to bind to (null = use the active helia on start). */
    heliaNodeId: string | null;
    /** Cached database metadata (also persisted). */
    databases: OrbitdbDbInfo[] = [];

    private status: OrbitdbStatus = "stopped";
    private error?: string;
    private startedAt?: string;
    private orbitdb: OrbitdbLike | null = null;
    /** Cached `@orbitdb/core` module — populated on start; reused by openDatabase. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private orbitdbMod: any | null = null;
    /** Open database handles, keyed by address. */
    private dbHandles = new Map<string, DatabaseLike>();
    private startPromise: Promise<void> | null = null;
    /** True when running with a non-persistent in-memory keystore. */
    private usingMemoryKeystore = false;
    private onChange: () => void;

    constructor(id: string, label: string, heliaNodeId: string | null, onChange: () => void) {
        this.id = id;
        this.label = label;
        this.heliaNodeId = heliaNodeId;
        this.onChange = onChange;
    }

    snapshot(): OrbitdbSnapshot {
        let peerId: string | null = null;
        try {
            const helia = this.heliaNodeId
                ? heliaService.getNode(this.heliaNodeId).snapshot()
                : null;
            peerId = helia?.peerId ?? null;
        } catch { /* noop */ }
        return {
            nodeId: this.id,
            label: this.label,
            status: this.status,
            error: this.error,
            startedAt: this.startedAt,
            heliaNodeId: this.heliaNodeId,
            peerId,
            identityId: this.orbitdb?.identity?.id ?? null,
            usingMemoryKeystore: this.usingMemoryKeystore || undefined,
            databases: this.databases.slice(),
        };
    }

    toPersisted(): PersistedNode {
        return {
            id: this.id,
            label: this.label,
            heliaNodeId: this.heliaNodeId,
            databases: this.databases.slice(0, DB_LIMIT).map((d) => ({
                address: d.address,
                name: d.name,
                type: d.type,
                meta: d.meta,
                indexBy: d.indexBy,
            })),
        };
    }

    setLabel(label: string): void {
        this.label = label;
        this.onChange();
    }

    setHeliaBinding(heliaNodeId: string | null): void {
        if (this.status === "running" || this.status === "starting") {
            throw new Error("Stop the orbitdb node before changing its helia binding");
        }
        this.heliaNodeId = heliaNodeId;
        this.onChange();
    }

    private setStatus(status: OrbitdbStatus, error?: string) {
        this.status = status;
        this.error = error;
        this.onChange();
    }

    private async ensureHeliaPubsubReady(heliaNodeId: string): Promise<unknown> {
        let heliaNode;
        try {
            heliaNode = heliaService.getNode(heliaNodeId);
        } catch {
            throw new Error(
                `helia node "${heliaNodeId}" not found — pick another or leave the selection empty`,
            );
        }

        if (heliaNode.snapshot().status !== "running") {
            await heliaService.start({}, heliaNodeId);
        }

        let ipfs: any = (heliaService.getNode(heliaNodeId) as any)["helia"];
        if (!ipfs) {
            throw new Error("Failed to obtain a running helia (IPFS) instance");
        }
        if (isPubsubReady(ipfs)) return ipfs;

        const libp2pNodeId = heliaNode.snapshot().libp2pNodeId;
        if (!libp2pNodeId) {
            throw new Error("libp2p pubsub is not started for the selected Helia node");
        }

        const recoveredOpts = withPubsubEnabled(libp2pService.getLastStartOptions(libp2pNodeId));
        logError(
            "orbitdb.start.pubsub-autorecover",
            new Error("Restarting libp2p with pubsub enabled for OrbitDB"),
            { nodeId: this.id, heliaNodeId, libp2pNodeId },
            { warn: true },
        );

        await heliaService.stop(heliaNodeId);
        await libp2pService.stop(libp2pNodeId);
        await libp2pService.start(recoveredOpts, libp2pNodeId);
        await heliaService.start({ libp2pNodeId }, heliaNodeId);

        ipfs = (heliaService.getNode(heliaNodeId) as any)["helia"];
        if (!ipfs || !isPubsubReady(ipfs)) {
            throw new Error("libp2p pubsub could not be auto-started for the selected Helia node");
        }
        return ipfs;
    }

    /**
     * Start the OrbitDB node by binding it to a Helia (IPFS) node.
     */
    async start(opts: OrbitdbStartOptions = {}): Promise<void> {
        if (this.status === "running") return;
        if (this.startPromise) return this.startPromise;

        this.setStatus("starting");
        this.startPromise = (async () => {
            try {
                // ── 1) Resolve / acquire the helia instance ──────────────
                if (opts.heliaNodeId) {
                    this.heliaNodeId = opts.heliaNodeId;
                }
                if (!this.heliaNodeId) {
                    this.heliaNodeId = heliaService.getActiveId();
                }
                if (!this.heliaNodeId) {
                    throw new Error("No helia node available — create or start one first");
                }

                // The helia node exposes its underlying instance via a private field.
                // Use the public service API to reach for the live helia instance.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const ipfs: any = await this.ensureHeliaPubsubReady(this.heliaNodeId);

                // ── 2) Dynamic import — keep the bundle slim ──────────────
                const orbitdbMod = await import("@orbitdb/core");
                const { createOrbitDB } = orbitdbMod as unknown as {
                    createOrbitDB: (params: {
                        ipfs: unknown;
                        id?: string;
                        directory?: string;
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        identities?: any;
                    }) => Promise<OrbitdbLike>;
                };

                // OrbitDB persists keystore / identities under `directory` via `level`
                // (browser-level → IndexedDB). Strip any `./` prefix so the resulting
                // IndexedDB database names are stable & predictable. Sanitize the
                // identity id so DID strings (with `:` etc.) don't trip up downstream
                // path-joining.
                const directory = (opts.directory ?? `orbitdb-${this.id}`).replace(/^\.\//, "");
                const rawId = opts.identityId ?? getUserOrbitdbIdentityId();
                const identityId = rawId ? rawId.trim() || undefined : undefined;

                // Probe IndexedDB availability first. In partitioned / iframed
                // contexts (e.g. coder.com workspaces) Chrome may refuse IDB
                // writes with `UnknownError: Internal error.` — fall back to
                // in-memory keystore so the toolkit still works (identity will
                // not persist across reloads).
                const idbOk = await probeIndexedDB();
                this.usingMemoryKeystore = !idbOk;
                if (!idbOk) {
                    logError(
                        "orbitdb.start.idb-unavailable",
                        new Error("IndexedDB unavailable — using in-memory keystore"),
                        { nodeId: this.id },
                        { warn: true },
                    );
                }

                const orbitdb = await this.createOrbitDBWithRetry(
                    createOrbitDB,
                    orbitdbMod as Record<string, unknown>,
                    { ipfs, id: identityId, directory },
                    !idbOk,
                );
                this.orbitdb = orbitdb;
                this.orbitdbMod = orbitdbMod;

                this.startedAt = new Date().toISOString();
                this.setStatus("running");

                // ── 3) Reopen any previously-known databases (best-effort) ─
                for (const info of this.databases.slice()) {
                    try {
                        await this.openDatabase(info.address, { type: info.type });
                    } catch (err) {
                        logError("orbitdb.reopen", err, { nodeId: this.id, address: info.address }, { warn: true });
                    }
                }
            } catch (err) {
                const msg = formatStartError(err);
                logError("orbitdb.start", err, { nodeId: this.id });
                this.setStatus("error", msg);
                const out = new Error(msg);
                if (err instanceof Error) (out as { cause?: unknown }).cause = err;
                throw out;
            } finally {
                this.startPromise = null;
            }
        })();
        return this.startPromise;
    }

    /**
     * Open the OrbitDB instance, with a single retry to absorb transient
     * IndexedDB hiccups (Chrome occasionally throws `UnknownError: Internal
     * error.` on first open, especially during HMR / multiple opens in the
     * same tick). If `forceMemory` is set (or the retry still fails with an
     * IDB-style error), falls back to an in-memory keystore.
     */
    private async createOrbitDBWithRetry(
        createOrbitDB: (params: {
            ipfs: unknown;
            id?: string;
            directory?: string;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            identities?: any;
        }) => Promise<OrbitdbLike>,
        orbitdbMod: Record<string, unknown>,
        params: { ipfs: unknown; id?: string; directory?: string },
        forceMemory: boolean,
    ): Promise<OrbitdbLike> {
        if (forceMemory) {
            return await this.createOrbitDBWithMemoryKeystore(createOrbitDB, orbitdbMod, params);
        }
        try {
            return await createOrbitDB(params);
        } catch (err) {
            const inner = innerCauseMessage(err);
            if (!/internal error|unknown error|invalidstate|aborterror|quota/i.test(inner)) {
                throw err;
            }
            logError(
                "orbitdb.start.retry",
                err,
                { nodeId: this.id, directory: params.directory, cause: inner },
                { warn: true },
            );
            await new Promise((r) => setTimeout(r, 250));
            try {
                return await createOrbitDB(params);
            } catch (retryErr) {
                logError(
                    "orbitdb.start.memory-fallback",
                    retryErr,
                    { nodeId: this.id, cause: innerCauseMessage(retryErr) },
                    { warn: true },
                );
                this.usingMemoryKeystore = true;
                return await this.createOrbitDBWithMemoryKeystore(createOrbitDB, orbitdbMod, params);
            }
        }
    }

    /**
     * Construct an OrbitDB instance whose keystore lives in process memory.
     * Used when IndexedDB is unavailable (storage partitioning, iframed
     * contexts, private browsing). The identity is regenerated per session
     * but the user-supplied `id` keeps the derived public key stable so
     * peers can still verify signatures within the same session.
     */
    private async createOrbitDBWithMemoryKeystore(
        createOrbitDB: (params: {
            ipfs: unknown;
            id?: string;
            directory?: string;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            identities?: any;
        }) => Promise<OrbitdbLike>,
        orbitdbMod: Record<string, unknown>,
        params: { ipfs: unknown; id?: string; directory?: string },
    ): Promise<OrbitdbLike> {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const KeyStore = (orbitdbMod as any).KeyStore as
            | ((opts: { storage: unknown }) => Promise<unknown>)
            | undefined;
        const Identities = (orbitdbMod as any).Identities as
            | ((opts: { ipfs?: unknown; keystore?: unknown }) => Promise<unknown>)
            | undefined;
        const MemoryStorage = (orbitdbMod as any).MemoryStorage as
            | (() => Promise<unknown>)
            | undefined;
        /* eslint-enable @typescript-eslint/no-explicit-any */
        if (!KeyStore || !Identities || !MemoryStorage) {
            throw new Error(
                "OrbitDB memory fallback unavailable — missing KeyStore / Identities / MemoryStorage exports",
            );
        }
        const storage = await MemoryStorage();
        const keystore = await KeyStore({ storage });
        const identities = await Identities({ ipfs: params.ipfs, keystore });
        return await createOrbitDB({ ...params, identities });
    }

    /**
     * Build a heads/entry/index storage triple backed by in-memory storage,
     * suitable for passing to `orbitdb.open()` when IndexedDB is unusable.
     */
    private async buildMemoryStorages(): Promise<Record<string, unknown>> {
        const mod = this.orbitdbMod ?? (await import("@orbitdb/core"));
        if (!this.orbitdbMod) this.orbitdbMod = mod;
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const MemoryStorage = (mod as any).MemoryStorage as (() => Promise<unknown>) | undefined;
        const LRUStorage = (mod as any).LRUStorage as ((o?: { size?: number }) => Promise<unknown>) | undefined;
        const ComposedStorage = (mod as any).ComposedStorage as ((a: unknown, b: unknown) => Promise<unknown>) | undefined;
        /* eslint-enable @typescript-eslint/no-explicit-any */
        if (!MemoryStorage) return {};
        const make = async () =>
            LRUStorage && ComposedStorage
                ? await ComposedStorage(await LRUStorage({ size: 1000 }), await MemoryStorage())
                : await MemoryStorage();
        return {
            headsStorage: await make(),
            entryStorage: await make(),
            indexStorage: await make(),
        };
    }

    async stop(): Promise<void> {
        if (this.status === "stopped" || !this.orbitdb) {
            this.setStatus("stopped");
            return;
        }
        this.setStatus("stopping");
        // Close all open databases first.
        for (const [, db] of this.dbHandles) {
            try { await db.close(); } catch (err) {
                logError("orbitdb.db.close", err, { nodeId: this.id }, { warn: true });
            }
        }
        this.dbHandles.clear();
        for (const info of this.databases) info.open = false;
        try {
            await this.orbitdb.stop();
        } catch (err) {
            logError("orbitdb.stop", err, { nodeId: this.id }, { warn: true });
        }
        this.orbitdb = null;
        this.orbitdbMod = null;
        this.startedAt = undefined;
        this.usingMemoryKeystore = false;
        this.setStatus("stopped");
    }

    private requireRunning(): OrbitdbLike {
        if (this.status !== "running" || !this.orbitdb) {
            throw new Error(`OrbitDB node "${this.label}" is not running`);
        }
        return this.orbitdb;
    }

    /** Open (or create) a database by name or address. */
    async openDatabase(
        addressOrName: string,
        opts: { type?: OrbitdbDbType; meta?: Record<string, unknown>; sync?: boolean; indexBy?: string } = {},
    ): Promise<OrbitdbDbInfo> {
        const orbitdb = this.requireRunning();
        // Documents type supports an `indexBy` factory; we wire it via the optional Database param
        // when callers want a non-default `_id` field.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let DatabaseFactory: any | undefined;
        if (opts.type === "documents" && opts.indexBy && opts.indexBy !== "_id") {
            const mod = this.orbitdbMod ?? (await import("@orbitdb/core"));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const Documents = (mod as any).Documents as ((params: { indexBy: string }) => unknown);
            if (typeof Documents === "function") {
                DatabaseFactory = Documents({ indexBy: opts.indexBy });
            }
        }

        // When running with a memory keystore, IndexedDB is unavailable in
        // this context — so the database's heads/entry/index storages must
        // also be in-memory (defaults are LevelStorage → IDB).
        const extraStorages: Record<string, unknown> = this.usingMemoryKeystore
            ? await this.buildMemoryStorages()
            : {};

        let db: DatabaseLike;
        try {
            db = await orbitdb.open(addressOrName, {
                type: opts.type ?? "events",
                meta: opts.meta,
                sync: opts.sync,
                ...(DatabaseFactory ? { Database: DatabaseFactory } : {}),
                ...extraStorages,
            });
        } catch (err) {
            const inner = innerCauseMessage(err);
            // If level/IDB blew up, retry with in-memory storages so the
            // database can still be opened (non-persistent across reloads).
            if (
                !this.usingMemoryKeystore &&
                /internal error|unknown error|invalidstate|aborterror|quota|notopen/i.test(inner)
            ) {
                logError(
                    "orbitdb.openDatabase.memory-fallback",
                    err,
                    { nodeId: this.id, addressOrName, cause: inner },
                    { warn: true },
                );
                const memoryStorages = await this.buildMemoryStorages();
                try {
                    db = await orbitdb.open(addressOrName, {
                        type: opts.type ?? "events",
                        meta: opts.meta,
                        sync: opts.sync,
                        ...(DatabaseFactory ? { Database: DatabaseFactory } : {}),
                        ...memoryStorages,
                    });
                } catch (retryErr) {
                    const top2 = retryErr instanceof Error ? retryErr.message : String(retryErr);
                    const inner2 = innerCauseMessage(retryErr);
                    const msg2 = inner2 && inner2 !== top2 ? `${top2} — ${inner2}` : top2;
                    logError("orbitdb.openDatabase", retryErr, { nodeId: this.id, addressOrName, type: opts.type });
                    const out = new Error(msg2);
                    if (retryErr instanceof Error) (out as { cause?: unknown }).cause = retryErr;
                    throw out;
                }
            } else {
                const top = err instanceof Error ? err.message : String(err);
                const msg = inner && inner !== top ? `${top} — ${inner}` : top;
                logError("orbitdb.openDatabase", err, { nodeId: this.id, addressOrName, type: opts.type });
                const out = new Error(msg);
                if (err instanceof Error) (out as { cause?: unknown }).cause = err;
                throw out;
            }
        }
        const address = db.address.toString();
        this.dbHandles.set(address, db);

        const info: OrbitdbDbInfo = {
            address,
            name: db.name,
            type: db.type ?? opts.type ?? "events",
            meta: db.meta,
            open: true,
            indexBy: opts.indexBy,
            lastActivityAt: new Date().toISOString(),
        };
        this.upsertDb(info);
        return info;
    }

    async closeDatabase(address: string): Promise<void> {
        const db = this.dbHandles.get(address);
        if (!db) return;
        try { await db.close(); } finally {
            this.dbHandles.delete(address);
            const info = this.databases.find((d) => d.address === address);
            if (info) { info.open = false; this.onChange(); }
        }
    }

    async dropDatabase(address: string): Promise<void> {
        // Drop deletes all data on disk.
        const db = this.dbHandles.get(address) ?? await this.requireRunning().open(address);
        await db.drop();
        this.dbHandles.delete(address);
        this.databases = this.databases.filter((d) => d.address !== address);
        this.onChange();
    }

    listDatabases(): OrbitdbDbInfo[] {
        return this.databases.slice();
    }

    /** Produce a friendly handle for op methods. */
    private getOpenDb(address: string): DatabaseLike {
        const db = this.dbHandles.get(address);
        if (!db) throw new Error(`Database "${address}" is not open. Call openDatabase first.`);
        return db;
    }

    // ── Mutation operations ──────────────────────────────────────────

    /** KeyValue / KeyValueIndexed put. */
    async kvPut(address: string, key: string, value: unknown): Promise<string> {
        const db = this.getOpenDb(address);
        if (!db.put) throw new Error("Database is not a key-value store");
        const hash = await db.put(key, value);
        await this.touchDb(address);
        return hash;
    }

    async kvGet(address: string, key: string): Promise<unknown> {
        const db = this.getOpenDb(address);
        if (!db.get) throw new Error("Database is not a key-value store");
        return db.get(key);
    }

    async kvDel(address: string, key: string): Promise<string> {
        const db = this.getOpenDb(address);
        if (!db.del) throw new Error("Database is not a key-value store");
        const hash = await db.del(key);
        await this.touchDb(address);
        return hash;
    }

    /** Events log append. */
    async eventAdd(address: string, value: unknown): Promise<string> {
        const db = this.getOpenDb(address);
        if (!db.add) throw new Error("Database is not an events log");
        const hash = await db.add(value);
        await this.touchDb(address);
        return hash;
    }

    /** Documents put / get / del. */
    async docPut(address: string, doc: Record<string, unknown>): Promise<string> {
        const db = this.getOpenDb(address);
        if (!db.put) throw new Error("Database is not a documents store");
        const hash = await db.put(doc as unknown as string);
        await this.touchDb(address);
        return hash;
    }

    async docGet(address: string, key: string): Promise<unknown> {
        const db = this.getOpenDb(address);
        if (!db.get) throw new Error("Database is not a documents store");
        return db.get(key);
    }

    async docDel(address: string, key: string): Promise<string> {
        const db = this.getOpenDb(address);
        if (!db.del) throw new Error("Database is not a documents store");
        const hash = await db.del(key);
        await this.touchDb(address);
        return hash;
    }

    /** Documents query. The selector is sent as a JSON-encoded function body. */
    async docQuery(address: string, findFnSource: string): Promise<unknown[]> {
        const db = this.getOpenDb(address);
        if (!db.query) throw new Error("Database is not a documents store");
        // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
        const fn = new Function("doc", `return (${findFnSource})(doc);`) as (doc: unknown) => boolean;
        return db.query(fn);
    }

    /** Universal: list all entries (uses `.all()` when available). */
    async all(address: string): Promise<OrbitdbEntry[]> {
        const db = this.getOpenDb(address);
        if (db.all) {
            const rows = await db.all();
            return rows as OrbitdbEntry[];
        }
        if (db.iterator) {
            const out: OrbitdbEntry[] = [];
            for await (const row of db.iterator()) out.push(row as OrbitdbEntry);
            return out;
        }
        throw new Error("Database does not support all/iterator");
    }

    /** Universal: paged iterator. */
    async iterate(address: string, opts: { amount?: number } = {}): Promise<OrbitdbEntry[]> {
        const db = this.getOpenDb(address);
        if (!db.iterator) throw new Error("Database does not support iterator");
        const out: OrbitdbEntry[] = [];
        for await (const row of db.iterator(opts)) out.push(row as OrbitdbEntry);
        return out;
    }

    private async touchDb(address: string): Promise<void> {
        const info = this.databases.find((d) => d.address === address);
        if (!info) return;
        info.lastActivityAt = new Date().toISOString();
        try {
            const db = this.dbHandles.get(address);
            if (db?.all) {
                const rows = await db.all();
                info.count = rows.length;
            }
        } catch { /* noop */ }
        this.onChange();
    }

    private upsertDb(info: OrbitdbDbInfo): void {
        const existing = this.databases.find((d) => d.address === info.address);
        if (existing) {
            Object.assign(existing, info);
        } else {
            this.databases.unshift(info);
            if (this.databases.length > DB_LIMIT) this.databases.length = DB_LIMIT;
        }
        this.onChange();
    }
}

class OrbitdbManager {
    private nodes = new Map<string, OrbitdbNode>();
    private order: string[] = [];
    private activeId: string | null = null;
    private listeners = new Set<ManagerListener>();
    private nextSeq = 1;

    constructor() {
        const persisted = loadPersistedManager();
        if (persisted && persisted.nodes.length > 0) {
            this.nextSeq = Math.max(persisted.nextSeq ?? 1, 1);
            for (const p of persisted.nodes) {
                const node = new OrbitdbNode(p.id, p.label, p.heliaNodeId ?? null, () => this.emit());
                node.databases = Array.isArray(p.databases)
                    ? p.databases.map((d) => ({ ...d, open: false }))
                    : [];
                this.nodes.set(p.id, node);
                this.order.push(p.id);
            }
            this.activeId = persisted.activeId && this.nodes.has(persisted.activeId)
                ? persisted.activeId
                : (this.order[0] ?? null);
        } else {
            this.addNode("OrbitDB 1");
        }

        // Re-emit when helia state changes (peer id, status) so consumers
        // see live updates without re-subscribing.
        heliaService.subscribe(() => this.emit());
    }

    subscribe(fn: ManagerListener): () => void {
        this.listeners.add(fn);
        try { fn(this.snapshot()); } catch { /* noop */ }
        return () => { this.listeners.delete(fn); };
    }

    snapshot(): OrbitdbManagerSnapshot {
        return {
            activeId: this.activeId,
            nodes: this.order
                .map((id) => this.nodes.get(id))
                .filter((n): n is OrbitdbNode => !!n)
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
                .filter((n): n is OrbitdbNode => !!n)
                .map((n) => n.toPersisted());
            savePersistedManager({
                activeId: this.activeId,
                nextSeq: this.nextSeq,
                nodes,
            });
        } catch (err) {
            logError("orbitdb.manager.persist", err, undefined, { warn: true });
        }
    }

    addNode(label?: string, heliaNodeId: string | null = null): string {
        const seq = this.nextSeq++;
        const id = `o-${seq}-${Math.random().toString(36).slice(2, 6)}`;
        const node = new OrbitdbNode(id, label ?? `OrbitDB ${seq}`, heliaNodeId, () => this.emit());
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
            logError("orbitdb.manager.removeNode.stop", err, { nodeId: id }, { warn: true });
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

    setHeliaBinding(id: string | undefined, heliaNodeId: string | null): void {
        this.getNode(id).setHeliaBinding(heliaNodeId);
    }

    listIds(): string[] { return [...this.order]; }
    getActiveId(): string | null { return this.activeId; }
    getNode(id?: string | null): OrbitdbNode {
        const target = id ?? this.activeId;
        if (!target) throw new Error("No active orbitdb node");
        const node = this.nodes.get(target);
        if (!node) throw new Error(`orbitdb node "${target}" not found`);
        return node;
    }

    // Convenience proxies — default to the active node.
    start(opts?: OrbitdbStartOptions, id?: string) { return this.getNode(id).start(opts); }
    stop(id?: string) { return this.getNode(id).stop(); }
    openDatabase(addressOrName: string, opts?: { type?: OrbitdbDbType; meta?: Record<string, unknown>; sync?: boolean; indexBy?: string }, id?: string) {
        return this.getNode(id).openDatabase(addressOrName, opts);
    }
    closeDatabase(address: string, id?: string) { return this.getNode(id).closeDatabase(address); }
    dropDatabase(address: string, id?: string) { return this.getNode(id).dropDatabase(address); }
    listDatabases(id?: string) { return this.getNode(id).listDatabases(); }
    kvPut(address: string, key: string, value: unknown, id?: string) { return this.getNode(id).kvPut(address, key, value); }
    kvGet(address: string, key: string, id?: string) { return this.getNode(id).kvGet(address, key); }
    kvDel(address: string, key: string, id?: string) { return this.getNode(id).kvDel(address, key); }
    eventAdd(address: string, value: unknown, id?: string) { return this.getNode(id).eventAdd(address, value); }
    docPut(address: string, doc: Record<string, unknown>, id?: string) { return this.getNode(id).docPut(address, doc); }
    docGet(address: string, key: string, id?: string) { return this.getNode(id).docGet(address, key); }
    docDel(address: string, key: string, id?: string) { return this.getNode(id).docDel(address, key); }
    docQuery(address: string, findFnSource: string, id?: string) { return this.getNode(id).docQuery(address, findFnSource); }
    all(address: string, id?: string) { return this.getNode(id).all(address); }
    iterate(address: string, opts: { amount?: number } | undefined, id?: string) { return this.getNode(id).iterate(address, opts ?? {}); }
}

export const orbitdbService = new OrbitdbManager();
export type { OrbitdbManager, OrbitdbNode };
