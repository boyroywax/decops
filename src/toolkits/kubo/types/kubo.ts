/**
 * Kubo IPFS Connector — runtime type definitions.
 *
 * The toolkit talks to a remote `kubo` (go-ipfs) daemon over its HTTP RPC
 * API using the `kubo-rpc-client` package. Each {@link KuboNode} represents
 * a single endpoint configuration plus a connected client instance.
 *
 * Shape conventions mirror the helia / libp2p / orbitdb toolkits so the
 * UI layer can reuse the same patterns.
 */

export type KuboStatus = "disconnected" | "connecting" | "connected" | "error";

/** Persisted endpoint configuration for one Kubo connection. */
export interface KuboEndpointConfig {
    /** Base URL of the Kubo HTTP RPC API (e.g. http://127.0.0.1:5001). */
    url: string;
    /**
     * Optional Authorization header value (e.g. "Bearer …" or
     * "Basic base64(user:pass)"). Sent verbatim — store responsibly.
     */
    authorization?: string;
    /**
     * Default request timeout in milliseconds. Applied to all RPCs that
     * accept the kubo-rpc-client `timeout` option.
     */
    timeoutMs?: number;
}

/** Per-CID content metadata tracked client-side for the Activity view. */
export interface KuboContentEntry {
    /** Stringified CID (whatever Kubo returned). */
    cid: string;
    /** Optional human label / file name. */
    label?: string;
    /** Total content size in bytes, if known. */
    bytes?: number;
    /** Short UTF-8 preview, capped to a few hundred chars. */
    preview?: string;
    /** True when this CID is pinned on the remote node. */
    pinned: boolean;
    /** "added" — uploaded from this UI; "fetched" — pulled with cat/get. */
    source: "added" | "fetched";
    /** ISO timestamp of the most recent activity for this CID. */
    addedAt: string;
}

/** Identity / version block surfaced after a successful connect. */
export interface KuboPeerInfo {
    /** Remote peer id (libp2p). */
    peerId: string;
    /** Public key (base64 / multibase, as returned by Kubo). */
    publicKey?: string;
    /** Remote node version string (e.g. "kubo 0.27.0"). */
    agentVersion?: string;
    /** Protocol version. */
    protocolVersion?: string;
    /** Multiaddrs the remote node is listening on. */
    addresses?: string[];
    /** Count of currently-connected libp2p peers (remote-side). */
    connectedPeers?: number;
}

/** Snapshot describing a single Kubo node, sent to the React layer. */
export interface KuboSnapshot {
    /** Local UI id of this node. */
    nodeId: string;
    /** Human label. */
    label: string;
    /** Lifecycle status. */
    status: KuboStatus;
    /** Last error, if any. */
    error?: string;
    /** Endpoint URL the client is bound to. */
    endpoint: string;
    /** Saved Authorization header value (sent verbatim on connect). */
    authorization?: string;
    /** Default RPC timeout in milliseconds. */
    timeoutMs?: number;
    /** When the connect handshake last succeeded (ISO). */
    connectedAt?: string;
    /** Remote node identity (filled after a successful connect/refresh). */
    peer: KuboPeerInfo | null;
    /** Recent content activity (added / fetched). */
    entries: KuboContentEntry[];
    /** Count of pinned CIDs (tracked locally — Kubo's pin/ls is authoritative). */
    pinnedCount: number;
    /** Total bytes seen across `entries` (where known). */
    totalBytes: number;
}

export interface KuboManagerSnapshot {
    activeId: string | null;
    nodes: KuboSnapshot[];
}

export interface KuboConnectOptions {
    /** Override the configured endpoint URL for this connect attempt. */
    url?: string;
    /** Override the Authorization header. Pass empty string to clear. */
    authorization?: string;
    /** Override the default RPC timeout. */
    timeoutMs?: number;
}
