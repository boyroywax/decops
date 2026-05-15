/**
 * Helia (IPFS) toolkit — runtime type definitions.
 *
 * Mirrors the shape conventions of the libp2p toolkit so consumers can
 * import shape-only dependencies without pulling in the service singleton.
 */

export type HeliaStatus = "stopped" | "starting" | "running" | "stopping" | "error";

/** A single content entry that has been added to a Helia node. */
export interface HeliaContentEntry {
    /** Stringified CID (v1). */
    cid: string;
    /** Codec hint — "raw" | "dag-pb" | "dag-json" | … */
    codec?: string;
    /** Original byte size of the content, if known. */
    bytes?: number;
    /** Optional human label (file name, tag). */
    label?: string;
    /** When added (ISO timestamp). */
    addedAt: string;
    /** Convenience: short UTF-8 preview, capped to a few hundred chars. */
    preview?: string;
    /** When true, this CID is pinned and held against GC. */
    pinned: boolean;
    /** Source: "added" (added locally) | "fetched" (cat'd from remote). */
    source: "added" | "fetched";
}

/** Per-node snapshot returned to the React layer. */
export interface HeliaSnapshot {
    /** Local UI id of this Helia node. */
    nodeId: string;
    /** Human label. */
    label: string;
    /** Lifecycle status. */
    status: HeliaStatus;
    /** Last error message, if any. */
    error?: string;
    /** When the node was started (ISO). */
    startedAt?: string;
    /** Local id of the bound libp2p node (the network layer). May be null
     *  when no libp2p has been chosen yet — start() will spawn a fresh one. */
    libp2pNodeId: string | null;
    /** Libp2p peer id (taken from the bound libp2p node, when running). */
    peerId: string | null;
    /** All known content entries (most recent first). */
    entries: HeliaContentEntry[];
    /** Count of pinned CIDs. */
    pinnedCount: number;
    /** Total bytes added (sum of `bytes` across entries with bytes set). */
    totalBytes: number;
}

export interface HeliaStartOptions {
    /** Local libp2p node id to bind to. When omitted, a fresh libp2p node
     *  is created via the libp2p toolkit and started before Helia boots. */
    libp2pNodeId?: string;
    /** Optional label to use when auto-creating a new libp2p node. */
    newLibp2pLabel?: string;
}

export interface HeliaManagerSnapshot {
    activeId: string | null;
    nodes: HeliaSnapshot[];
}
