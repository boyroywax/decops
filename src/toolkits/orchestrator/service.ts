/**
 * Orchestrator Service — drives the four L.O.H.K toolkits (libp2p, helia,
 * orbitdb, kubo) toward a kubectl-style desired-state manifest stored as
 * a workspace artifact.
 *
 * Architecture mirrors the canonical toolkit-service pattern (helia / kubo
 * / orbitdb): one {@link OrchestratorManager} singleton owns N
 * {@link OrchestratorNode} instances (a.k.a. profiles / stacks), each
 * persisted to localStorage and mirrored into React via `snapshot()` +
 * `subscribe()`.
 *
 * The orchestrator does NOT own libp2p/helia/orbitdb/kubo state. It only
 * orchestrates them via their public service APIs. The manifest is NEVER
 * stored inside this service — only an `manifestArtifactId` reference is
 * persisted; manifest content is read on demand from the artifacts
 * subsystem via an artifact provider injected by the React layer.
 */

import type { JobArtifact } from "@/types";
import { libp2pService } from "@/toolkits/libp2p";
import type { Libp2pStartOptions } from "@/toolkits/libp2p";
import { heliaService } from "@/toolkits/helia";
import { orbitdbService } from "@/toolkits/orbitdb";
import { kuboService } from "@/toolkits/kubo";
import {
    ORCHESTRATOR_API_VERSION,
    ORCHESTRATOR_KIND,
} from "./types/orchestrator";
import type {
    OrchestratorStatus,
    OrchestratorSnapshot,
    OrchestratorManagerSnapshot,
    OrchestratorManifest,
    OrchestratorOperationResult,
    OrchestratorTarget,
    OrchestratorLibp2pSpec,
    OrchestratorHeliaSpec,
    OrchestratorOrbitdbSpec,
    OrchestratorKuboSpec,
} from "./types/orchestrator";

type ManagerListener = (state: OrchestratorManagerSnapshot) => void;

const NODES_STORAGE_KEY = "decops:orchestrator-nodes:v1";
const RESULT_LIMIT = 200;
const DEFAULT_NAMESPACE = "default";

interface PersistedNode {
    id: string;
    label: string;
    manifestArtifactId: string | null;
    manifestName?: string;
    manifestVersion?: string;
    lastAppliedAt?: string;
    lastReconcileAt?: string;
    results: OrchestratorOperationResult[];
}

interface PersistedManager {
    activeId: string | null;
    nextSeq: number;
    nodes: PersistedNode[];
}

/** Pluggable accessor for the artifacts subsystem (injected by the React layer). */
export interface OrchestratorArtifactProvider {
    /** Return the artifact body for the given id, or null if missing. */
    getArtifact: (id: string) => JobArtifact | null;
    /** Persist a new artifact (creates a new id if not provided). */
    importArtifact: (artifact: JobArtifact) => void;
    /** List candidate manifest artifacts (type "json" with the orchestrator tag). */
    listManifestArtifacts: () => JobArtifact[];
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

/**
 * Parse a manifest artifact body into a validated {@link OrchestratorManifest}.
 *
 * Accepts the canonical kubectl-style shape only:
 *
 *     { apiVersion, kind, metadata: { name, ... }, spec: { ... }, status? }
 */
function parseManifest(content: string | undefined): OrchestratorManifest | null {
    if (!content) return null;
    try {
        const parsed = JSON.parse(content);
        if (!parsed || typeof parsed !== "object") return null;
        if (parsed.apiVersion !== ORCHESTRATOR_API_VERSION) return null;
        if (parsed.kind !== ORCHESTRATOR_KIND) return null;
        if (!parsed.metadata || typeof parsed.metadata.name !== "string") return null;
        if (!parsed.spec || typeof parsed.spec !== "object") return null;
        return parsed as OrchestratorManifest;
    } catch { return null; }
}

function nowIso(): string { return new Date().toISOString(); }

export class OrchestratorNode {
    readonly id: string;
    label: string;
    manifestArtifactId: string | null = null;
    manifestName?: string;
    manifestVersion?: string;
    results: OrchestratorOperationResult[] = [];
    lastAppliedAt?: string;
    lastReconcileAt?: string;

