/**
 * Orchestrator Toolkit — runtime type definitions.
 *
 * The Orchestrator is a meta-toolkit that drives the four L.O.H.K toolkits
 * (libp2p, helia, orbitdb, kubo) toward a desired state described by a
 * **manifest** stored as a workspace artifact (type "json").
 *
 * Each {@link OrchestratorNode} represents one orchestration profile —
 * e.g. "production", "staging" — pointing at a manifest artifact id.
 * Applying the manifest reads the artifact, parses it, and brings each
 * declared sub-node to the desired state via the underlying toolkit
 * services' public APIs.
 *
 * Shape conventions mirror libp2p / helia / kubo / orbitdb.
 */

export type OrchestratorStatus =
    | "idle"
    | "applying"
    | "reconciling"
    | "drifted"
    | "healthy"
    | "error";

export type OrchestratorTarget = "libp2p" | "helia" | "orbitdb" | "kubo";

/** Declarative spec for a single sub-node inside a manifest. */
export interface OrchestratorNodeSpec {
    /**
     * Local id for the sub-node within the manifest. Used to correlate
     * applied state across runs. (Different from the runtime node ids
     * assigned by each underlying service.)
     */
    id: string;
    /** Human label for the sub-node. */
    label?: string;
    /** Auto-start (libp2p/helia/orbitdb) or auto-connect (kubo) after applying. */
    autoStart?: boolean;
    /** Bindings to other sub-nodes in the same manifest (by spec id). */
    bindings?: {
        /** Helia/Orbitdb: id of the libp2p sub-node this node binds to. */
        libp2p?: string;
        /** Orbitdb: id of the helia sub-node this node binds to. */
        helia?: string;
    };
    /** Free-form config payload passed to the underlying service. */
    config?: Record<string, unknown>;
}

/** Top-level manifest schema. */
export interface OrchestratorManifest {
    /** Schema/version tag (e.g. "1"). */
    version: string;
    name: string;
    description?: string;
    libp2p?: OrchestratorNodeSpec[];
    helia?: OrchestratorNodeSpec[];
    orbitdb?: OrchestratorNodeSpec[];
    kubo?: OrchestratorNodeSpec[];
    createdAt?: string;
    updatedAt?: string;
}

/** Result of applying / reconciling a single spec. */
export interface OrchestratorOperationResult {
    target: OrchestratorTarget;
    specId: string;
    /** Runtime node id assigned/found in the underlying service. */
    runtimeNodeId?: string;
    action: "created" | "updated" | "started" | "stopped" | "connected" | "noop" | "failed";
    ok: boolean;
    message?: string;
    error?: string;
    at: string;
}

/** Snapshot describing a single orchestrator node, sent to the React layer. */
export interface OrchestratorSnapshot {
    nodeId: string;
    label: string;
    status: OrchestratorStatus;
    /** Artifact id of the manifest this node should apply. */
    manifestArtifactId: string | null;
    /** Optional cached manifest name pulled from the artifact at last apply. */
    manifestName?: string;
    /** Optional cached manifest version pulled from the artifact at last apply. */
    manifestVersion?: string;
    error?: string;
    /** ISO timestamp of the last successful apply. */
    lastAppliedAt?: string;
    /** ISO timestamp of the last reconcile. */
    lastReconcileAt?: string;
    /** Rolling log of operation results from the last apply / reconcile. */
    results: OrchestratorOperationResult[];
    /** Count of unacknowledged drift entries (used for footer alert badge). */
    pendingDrift: number;
}

export interface OrchestratorManagerSnapshot {
    activeId: string | null;
    nodes: OrchestratorSnapshot[];
}
