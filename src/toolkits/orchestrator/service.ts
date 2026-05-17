/**
 * Orchestrator Service — drives the four L.O.H.K toolkits (libp2p, helia,
 * orbitdb, kubo) toward a desired state described by a manifest stored as
 * a workspace artifact.
 *
 * Architecture mirrors the canonical toolkit-service pattern (helia / kubo
 * / orbitdb): one {@link OrchestratorManager} singleton owns N
 * {@link OrchestratorNode} instances, each persisted to localStorage and
 * mirrored into React via `snapshot()` + `subscribe()`.
 *
 * Heavy lifting:
 *   - The orchestrator does NOT own libp2p/helia/orbitdb/kubo state. It
 *     orchestrates them via their public service APIs.
 *   - The manifest is NEVER stored in this service. Only an
 *     `manifestArtifactId` reference is persisted. Manifest content is
 *     read on-demand from the artifacts subsystem at apply / reconcile
 *     time, via an artifact provider injected by the React layer.
 */

import type { JobArtifact } from "@/types";
import { libp2pService } from "@/toolkits/libp2p";
import { heliaService } from "@/toolkits/helia";
import { orbitdbService } from "@/toolkits/orbitdb";
import { kuboService } from "@/toolkits/kubo";
import type {
    OrchestratorStatus,
    OrchestratorSnapshot,
    OrchestratorManagerSnapshot,
    OrchestratorManifest,
    OrchestratorOperationResult,
    OrchestratorNodeSpec,
    OrchestratorTarget,
} from "./types/orchestrator";

type ManagerListener = (state: OrchestratorManagerSnapshot) => void;

const NODES_STORAGE_KEY = "decops:orchestrator-nodes:v1";
const RESULT_LIMIT = 200;

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