    private status: OrchestratorStatus = "idle";
    private error?: string;
    private pendingDrift = 0;
    private onChange: () => void;

    constructor(id: string, label: string, onChange: () => void) {
        this.id = id;
        this.label = label;
        this.onChange = onChange;
    }

    snapshot(): OrchestratorSnapshot {
        return {
            nodeId: this.id,
            label: this.label,
            status: this.status,
            manifestArtifactId: this.manifestArtifactId,
            manifestName: this.manifestName,
            manifestVersion: this.manifestVersion,
            error: this.error,
            lastAppliedAt: this.lastAppliedAt,
            lastReconcileAt: this.lastReconcileAt,
            results: this.results.slice(),
            pendingDrift: this.pendingDrift,
        };
    }

    toPersisted(): PersistedNode {
        return {
            id: this.id,
            label: this.label,
            manifestArtifactId: this.manifestArtifactId,
            manifestName: this.manifestName,
            manifestVersion: this.manifestVersion,
            lastAppliedAt: this.lastAppliedAt,
            lastReconcileAt: this.lastReconcileAt,
            results: this.results.slice(0, RESULT_LIMIT),
        };
    }

    setLabel(label: string): void {
        this.label = label;
        this.onChange();
    }

    setManifestArtifactId(id: string | null): void {
        this.manifestArtifactId = id;
        this.manifestName = undefined;
        this.manifestVersion = undefined;
        this.error = undefined;
        this.onChange();
    }

    setStatus(status: OrchestratorStatus, error?: string): void {
        this.status = status;
        this.error = error;
        this.onChange();
    }

    pushResult(r: OrchestratorOperationResult): void {
        this.results.unshift(r);
        if (this.results.length > RESULT_LIMIT) this.results.length = RESULT_LIMIT;
        if (!r.ok) this.pendingDrift += 1;
        this.onChange();
    }

    clearResults(): void {
        this.results = [];
        this.pendingDrift = 0;
        this.onChange();
    }

    acknowledgeDrift(): void {
        this.pendingDrift = 0;
        this.onChange();
    }
}

class OrchestratorManager {
    private nodes = new Map<string, OrchestratorNode>();
    private activeId: string | null = null;
    private nextSeq = 1;
    private listeners = new Set<ManagerListener>();
    private artifactProvider: OrchestratorArtifactProvider | null = null;

    constructor() {
        const persisted = loadPersistedManager();
        if (persisted) {
            this.nextSeq = persisted.nextSeq;
            for (const p of persisted.nodes) {
                const node = new OrchestratorNode(p.id, p.label, () => this.emit());
                node.manifestArtifactId = p.manifestArtifactId;
                node.manifestName = p.manifestName;
                node.manifestVersion = p.manifestVersion;
                node.lastAppliedAt = p.lastAppliedAt;
                node.lastReconcileAt = p.lastReconcileAt;
                node.results = p.results ?? [];
                this.nodes.set(p.id, node);
            }
            this.activeId = persisted.activeId;
        }
        if (this.nodes.size === 0) {
            const id = this.addNode("Default Stack");
            this.activeId = id;
        }
        if (!this.activeId || !this.nodes.has(this.activeId)) {
            this.activeId = this.nodes.keys().next().value ?? null;
        }
    }

    // ── React layer wiring ──

    setArtifactProvider(provider: OrchestratorArtifactProvider | null): void {
        this.artifactProvider = provider;
    }

    private requireArtifactProvider(): OrchestratorArtifactProvider {
        if (!this.artifactProvider) {
            throw new Error(
                "Orchestrator: artifact provider not yet attached. Open the Orchestrator view at least once.",
            );
        }
        return this.artifactProvider;
    }

    // ── Manager state ──

    subscribe(fn: ManagerListener): () => void {
        this.listeners.add(fn);
        fn(this.snapshot());
        return () => { this.listeners.delete(fn); };
    }

    snapshot(): OrchestratorManagerSnapshot {
        return {
            activeId: this.activeId,
            nodes: Array.from(this.nodes.values()).map((n) => n.snapshot()),
        };
    }

