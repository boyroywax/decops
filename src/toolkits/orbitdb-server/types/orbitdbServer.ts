/**
 * OrbitDB Server Connector — runtime type definitions.
 *
 * Talks to a remote `orbitdb-server` instance (OrbitDB v2 HTTP RPC API) over
 * plain `fetch`. Each {@link OrbitdbServerNode} represents one endpoint
 * configuration plus a cached identity + database registry.
 *
 * Shape conventions mirror the kubo / helia / libp2p / orbitdb toolkits so
 * the UI layer can reuse the same patterns.
 */

export type OrbitdbServerStatus = "disconnected" | "connecting" | "connected" | "error";

/** OrbitDB v2 store types supported by the server. */
export type OrbitdbServerStoreType =
    | "events"
    | "documents"
    | "keyvalue"
    | "keyvalue-indexed";

export const ORBITDB_SERVER_STORE_TYPES: OrbitdbServerStoreType[] = [
    "events",
    "documents",
    "keyvalue",
    "keyvalue-indexed",
];

/** Persisted endpoint configuration for one orbitdb-server connection. */
export interface OrbitdbServerEndpointConfig {
    /** Base URL of the server (e.g. http://127.0.0.1:3000 or https://orbitdb.dvln.net). */
    url: string;
    /**
     * Optional Authorization header value (e.g. "Bearer …"). Sent verbatim.
     * Stored in localStorage — treat as a secret.
     */
    authorization?: string;
    /** Default request timeout in milliseconds. */
    timeoutMs?: number;
}

/** Identity / health block surfaced after a successful connect. */
export interface OrbitdbServerPeerInfo {
    /** libp2p peer id of the remote server. */
    peerId: string;
    /** DID (did:key) the server signs entries with. */
    did?: string;
    /** Listening multiaddrs reported by the server. */
    addresses?: string[];
    /** "private" or "public" — based on whether a swarm key is loaded. */
    pnetMode?: "private" | "public";
    /** Truncated fingerprint of the swarm key, when private. */
    pnetFingerprint?: string;
    /** Number of currently-connected libp2p peers. */
    connectedPeers?: number;
    /** Server version string, when reported. */
    serverVersion?: string;
}

/** Local snapshot of a single database opened against the server. */
export interface OrbitdbServerDatabaseEntry {
    /** Unique name (used as the `db` query param across the API). */
    name: string;
    /** Store type. */
    type: OrbitdbServerStoreType;
    /** ISO timestamp of when this UI first observed / created the db. */
    openedAt: string;
    /** ISO timestamp of the most recent successful operation. */
    lastActivityAt?: string;
    /** Local count of entries observed on the most recent `all` / `query`. */
    entryCount?: number;
    /** Last fetched preview rows (capped). */
    preview?: Array<{ key?: string; value: unknown; hash?: string }>;
    /** True when the server confirmed this db exists in its open list. */
    confirmedOnServer: boolean;
}

/** Snapshot describing a single orbitdb-server node, sent to React. */
export interface OrbitdbServerSnapshot {
    nodeId: string;
    label: string;
    status: OrbitdbServerStatus;
    error?: string;
    endpoint: string;
    authorization?: string;
    timeoutMs?: number;
    connectedAt?: string;
    peer: OrbitdbServerPeerInfo | null;
    databases: OrbitdbServerDatabaseEntry[];
    /** Recent peer multiaddrs returned by `swarm/peers`. */
    swarmPeers: Array<{ peerId: string; addr: string }>;
}

export interface OrbitdbServerManagerSnapshot {
    activeId: string | null;
    nodes: OrbitdbServerSnapshot[];
}

export interface OrbitdbServerConnectOptions {
    /** Override the configured endpoint URL for this attempt. */
    url?: string;
    /** Override the Authorization header. Pass empty string to clear. */
    authorization?: string;
    /** Override the default request timeout. */
    timeoutMs?: number;
}

/** Result of a list-databases call. */
export interface OrbitdbServerListResult {
    databases: Array<{ name: string; type: OrbitdbServerStoreType; address?: string }>;
}

/** Generic value envelope returned by put / add operations. */
export interface OrbitdbServerWriteResult {
    /** Entry hash (oplog hash) when reported by the server. */
    hash?: string;
    /** Optional id / key the entry was stored under. */
    key?: string;
}
