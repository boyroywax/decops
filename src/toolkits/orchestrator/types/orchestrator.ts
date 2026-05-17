/**
 * Orchestrator Toolkit — runtime type definitions.
 *
 * The Orchestrator is a meta-toolkit that drives the four L.O.H.K toolkits
 * (libp2p, helia, orbitdb, kubo) toward a desired state described by a
 * **manifest** stored as a workspace artifact (type "json").
 *
 * Manifests follow a kubectl-style schema:
 *
 *     apiVersion: orchestrator.decops.io/v1
 *     kind:       Stack
 *     metadata:   { name, namespace?, labels?, annotations? }
 *     spec:       { libp2p?, helia?, orbitdb?, kubo? }
 *     status?:    { phase?, lastAppliedAt?, lastReconcileAt?, observedResults? }
 *
 * The `spec.*` arrays use the exact option fields exposed by each
 * underlying toolkit's start/connect API, so a manifest can drive the
 * underlying services without any out-of-band configuration.
 */

import type {
    Libp2pServiceToggles,
    Libp2pDiscoveryToggles,
    Libp2pTransportToggles,
} from "@/toolkits/libp2p";

// ── Toolkit-runtime status (UI surface) ─────────────────────────────────

export type OrchestratorStatus =
    | "idle"
    | "applying"
    | "reconciling"
    | "drifted"
    | "healthy"
    | "error";

export type OrchestratorTarget = "libp2p" | "helia" | "orbitdb" | "kubo";

// ── kubectl-style manifest constants ────────────────────────────────────

export const ORCHESTRATOR_API_VERSION = "orchestrator.decops.io/v1";
export const ORCHESTRATOR_KIND = "Stack";

// ── Per-target specs (mirror each toolkit's StartOptions / ConnectOptions) ──

/** Spec for a single libp2p node. Mirrors `Libp2pStartOptions`. */
export interface OrchestratorLibp2pSpec {
    /** Manifest-local name. Also used as the runtime node label. */
    name: string;
    /** Auto-start after creation. */
    autoStart?: boolean;
    /** Replace the default bootstrap list entirely. */
    bootstrap?: string[];
    /** Remove specific entries from the default (or supplied) bootstrap list. */
    disabledBootstrap?: string[];
    services?: Libp2pServiceToggles;
    discovery?: Libp2pDiscoveryToggles;
    transports?: Libp2pTransportToggles;
    pubsubDiscoveryTopic?: string;
    /** Optional private network pre-shared key. */
    pnetKey?: string;
}

/** Spec for a single helia node. Mirrors `HeliaStartOptions`. */
export interface OrchestratorHeliaSpec {
    /** Manifest-local name. Also used as the runtime node label. */
    name: string;
    /** Auto-start after creation. */
    autoStart?: boolean;
    /**
     * Reference (by manifest name) to a libp2p spec in the same manifest.
     * Resolved at apply time to the runtime libp2p node id.
     */
    libp2pRef?: string;
    /** Label to use when auto-creating a new libp2p node. */
    newLibp2pLabel?: string;
}

/** Spec for a single orbitdb node. Mirrors `OrbitdbStartOptions`. */
export interface OrchestratorOrbitdbSpec {
    /** Manifest-local name. Also used as the runtime node label. */
    name: string;
    /** Auto-start after creation. */
    autoStart?: boolean;
    /** Reference (by manifest name) to a helia spec in the same manifest. */
    heliaRef?: string;
    /** Optional identity id (deterministic across restarts). */
    identityId?: string;
    /** Optional storage directory (browser: opfs / indexeddb path). */
    directory?: string;
}

/** Spec for a single kubo (remote IPFS RPC) node. Mirrors `KuboConnectOptions`. */
export interface OrchestratorKuboSpec {
    /** Manifest-local name. Also used as the runtime node label. */
    name: string;
    /** Auto-connect after creation. */
    autoStart?: boolean;
    /** Endpoint URL for the Kubo HTTP RPC daemon. */
    url?: string;
    /** Optional Authorization header. */
    authorization?: string;
    /** Optional RPC timeout in milliseconds. */
    timeoutMs?: number;
}

// ── Top-level manifest ──────────────────────────────────────────────────

export interface OrchestratorManifestMetadata {
    /** Human-readable manifest name (required, used as document title). */
    name: string;
    /** Optional namespace (free-form, defaults to "default"). */
    namespace?: string;
    /** Optional key/value labels. */
    labels?: Record<string, string>;
    /** Optional key/value annotations (longer values, non-identifying). */
    annotations?: Record<string, string>;
}

export interface OrchestratorManifestSpec {
    libp2p?: OrchestratorLibp2pSpec[];
    helia?: OrchestratorHeliaSpec[];
    orbitdb?: OrchestratorOrbitdbSpec[];
    kubo?: OrchestratorKuboSpec[];
}

export interface OrchestratorManifestStatus {
    /** Last observed phase. */
    phase?: OrchestratorStatus;
    /** ISO timestamp of last apply. */
    lastAppliedAt?: string;
    /** ISO timestamp of last reconcile. */
    lastReconcileAt?: string;
    /** Last apply/reconcile results. */
    observedResults?: OrchestratorOperationResult[];
}

/**
 * Top-level kubectl-style manifest.
 *
 * The `apiVersion` and `kind` fields are required and pinned for the v1
 * schema. The `status` block is optional and may be omitted when
 * authoring; the orchestrator will populate it when exporting.
 */
export interface OrchestratorManifest {
    apiVersion: typeof ORCHESTRATOR_API_VERSION;
    kind: typeof ORCHESTRATOR_KIND;
    metadata: OrchestratorManifestMetadata;
    spec: OrchestratorManifestSpec;
    status?: OrchestratorManifestStatus;
}

// ── Operation result ────────────────────────────────────────────────────

/** Result of applying / reconciling a single spec. */
export interface OrchestratorOperationResult {
    target: OrchestratorTarget;
    /** Manifest-local `spec.<target>[].name`. */
    specId: string;
    /** Runtime node id assigned/found in the underlying service. */
    runtimeNodeId?: string;
    action: "created" | "updated" | "started" | "stopped" | "connected" | "noop" | "failed";
    ok: boolean;
    message?: string;
    error?: string;
    at: string;
}

// ── Snapshot for the React layer ────────────────────────────────────────

/** Snapshot describing a single orchestrator profile, sent to the React layer. */
export interface OrchestratorSnapshot {
    nodeId: string;
    label: string;
    status: OrchestratorStatus;
    /** Artifact id of the manifest this profile should apply. */
    manifestArtifactId: string | null;
    /** Cached `metadata.name` pulled from the artifact at last read. */
    manifestName?: string;
    /** Cached `apiVersion` pulled from the artifact at last read. */
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