    private emit(): void {
        const persisted: PersistedManager = {
            activeId: this.activeId,
            nextSeq: this.nextSeq,
            nodes: Array.from(this.nodes.values()).map((n) => n.toPersisted()),
        };
        savePersistedManager(persisted);
        const snap = this.snapshot();
        for (const fn of this.listeners) fn(snap);
    }

    getActiveId(): string | null { return this.activeId; }

    getNode(id?: string): OrchestratorNode {
        const target = id ?? this.activeId;
        if (!target) throw new Error("No active orchestrator node");
        const node = this.nodes.get(target);
        if (!node) throw new Error(`Orchestrator node not found: ${target}`);
        return node;
    }

    addNode(label?: string): string {
        const id = `orch-${this.nextSeq++}`;
        const node = new OrchestratorNode(id, label ?? `Stack ${this.nextSeq - 1}`, () => this.emit());
        this.nodes.set(id, node);
        if (!this.activeId) this.activeId = id;
        this.emit();
        return id;
    }

    async removeNode(id: string): Promise<void> {
        const node = this.nodes.get(id);
        if (!node) return;
        this.nodes.delete(id);
        if (this.activeId === id) {
            this.activeId = this.nodes.keys().next().value ?? null;
        }
        this.emit();
    }

    setActive(id: string): void {
        if (!this.nodes.has(id)) throw new Error(`Orchestrator node not found: ${id}`);
        this.activeId = id;
        this.emit();
    }

    setLabel(id: string | undefined, label: string): void {
        this.getNode(id).setLabel(label);
    }

    setManifestArtifact(id: string | undefined, artifactId: string | null): void {
        this.getNode(id).setManifestArtifactId(artifactId);
    }

    clearResults(id?: string): void {
        this.getNode(id).clearResults();
    }

    acknowledgeDrift(id?: string): void {
        this.getNode(id).acknowledgeDrift();
    }

    // ── Manifest read / load ──

    /** Read & parse the manifest currently selected by a node. */
    readManifest(id?: string): OrchestratorManifest {
        const node = this.getNode(id);
        if (!node.manifestArtifactId) {
            throw new Error(`Orchestrator[${node.label}] has no manifest selected.`);
        }
        const provider = this.requireArtifactProvider();
        const artifact = provider.getArtifact(node.manifestArtifactId);
        if (!artifact) {
            throw new Error(`Manifest artifact not found: ${node.manifestArtifactId}`);
        }
        const manifest = parseManifest(artifact.content);
        if (!manifest) {
            throw new Error(
                `Manifest artifact is not a valid ${ORCHESTRATOR_KIND} (apiVersion ${ORCHESTRATOR_API_VERSION}).`,
            );
        }
        node.manifestName = manifest.metadata.name;
        node.manifestVersion = manifest.apiVersion;
        return manifest;
    }

    // ── Apply / Reconcile / Export ──

    /**
     * Apply the manifest: bring each declared sub-node to its desired state.
     * For each target group (libp2p, helia, orbitdb, kubo) ensure a runtime
     * node exists with a matching label, then optionally start / connect it
     * with the spec's typed options.
     */
    async applyManifest(id?: string): Promise<OrchestratorOperationResult[]> {
        const node = this.getNode(id);
        node.setStatus("applying");
        try {
            const manifest = this.readManifest(id);
            const results: OrchestratorOperationResult[] = [];

            await this.applyLibp2p(manifest.spec.libp2p, results);
            await this.applyHelia(manifest.spec.helia, results);
            await this.applyOrbitdb(manifest.spec.orbitdb, results);
            await this.applyKubo(manifest.spec.kubo, results);

            for (const r of results) node.pushResult(r);
            node.lastAppliedAt = nowIso();
            const anyFailed = results.some((r) => !r.ok);
            node.setStatus(anyFailed ? "drifted" : "healthy", anyFailed ? "One or more operations failed." : undefined);
            return results;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            node.setStatus("error", msg);
            throw err;
        }
    }