function parseManifest(content: string | undefined): OrchestratorManifest | null {
    if (!content) return null;
    try {
        const parsed = JSON.parse(content);
        if (!parsed || typeof parsed !== "object") return null;
        if (typeof parsed.version !== "string" && typeof parsed.version !== "number") return null;
        const m = parsed as OrchestratorManifest;
        if (typeof m.version !== "string") m.version = String(m.version);
        if (typeof m.name !== "string") m.name = "(unnamed)";
        return m;
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
            throw new Error(`Manifest artifact is not a valid OrchestratorManifest JSON.`);
        }
        node.manifestName = manifest.name;
        node.manifestVersion = manifest.version;
        return manifest;
    }

    // ── Apply / Reconcile / Export ──

    /**
     * Apply the manifest: bring each declared sub-node to its desired state.
     * Strategy: for each target group (libp2p, helia, orbitdb, kubo) ensure
     * a runtime node exists with a matching label, then optionally start /
     * connect it.
     */
    async applyManifest(id?: string): Promise<OrchestratorOperationResult[]> {
        const node = this.getNode(id);
        node.setStatus("applying");
        try {
            const manifest = this.readManifest(id);
            const results: OrchestratorOperationResult[] = [];

            await this.applyTarget("libp2p", manifest.libp2p, results);
            await this.applyTarget("helia", manifest.helia, results);
            await this.applyTarget("orbitdb", manifest.orbitdb, results);
            await this.applyTarget("kubo", manifest.kubo, results);

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

    private async applyTarget(
        target: OrchestratorTarget,
        specs: OrchestratorNodeSpec[] | undefined,
        results: OrchestratorOperationResult[],
    ): Promise<void> {
        if (!specs || specs.length === 0) return;
        for (const spec of specs) {
            try {
                const r = await this.applyOneSpec(target, spec);
                results.push(r);
            } catch (err) {
                results.push({
                    target,
                    specId: spec.id,
                    action: "failed",
                    ok: false,
                    error: err instanceof Error ? err.message : String(err),
                    at: nowIso(),
                });
            }
        }
    }

    private async applyOneSpec(
        target: OrchestratorTarget,
        spec: OrchestratorNodeSpec,
    ): Promise<OrchestratorOperationResult> {
        const label = spec.label ?? spec.id;
        const findByLabel = <T extends { label: string; nodeId: string }>(arr: T[]) =>
            arr.find((n) => n.label === label) ?? null;

        let runtimeNodeId: string | undefined;
        let action: OrchestratorOperationResult["action"] = "noop";

        switch (target) {
            case "libp2p": {
                const snap = libp2pService.snapshot();
                let existing = findByLabel(snap.nodes as Array<{ label: string; nodeId: string }>);
                if (!existing) {
                    runtimeNodeId = libp2pService.addNode(label);
                    action = "created";
                } else {
                    runtimeNodeId = existing.nodeId;
                }
                if (spec.autoStart) {
                    const ns = libp2pService.snapshot().nodes.find((n) => n.nodeId === runtimeNodeId);
                    if (ns && ns.status !== "running" && ns.status !== "starting") {
                        await libp2pService.start({}, runtimeNodeId);
                        action = "started";
                    }
                }
                break;
            }
            case "helia": {
                const snap = heliaService.snapshot();
                let existing = findByLabel(snap.nodes as Array<{ label: string; nodeId: string }>);
                if (!existing) {
                    const libp2pSpecId = spec.bindings?.libp2p;
                    let libp2pRuntimeId: string | null = null;
                    if (libp2pSpecId) {
                        const lp = libp2pService.snapshot().nodes.find((n) => n.label === libp2pSpecId);
                        libp2pRuntimeId = lp?.nodeId ?? null;
                    }
                    runtimeNodeId = heliaService.addNode(label, libp2pRuntimeId);
                    action = "created";
                } else {
                    runtimeNodeId = existing.nodeId;
                }
                if (spec.autoStart) {
                    const ns = heliaService.snapshot().nodes.find((n) => n.nodeId === runtimeNodeId);
                    if (ns && ns.status !== "running" && ns.status !== "starting") {
                        await heliaService.start({}, runtimeNodeId);
                        action = "started";
                    }
                }
                break;
            }
            case "orbitdb": {
                const snap = orbitdbService.snapshot();
                let existing = findByLabel(snap.nodes as Array<{ label: string; nodeId: string }>);
                if (!existing) {
                    const heliaSpecId = spec.bindings?.helia;
                    let heliaRuntimeId: string | null = null;
                    if (heliaSpecId) {
                        const hn = heliaService.snapshot().nodes.find((n) => n.label === heliaSpecId);
                        heliaRuntimeId = hn?.nodeId ?? null;
                    }
                    runtimeNodeId = orbitdbService.addNode(label, heliaRuntimeId);
                    action = "created";
                } else {
                    runtimeNodeId = existing.nodeId;
                }
                if (spec.autoStart) {
                    const ns = orbitdbService.snapshot().nodes.find((n) => n.nodeId === runtimeNodeId);
                    if (ns && ns.status !== "running" && ns.status !== "starting") {
                        await orbitdbService.start({}, runtimeNodeId);
                        action = "started";
                    }
                }
                break;
            }
            case "kubo": {
                const snap = kuboService.snapshot();
                let existing = findByLabel(snap.nodes as Array<{ label: string; nodeId: string }>);
                if (!existing) {
                    const endpoint =
                        typeof spec.config?.url === "string" ? (spec.config!.url as string) : undefined;
                    runtimeNodeId = kuboService.addNode(label, endpoint);
                    action = "created";
                } else {
                    runtimeNodeId = existing.nodeId;
                }
                if (spec.autoStart) {
                    const ns = kuboService.snapshot().nodes.find((n) => n.nodeId === runtimeNodeId);
                    if (ns && ns.status !== "connected" && ns.status !== "connecting") {
                        await kuboService.connect({}, runtimeNodeId);
                        action = "connected";
                    }
                }
                break;
            }
        }

        return {
            target,
            specId: spec.id,
            runtimeNodeId,
            action,
            ok: true,
            at: nowIso(),
        };
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

            this.reconcileTarget("libp2p", manifest.libp2p, results, libp2pService.snapshot().nodes);
            this.reconcileTarget("helia", manifest.helia, results, heliaService.snapshot().nodes);
            this.reconcileTarget("orbitdb", manifest.orbitdb, results, orbitdbService.snapshot().nodes);
            this.reconcileTarget("kubo", manifest.kubo, results, kuboService.snapshot().nodes);

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
        specs: OrchestratorNodeSpec[] | undefined,
        results: OrchestratorOperationResult[],
        runtimeNodes: Array<{ label: string; nodeId: string; status: string }>,
    ): void {
        if (!specs) return;
        for (const spec of specs) {
            const label = spec.label ?? spec.id;
            const existing = runtimeNodes.find((n) => n.label === label) ?? null;
            if (!existing) {
                results.push({
                    target, specId: spec.id, action: "failed", ok: false,
                    message: `Missing runtime node (expected label "${label}")`,
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
                        target, specId: spec.id, runtimeNodeId: existing.nodeId,
                        action: "failed", ok: false,
                        message: `Expected ${target === "kubo" ? "connected" : "running"}, got "${existing.status}"`,
                        at: nowIso(),
                    });
                    continue;
                }
            }
            results.push({
                target, specId: spec.id, runtimeNodeId: existing.nodeId,
                action: "noop", ok: true,
                at: nowIso(),
            });
        }
    }

    /**
     * Build a manifest from the current live state across all 4 toolkits.
     */
    exportManifest(name = "Exported Stack"): OrchestratorManifest {
        const libp2p: OrchestratorNodeSpec[] = libp2pService.snapshot().nodes.map((n) => ({
            id: n.label, label: n.label,
            autoStart: n.status === "running" || n.status === "starting",
        }));
        const helia: OrchestratorNodeSpec[] = heliaService.snapshot().nodes.map((n) => ({
            id: n.label, label: n.label,
            autoStart: n.status === "running" || n.status === "starting",
        }));
        const orbitdb: OrchestratorNodeSpec[] = orbitdbService.snapshot().nodes.map((n) => ({
            id: n.label, label: n.label,
            autoStart: n.status === "running" || n.status === "starting",
        }));
        const kubo: OrchestratorNodeSpec[] = kuboService.snapshot().nodes.map((n) => ({
            id: n.label, label: n.label,
            autoStart: n.status === "connected" || n.status === "connecting",
            config: { url: n.endpoint },
        }));
        const now = nowIso();
        return {
            version: "1",
            name,
            description: "Manifest exported from current decops state.",
            libp2p, helia, orbitdb, kubo,
            createdAt: now,
            updatedAt: now,
        };
    }

    /**
     * Save a manifest as a new artifact via the artifact provider and link
     * it as the active node's manifest.
     */
    saveManifestToArtifact(manifest: OrchestratorManifest, id?: string): string {
        const provider = this.requireArtifactProvider();
        const artifactId = `orchestrator-manifest-${Date.now()}`;
        const artifact: JobArtifact = {
            id: artifactId,
            name: `${manifest.name}.manifest.json`,
            type: "json",
            content: JSON.stringify(manifest, null, 2),
            tags: ["orchestrator", "manifest"],
            createdAt: Date.now(),
            description: manifest.description,
            source: "command",
        };
        provider.importArtifact(artifact);
        this.setManifestArtifact(id, artifactId);
        const node = this.getNode(id);
        node.manifestName = manifest.name;
        node.manifestVersion = manifest.version;
        this.emit();
        return artifactId;
    }
}

export const orchestratorService = new OrchestratorManager();
export type { OrchestratorManager };
