/**
 * OrbitDB toolkit — runtime type definitions.
 *
 * Mirrors the shape conventions of the helia/libp2p toolkits so consumers
 * can import shape-only deps without pulling in the service singleton.
 */

export type OrbitdbStatus = "stopped" | "starting" | "running" | "stopping" | "error";

/** Supported OrbitDB database types. `keyvalue-indexed` is built-in too. */
export type OrbitdbDbType = "events" | "keyvalue" | "keyvalue-indexed" | "documents";

/** Local UI metadata for a single OrbitDB-managed database. */
export interface OrbitdbDbInfo {
    /** OrbitDB address (`/orbitdb/<hash>`). */
    address: string;
    /** Human name (the part before `/` in the manifest name). */
    name: string;
    /** Database type. */
    type: OrbitdbDbType;
    /** Manifest meta payload, if any. */
    meta?: Record<string, unknown>;
    /** Cached entry / document count (best-effort, refreshed on operations). */
    count?: number;
    /** ISO timestamp of last activity (open / write / refresh). */
    lastActivityAt?: string;
    /** When true, this database is currently open and writable. */
    open: boolean;
    /** documents-only: field used as the primary key. */
    indexBy?: string;
}

/** Per-node snapshot returned to the React layer. */
export interface OrbitdbSnapshot {
    /** Local UI id of this OrbitDB node. */
    nodeId: string;
    /** Human label. */
    label: string;
    /** Lifecycle status. */
    status: OrbitdbStatus;
    /** Last error, if any. */
    error?: string;
    /** When the node was started (ISO). */
    startedAt?: string;
    /** Helia node id this OrbitDB is bound to. May be null when no helia
     *  has been chosen — start() will reuse the active helia node. */
    heliaNodeId: string | null;
    /** Libp2p peer id (taken from the underlying helia/libp2p, when running). */
    peerId: string | null;
    /** OrbitDB identity id (public key fingerprint), when running. */
    identityId: string | null;
    /** True when running with a non-persistent in-memory keystore
     *  (IndexedDB was unavailable in this context — identity will
     *  be regenerated on next start). */
    usingMemoryKeystore?: boolean;
    /** Open / known databases for this node. */
    databases: OrbitdbDbInfo[];
}

export interface OrbitdbStartOptions {
    /** Local helia node id to bind to. Defaults to the active helia node. */
    heliaNodeId?: string;
    /** Optional identity id to use (deterministic across restarts). */
    identityId?: string;
    /** Optional storage directory (browser: opfs / indexeddb path). */
    directory?: string;
}

export interface OrbitdbManagerSnapshot {
    activeId: string | null;
    nodes: OrbitdbSnapshot[];
}

/** A single entry returned from a database iterator / query. */
export interface OrbitdbEntry {
    /** Log entry hash (CID). */
    hash?: string;
    /** Key (kv / documents). */
    key?: string;
    /** Decoded value. */
    value: unknown;
}