    private async applyLibp2p(
        specs: OrchestratorLibp2pSpec[] | undefined,
        results: OrchestratorOperationResult[],
    ): Promise<void> {
        if (!specs) return;
        for (const spec of specs) {
            try {
                const snap = libp2pService.snapshot();
                let existing = snap.nodes.find((n) => n.label === spec.name) ?? null;
                let runtimeNodeId: string;
                let action: OrchestratorOperationResult["action"] = "noop";
                if (!existing) {
                    runtimeNodeId = libp2pService.addNode(spec.name);
                    action = "created";
                } else {
                    runtimeNodeId = existing.nodeId;
                }
                if (spec.autoStart) {
                    const ns = libp2pService.snapshot().nodes.find((n) => n.nodeId === runtimeNodeId);
                    if (ns && ns.status !== "running" && ns.status !== "starting") {
                        const opts: Libp2pStartOptions = {
                            bootstrap: spec.bootstrap,
                            disabledBootstrap: spec.disabledBootstrap,
                            services: spec.services,
                            discovery: spec.discovery,
                            transports: spec.transports,
                            pubsubDiscoveryTopic: spec.pubsubDiscoveryTopic,
                            pnetKey: spec.pnetKey,
                        };
                        await libp2pService.start(opts, runtimeNodeId);
                        action = "started";
                    }
                }
                results.push({ target: "libp2p", specId: spec.name, runtimeNodeId, action, ok: true, at: nowIso() });
            } catch (err) {
                results.push({
                    target: "libp2p", specId: spec.name, action: "failed", ok: false,
                    error: err instanceof Error ? err.message : String(err), at: nowIso(),
                });
            }
        }
    }

    private async applyHelia(
        specs: OrchestratorHeliaSpec[] | undefined,
        results: OrchestratorOperationResult[],
    ): Promise<void> {
        if (!specs) return;
        for (const spec of specs) {
            try {
                const snap = heliaService.snapshot();
                let existing = snap.nodes.find((n) => n.label === spec.name) ?? null;
                let runtimeNodeId: string;
                let action: OrchestratorOperationResult["action"] = "noop";
                if (!existing) {
                    let libp2pRuntimeId: string | null = null;
                    if (spec.libp2pRef) {
                        const lp = libp2pService.snapshot().nodes.find((n) => n.label === spec.libp2pRef);
                        libp2pRuntimeId = lp?.nodeId ?? null;
                    }
                    runtimeNodeId = heliaService.addNode(spec.name, libp2pRuntimeId);
                    action = "created";
                } else {
                    runtimeNodeId = existing.nodeId;
                }
                if (spec.autoStart) {
                    const ns = heliaService.snapshot().nodes.find((n) => n.nodeId === runtimeNodeId);
                    if (ns && ns.status !== "running" && ns.status !== "starting") {
                        let libp2pRuntimeId: string | undefined;
                        if (spec.libp2pRef) {
                            const lp = libp2pService.snapshot().nodes.find((n) => n.label === spec.libp2pRef);
                            libp2pRuntimeId = lp?.nodeId;
                        }
                        await heliaService.start({
                            libp2pNodeId: libp2pRuntimeId,
                            newLibp2pLabel: spec.newLibp2pLabel,
                        }, runtimeNodeId);
                        action = "started";
                    }
                }
                results.push({ target: "helia", specId: spec.name, runtimeNodeId, action, ok: true, at: nowIso() });
            } catch (err) {
                results.push({
                    target: "helia", specId: spec.name, action: "failed", ok: false,
                    error: err instanceof Error ? err.message : String(err), at: nowIso(),
                });
            }
        }
    }

    private async applyOrbitdb(
        specs: OrchestratorOrbitdbSpec[] | undefined,
        results: OrchestratorOperationResult[],
    ): Promise<void> {
        if (!specs) return;
        for (const spec of specs) {
            try {
                const snap = orbitdbService.snapshot();
                let existing = snap.nodes.find((n) => n.label === spec.name) ?? null;
                let runtimeNodeId: string;
                let action: OrchestratorOperationResult["action"] = "noop";
                if (!existing) {
                    let heliaRuntimeId: string | null = null;
                    if (spec.heliaRef) {
                        const hn = heliaService.snapshot().nodes.find((n) => n.label === spec.heliaRef);
                        heliaRuntimeId = hn?.nodeId ?? null;
                    }
                    runtimeNodeId = orbitdbService.addNode(spec.name, heliaRuntimeId);
                    action = "created";
                } else {
                    runtimeNodeId = existing.nodeId;
                }
                if (spec.autoStart) {
                    const ns = orbitdbService.snapshot().nodes.find((n) => n.nodeId === runtimeNodeId);
                    if (ns && ns.status !== "running" && ns.status !== "starting") {
                        let heliaRuntimeId: string | undefined;
                        if (spec.heliaRef) {
                            const hn = heliaService.snapshot().nodes.find((n) => n.label === spec.heliaRef);
                            heliaRuntimeId = hn?.nodeId;
                        }
                        await orbitdbService.start({
                            heliaNodeId: heliaRuntimeId,
                            identityId: spec.identityId,
                            directory: spec.directory,
                        }, runtimeNodeId);
                        action = "started";
                    }
                }
                results.push({ target: "orbitdb", specId: spec.name, runtimeNodeId, action, ok: true, at: nowIso() });
            } catch (err) {
                results.push({
                    target: "orbitdb", specId: spec.name, action: "failed", ok: false,
                    error: err instanceof Error ? err.message : String(err), at: nowIso(),
                });
            }
        }
    }

    private async applyKubo(
        specs: OrchestratorKuboSpec[] | undefined,
        results: OrchestratorOperationResult[],
    ): Promise<void> {
        if (!specs) return;
        for (const spec of specs) {
            try {
                const snap = kuboService.snapshot();
                let existing = snap.nodes.find((n) => n.label === spec.name) ?? null;
                let runtimeNodeId: string;
                let action: OrchestratorOperationResult["action"] = "noop";
                if (!existing) {
                    runtimeNodeId = kuboService.addNode(spec.name, spec.url);
                    action = "created";
                } else {
                    runtimeNodeId = existing.nodeId;
                }
                if (spec.autoStart) {
                    const ns = kuboService.snapshot().nodes.find((n) => n.nodeId === runtimeNodeId);
                    if (ns && ns.status !== "connected" && ns.status !== "connecting") {
                        await kuboService.connect({
                            url: spec.url,
                            authorization: spec.authorization,
                            timeoutMs: spec.timeoutMs,
                        }, runtimeNodeId);
                        action = "connected";
                    }
                }
                results.push({ target: "kubo", specId: spec.name, runtimeNodeId, action, ok: true, at: nowIso() });
            } catch (err) {
                results.push({
                    target: "kubo", specId: spec.name, action: "failed", ok: false,
                    error: err instanceof Error ? err.message : String(err), at: nowIso(),
                });
            }
        }
    }

    /**
     * Compare current state against the manifest and produce a drift report.
     * Does NOT mutate the underlying toolkits.
     */
    async reconcile(id?: string): Promise<OrchestratorOperationResult[]> {
        const node = this.getNode(id);
        node.setStatus("reconciling");
        try {
            const manifest = this.readManifest(id);
            const results: OrchestratorOperationResult[] = [];

            this.reconcileTarget("libp2p", manifest.spec.libp2p, results, libp2pService.snapshot().nodes);
            this.reconcileTarget("helia", manifest.spec.helia, results, heliaService.snapshot().nodes);
            this.reconcileTarget("orbitdb", manifest.spec.orbitdb, results, orbitdbService.snapshot().nodes);
            this.reconcileTarget("kubo", manifest.spec.kubo, results, kuboService.snapshot().nodes);

            for (const r of results) node.pushResult(r);
            node.lastReconcileAt = nowIso();
            const drifted = results.some((r) => !r.ok);
            node.setStatus(drifted ? "drifted" : "healthy", drifted ? "Drift detected." : undefined);
            return results;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            node.setStatus("error", msg);
            throw err;
        }
    }

    private reconcileTarget(
        target: OrchestratorTarget,
        specs: Array<{ name: string; autoStart?: boolean }> | undefined,
        results: OrchestratorOperationResult[],
        runtimeNodes: Array<{ label: string; nodeId: string; status: string }>,
    ): void {
        if (!specs) return;
        for (const spec of specs) {
            const existing = runtimeNodes.find((n) => n.label === spec.name) ?? null;
            if (!existing) {
                results.push({
                    target, specId: spec.name, action: "failed", ok: false,
                    message: `Missing runtime node (expected label "${spec.name}")`,
                    at: nowIso(),
                });
                continue;
            }
            if (spec.autoStart) {
                const desiredOk = target === "kubo"
                    ? existing.status === "connected"
                    : existing.status === "running";
                if (!desiredOk) {
                    results.push({
                        target, specId: spec.name, runtimeNodeId: existing.nodeId,
                        action: "failed", ok: false,
                        message: `Expected ${target === "kubo" ? "connected" : "running"}, got "${existing.status}"`,
                        at: nowIso(),
                    });
                    continue;
                }
            }
            results.push({
                target, specId: spec.name, runtimeNodeId: existing.nodeId,
                action: "noop", ok: true,
                at: nowIso(),
            });
        }
    }

    /**
     * Build a kubectl-style manifest from the current live state across all
     * four toolkits. The result is ready to be saved as a JSON artifact.
     */
    exportManifest(name = "Exported Stack", namespace = DEFAULT_NAMESPACE): OrchestratorManifest {
        const libp2p: OrchestratorLibp2pSpec[] = libp2pService.snapshot().nodes.map((n) => ({
            name: n.label,
            autoStart: n.status === "running" || n.status === "starting",
        }));
        const helia: OrchestratorHeliaSpec[] = heliaService.snapshot().nodes.map((n) => {
            // Best-effort libp2p binding by matching the runtime libp2p node id.
            const lp = libp2pService.snapshot().nodes.find((l) => l.nodeId === n.libp2pNodeId);
            return {
                name: n.label,
                autoStart: n.status === "running" || n.status === "starting",
                ...(lp ? { libp2pRef: lp.label } : {}),
            };
        });
        const orbitdb: OrchestratorOrbitdbSpec[] = orbitdbService.snapshot().nodes.map((n) => {
            const hn = heliaService.snapshot().nodes.find((h) => h.nodeId === n.heliaNodeId);
            return {
                name: n.label,
                autoStart: n.status === "running" || n.status === "starting",
                ...(hn ? { heliaRef: hn.label } : {}),
                ...(n.identityId ? { identityId: n.identityId } : {}),
            };
        });
        const kubo: OrchestratorKuboSpec[] = kuboService.snapshot().nodes.map((n) => ({
            name: n.label,
            autoStart: n.status === "connected" || n.status === "connecting",
            ...(n.endpoint ? { url: n.endpoint } : {}),
        }));

        const now = nowIso();
        return {
            apiVersion: ORCHESTRATOR_API_VERSION,
            kind: ORCHESTRATOR_KIND,
            metadata: {
                name,
                namespace,
                labels: {
                    "decops.io/toolkit": "orchestrator",
                    "decops.io/exported": "true",
                },
                annotations: {
                    "decops.io/exported-at": now,
                    "decops.io/description": "Manifest exported from current decops state.",
                },
            },
            spec: {
                libp2p, helia, orbitdb, kubo,
            },
            status: {
                phase: "healthy",
                lastAppliedAt: now,
                lastReconcileAt: now,
                observedResults: [],
            },
        };
    }

    /**
     * Save a manifest as a new artifact via the artifact provider and link
     * it as the active node's manifest.
     */
    saveManifestToArtifact(manifest: OrchestratorManifest, id?: string): string {
        const provider = this.requireArtifactProvider();
        const name = manifest.metadata.name;
        const artifactId = `orchestrator-manifest-${Date.now()}`;
        const artifact: JobArtifact = {
            id: artifactId,
            name: `${name}.manifest.json`,
            type: "json",
            content: JSON.stringify(manifest, null, 2),
            tags: ["orchestrator", "manifest"],
            createdAt: Date.now(),
            description: manifest.metadata.annotations?.["decops.io/description"],
            source: "command",
        };
        provider.importArtifact(artifact);
        this.setManifestArtifact(id, artifactId);
        const node = this.getNode(id);
        node.manifestName = name;
        node.manifestVersion = manifest.apiVersion;
        this.emit();
        return artifactId;
    }
}

export const orchestratorService = new OrchestratorManager();
export type { OrchestratorManager };
