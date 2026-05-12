/**
 * Libp2p Service — multi-instance manager around js-libp2p browser nodes.
 *
 * The toolkit can spawn many independent libp2p nodes (each with its own
 * peer id, peers book, pubsub topics, …). The {@link Libp2pManager}
 * singleton owns the set of nodes, tracks an active node, and exposes
 * subscribe/snapshot APIs the React provider mirrors. Each {@link Libp2pNode}
 * lazy-loads the heavy libp2p packages on first start.
 */

import type { Libp2p } from "libp2p";
import type { Multiaddr } from "@multiformats/multiaddr";
import { logError } from "@/services/logging";

/** Loose alias — the concrete PrivateKey shape is opaque to consumers. */
type PrivateKey = unknown;

// ── Types ────────────────────────────────────────

export type Libp2pStatus = "stopped" | "starting" | "running" | "stopping" | "error";

export interface PeerInfo {
    id: string;
    addrs: string[];
    connected: boolean;
    latencyMs?: number;
    firstSeen: string;
    lastSeen: string;
    source?: string;
}

export interface PubsubMessage {
    id: string;
    topic: string;
    /** "in" = received from a peer; "out" = locally published. */
    direction: "in" | "out";
    from?: string;
    /** UTF-8 decoded message payload (best-effort). */
    data: string;
    /** Byte length of the original payload. */
    bytes: number;
    at: string;
}

export interface Libp2pSnapshot {
    /** Local UI id of this node (NOT the peer id). */
    nodeId: string;
    label: string;
    status: Libp2pStatus;
    peerId: string | null;
    listenAddrs: string[];
    multiaddrs: string[];
    peers: PeerInfo[];
    error?: string;
    startedAt?: string;
    topics: string[];
    /** True if a private key has been pre-loaded for the next start. */
    hasPersistedIdentity: boolean;
    /** Total pubsub messages received since this node started. */
    pubsubMessageCount: number;
    /** Most recent pubsub message (for footer hover etc). */
    lastPubsubMessage?: { topic: string; from?: string; at: string };
    /** Recent pubsub messages, capped (most recent first). */
    pubsubMessages: PubsubMessage[];
}

export interface Libp2pServiceToggles {
    /** Identify protocol — required by dcutr and recommended for everything. */
    identify?: boolean;
    /** Round-trip ping protocol. */
    ping?: boolean;
    /** Direct Connection Upgrade Through Relay (NAT hole-punching). Requires identify. */
    dcutr?: boolean;
    /** Gossipsub pubsub. Required by `pubsubPeerDiscovery`. */
    pubsub?: boolean;
    /** Kademlia DHT (client mode). Heavier, off by default. */
    kadDht?: boolean;
}

export interface Libp2pDiscoveryToggles {
    /** Bootstrap peer discovery (uses the bootstrap list). */
    bootstrap?: boolean;
    /** Pubsub-based peer discovery. Requires `pubsub`. */
    pubsubPeerDiscovery?: boolean;
}

export interface Libp2pTransportToggles {
    /** WebSockets (handles `/ws` and `/wss` multiaddrs). */
    webSockets?: boolean;
    /** Browser-to-browser WebRTC. */
    webRTC?: boolean;
    /** Circuit relay v2 transport. */
    circuitRelay?: boolean;
}

export interface Libp2pStartOptions {
    /** Replace the default bootstrap list entirely. */
    bootstrap?: string[];
    /** Remove specific entries from the default (or supplied) bootstrap list. */
    disabledBootstrap?: string[];
    /** Per-service toggles. Omitted entries fall back to the defaults below. */
    services?: Libp2pServiceToggles;
    /** Per-discovery toggles. */
    discovery?: Libp2pDiscoveryToggles;
    /** Per-transport toggles. */
    transports?: Libp2pTransportToggles;
    /** @deprecated Use `transports.webRTC`. */
    enableWebRTC?: boolean;
    /** @deprecated Use `transports.circuitRelay`. */
    enableCircuitRelay?: boolean;
    pubsubDiscoveryTopic?: string;
    /**
     * Optional private network pre-shared key (the ASCII PSK document, e.g.
     * `/key/swarm/psk/1.0.0/\n/base16/\n<64 hex>`). When set, the node will
     * use a pnet connection protector and only peer with nodes sharing the
     * same key. Leave undefined for the public network.
     */
    pnetKey?: string;
}

export interface ManagerSnapshot {
    activeId: string | null;
    nodes: Libp2pSnapshot[];
}

type ManagerListener = (state: ManagerSnapshot) => void;

// ── Default browser-friendly bootstrap list ──────

export const DEFAULT_BOOTSTRAP: string[] = [
    "/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN",
    "/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa",
    "/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb",
    "/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjYZcYW3dwt",
];

// ── Helpers ──────────────────────────────────────

/** Encode bytes to base64 (browser-friendly). */
function bytesToBase64(bytes: Uint8Array): string {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
}

/** Decode base64 to bytes. */
function base64ToBytes(b64: string): Uint8Array {
    const raw = atob(b64.trim());
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}

// ── Per-node implementation ──────────────────────

/** localStorage key for persisted node list (ids, labels, identities). */
const NODES_STORAGE_KEY = "decops:libp2p-nodes:v1";

interface PersistedNode {
    id: string;
    label: string;
    /** base64 protobuf private key, if one was generated/imported. */
    privateKey?: string;
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
    } catch {
        return null;
    }
}

function savePersistedManager(state: PersistedManager): void {
    try {
        if (typeof localStorage === "undefined") return;
        localStorage.setItem(NODES_STORAGE_KEY, JSON.stringify(state));
    } catch { /* quota / privacy mode — ignore */ }
}

class Libp2pNode {
    readonly id: string;
    label: string;
    private node: Libp2p | null = null;
    private status: Libp2pStatus = "stopped";
    private peers = new Map<string, PeerInfo>();
    private topics = new Set<string>();
    private error?: string;
    private startedAt?: string;
    private pubsubMessageCount = 0;
    private lastPubsubMessage?: { topic: string; from?: string; at: string };
    private pubsubMessages: PubsubMessage[] = [];
    /** Cap on retained pubsub messages per node. */
    private static readonly PUBSUB_LOG_LIMIT = 200;
    private startPromise: Promise<void> | null = null;
    /** Private key to use on next start (import or generate). */
    private privateKey: PrivateKey | null = null;
    /** Listener fired whenever this node's snapshot changes. */
    private onChange: () => void;

    constructor(id: string, label: string, onChange: () => void) {
        this.id = id;
        this.label = label;
        this.onChange = onChange;
    }

    /** Serialise just enough to rehydrate this node on next page load. */
    async toPersisted(): Promise<PersistedNode> {
        const out: PersistedNode = { id: this.id, label: this.label };
        if (this.privateKey) {
            try {
                const { privateKeyToProtobuf } = await import("@libp2p/crypto/keys");
                out.privateKey = bytesToBase64(privateKeyToProtobuf(this.privateKey as any));
            } catch { /* ignore */ }
        }
        return out;
    }

    /** Restore an identity from a previously-persisted base64 key, if any. */
    async hydrateIdentity(privKeyBase64?: string): Promise<void> {
        if (!privKeyBase64) return;
        try {
            const { privateKeyFromProtobuf } = await import("@libp2p/crypto/keys");
            this.privateKey = privateKeyFromProtobuf(base64ToBytes(privKeyBase64));
            this.onChange();
        } catch { /* corrupt — ignore */ }
    }

    snapshot(): Libp2pSnapshot {
        const node = this.node;
        const listenAddrs: string[] = [];
        const multiaddrs: string[] = [];
        let peerId: string | null = null;
        if (node) {
            try { peerId = node.peerId.toString(); } catch { /* noop */ }
            try {
                for (const ma of node.getMultiaddrs()) multiaddrs.push(ma.toString());
            } catch { /* noop */ }
            try {
                const tm = (node as any).components?.transportManager;
                if (tm) {
                    for (const ma of tm.getAddrs() as Multiaddr[]) listenAddrs.push(ma.toString());
                }
            } catch { /* noop */ }
        }
        return {
            nodeId: this.id,
            label: this.label,
            status: this.status,
            peerId,
            listenAddrs,
            multiaddrs,
            peers: Array.from(this.peers.values()),
            error: this.error,
            startedAt: this.startedAt,
            topics: Array.from(this.topics),
            hasPersistedIdentity: this.privateKey !== null,
            pubsubMessageCount: this.pubsubMessageCount,
            lastPubsubMessage: this.lastPubsubMessage,
            pubsubMessages: this.pubsubMessages.slice(),
        };
    }

    private setStatus(status: Libp2pStatus, error?: string) {
        this.status = status;
        this.error = error;
        this.onChange();
    }

    private touchPeer(id: string, patch: Partial<PeerInfo>) {
        const now = new Date().toISOString();
        const existing = this.peers.get(id);
        if (existing) {
            this.peers.set(id, { ...existing, ...patch, lastSeen: now });
        } else {
            this.peers.set(id, {
                id,
                addrs: [],
                connected: false,
                firstSeen: now,
                lastSeen: now,
                ...patch,
            });
        }
    }

    setLabel(label: string) {
        this.label = label;
        this.onChange();
    }

    /** Generate a fresh Ed25519 identity to use on next start. */
    async generateIdentity(): Promise<{ peerIdHint: string }> {
        if (this.status === "running") {
            throw new Error("Stop the node before changing its identity");
        }
        const { generateKeyPair } = await import("@libp2p/crypto/keys");
        this.privateKey = await generateKeyPair("Ed25519");
        this.onChange();
        return { peerIdHint: await this.peerIdHint() };
    }

    /** Load a base64-encoded protobuf private key for the next start. */
    async importIdentity(privKeyBase64: string): Promise<{ peerIdHint: string }> {
        if (this.status === "running") {
            throw new Error("Stop the node before changing its identity");
        }
        const { privateKeyFromProtobuf } = await import("@libp2p/crypto/keys");
        const bytes = base64ToBytes(privKeyBase64);
        this.privateKey = privateKeyFromProtobuf(bytes);
        this.onChange();
        return { peerIdHint: await this.peerIdHint() };
    }

    /** Export the current/loaded identity as a base64 protobuf string. */
    async exportIdentity(): Promise<{ privateKey: string; peerId: string }> {
        const { privateKeyToProtobuf } = await import("@libp2p/crypto/keys");
        let key = this.privateKey;
        // If running but no preloaded key, pull from the node components.
        if (!key && this.node) {
            const components: any = (this.node as any).components;
            key = components?.privateKey ?? null;
        }
        if (!key) throw new Error("No identity available to export — start or load one first");
        const bytes = privateKeyToProtobuf(key as any);
        const peerIdStr = this.node
            ? this.node.peerId.toString()
            : await this.peerIdHint();
        return { privateKey: bytesToBase64(bytes), peerId: peerIdStr };
    }

    /** Compute the peer id that would result from the loaded private key. */
    private async peerIdHint(): Promise<string> {
        if (!this.privateKey) return "";
        const { peerIdFromPrivateKey } = await import("@libp2p/peer-id");
        return peerIdFromPrivateKey(this.privateKey as any).toString();
    }

    /** Clear the preloaded identity (libp2p will mint a new one on next start). */
    clearIdentity() {
        if (this.status === "running") {
            throw new Error("Stop the node before clearing its identity");
        }
        this.privateKey = null;
        this.onChange();
    }

    async start(opts: Libp2pStartOptions = {}): Promise<void> {
        if (this.status === "running") return;
        if (this.startPromise) return this.startPromise;

        this.startPromise = (async () => {
            this.setStatus("starting");
            try {
                // Resolve toggles (with sensible defaults & legacy-flag fallback).
                const svcOpts = opts.services ?? {};
                const discOpts = opts.discovery ?? {};
                const tOpts = opts.transports ?? {};
                const useWebSockets = tOpts.webSockets !== false;
                const useWebRTC = (tOpts.webRTC !== false) && (opts.enableWebRTC !== false);
                const useCircuitRelay = (tOpts.circuitRelay !== false) && (opts.enableCircuitRelay !== false);
                const useIdentify = svcOpts.identify !== false;
                const usePing = svcOpts.ping !== false;
                const useDcutr = svcOpts.dcutr !== false && useIdentify;
                const usePubsub = svcOpts.pubsub !== false;
                const useKadDht = svcOpts.kadDht === true;
                const useBootstrap = discOpts.bootstrap !== false;
                const usePubsubDiscovery = (discOpts.pubsubPeerDiscovery !== false) && usePubsub;

                if (!useWebSockets && !useWebRTC && !useCircuitRelay) {
                    throw new Error("At least one transport must be enabled");
                }

                const [
                    { createLibp2p },
                    { webSockets },
                    { webRTC },
                    { circuitRelayTransport },
                    { noise },
                    { yamux },
                    { bootstrap },
                    { identify },
                    { ping },
                    { dcutr },
                    { gossipsub },
                    { pubsubPeerDiscovery },
                ] = await Promise.all([
                    import("libp2p"),
                    import("@libp2p/websockets"),
                    import("@libp2p/webrtc"),
                    import("@libp2p/circuit-relay-v2"),
                    import("@chainsafe/libp2p-noise"),
                    import("@chainsafe/libp2p-yamux"),
                    import("@libp2p/bootstrap"),
                    import("@libp2p/identify"),
                    import("@libp2p/ping"),
                    import("@libp2p/dcutr"),
                    import("@chainsafe/libp2p-gossipsub"),
                    import("@libp2p/pubsub-peer-discovery"),
                ]);

                // Bootstrap list (allow user to disable individual entries).
                const baseList = (opts.bootstrap && opts.bootstrap.length > 0)
                    ? opts.bootstrap
                    : DEFAULT_BOOTSTRAP;
                const disabledSet = new Set(opts.disabledBootstrap ?? []);
                const list = baseList.filter((a) => !disabledSet.has(a));

                const transports: any[] = [];
                if (useWebSockets) transports.push(webSockets());
                if (useWebRTC) transports.push(webRTC());
                if (useCircuitRelay) transports.push(circuitRelayTransport());

                const listen: string[] = [];
                if (useCircuitRelay) listen.push("/p2p-circuit");
                if (useWebRTC) listen.push("/webrtc");

                const peerDiscovery: any[] = [];
                if (useBootstrap && list.length > 0) peerDiscovery.push(bootstrap({ list }));
                if (usePubsubDiscovery) {
                    peerDiscovery.push(pubsubPeerDiscovery({
                        interval: 10_000,
                        topics: opts.pubsubDiscoveryTopic ? [opts.pubsubDiscoveryTopic] : undefined,
                    }));
                }

                const services: Record<string, any> = {};
                if (useIdentify) services.identify = identify();
                if (usePing) services.ping = ping();
                if (useDcutr) services.dcutr = dcutr();
                if (usePubsub) services.pubsub = gossipsub({ allowPublishToZeroTopicPeers: true });
                if (useKadDht) {
                    const { kadDHT } = await import("@libp2p/kad-dht");
                    services.dht = kadDHT({ clientMode: true });
                }

                // Private network (pnet) connection protector — optional.
                let connectionProtector: any | undefined;
                if (opts.pnetKey && opts.pnetKey.trim()) {
                    const { preSharedKey } = await import("@libp2p/pnet");
                    connectionProtector = preSharedKey({
                        psk: new TextEncoder().encode(opts.pnetKey),
                    });
                }

                const node = await createLibp2p({
                    ...(this.privateKey ? { privateKey: this.privateKey as any } : {}),
                    addresses: { listen },
                    transports,
                    connectionEncrypters: [noise()],
                    streamMuxers: [yamux()],
                    peerDiscovery,
                    services: services as any,
                    ...(connectionProtector ? { connectionProtector } : {}),
                    connectionGater: {
                        denyDialMultiaddr: () => false,
                    },
                });

                this.node = node;
                // Capture the running private key so subsequent stop+start
                // preserves the same peer id (until the user clears identity).
                if (!this.privateKey) {
                    const components: any = (node as any).components;
                    if (components?.privateKey) this.privateKey = components.privateKey;
                }
                this.wireEvents(node);

                await node.start();
                this.startedAt = new Date().toISOString();
                this.setStatus("running");
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                this.setStatus("error", msg);
                this.node = null;
                throw err;
            } finally {
                this.startPromise = null;
            }
        })();

        return this.startPromise;
    }

    private wireEvents(node: Libp2p) {
        node.addEventListener("peer:discovery", (evt) => {
            const detail: any = (evt as any).detail;
            const id = detail?.id?.toString?.() ?? String(detail?.id ?? "");
            if (!id) return;
            const addrs = (detail?.multiaddrs ?? []).map((ma: Multiaddr) => ma.toString());
            this.touchPeer(id, { addrs, source: "discovery" });
            this.onChange();
        });
        node.addEventListener("peer:connect", (evt) => {
            const id = (evt as any).detail?.toString?.() ?? "";
            if (!id) return;
            this.touchPeer(id, { connected: true });
            this.onChange();
        });
        node.addEventListener("peer:disconnect", (evt) => {
            const id = (evt as any).detail?.toString?.() ?? "";
            if (!id) return;
            this.touchPeer(id, { connected: false });
            this.onChange();
        });
        node.addEventListener("self:peer:update", () => {
            this.onChange();
        });
        // Pubsub message counter — gossipsub emits "message" on the service.
        try {
            const pubsub: any = (node.services as any).pubsub;
            if (pubsub?.addEventListener) {
                pubsub.addEventListener("message", (evt: any) => {
                    const detail = evt?.detail ?? {};
                    const topic: string = typeof detail.topic === "string" ? detail.topic : "";
                    // Ignore internal pubsub-discovery chatter from our metric.
                    if (topic.startsWith("_peer-discovery._p2p._pubsub")) return;
                    const from = detail.from?.toString?.() ?? undefined;
                    const raw: Uint8Array | undefined = detail.data instanceof Uint8Array
                        ? detail.data
                        : (detail.data ? new Uint8Array(detail.data) : undefined);
                    let body = "";
                    let bytes = 0;
                    if (raw) {
                        bytes = raw.length;
                        try { body = new TextDecoder("utf-8", { fatal: false }).decode(raw); }
                        catch { body = "<binary>"; }
                    }
                    this.pubsubMessageCount += 1;
                    this.lastPubsubMessage = { topic, from, at: new Date().toISOString() };
                    this.recordPubsub({
                        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                        topic,
                        direction: "in",
                        from,
                        data: body,
                        bytes,
                        at: this.lastPubsubMessage.at,
                    });
                    this.onChange();
                });
            }
        } catch { /* pubsub may be unavailable */ }
    }

    async stop(): Promise<void> {
        if (!this.node) {
            this.setStatus("stopped");
            return;
        }
        this.setStatus("stopping");
        try { await this.node.stop(); } catch (err) { logError("libp2p.node.stop", err, { nodeId: this.id }, { warn: true }); }
        this.node = null;
        for (const p of this.peers.values()) p.connected = false;
        this.pubsubMessageCount = 0;
        this.lastPubsubMessage = undefined;
        this.pubsubMessages = [];
        this.setStatus("stopped");
    }

    async dial(target: string): Promise<{ remotePeer: string }> {
        const node = this.requireNode();
        const { multiaddr } = await import("@multiformats/multiaddr");
        const ma = target.startsWith("/") ? multiaddr(target) : null;
        const conn = ma
            ? await node.dial(ma)
            : await node.dial((await import("@libp2p/peer-id")).peerIdFromString(target));
        const id = conn.remotePeer.toString();
        this.touchPeer(id, { connected: true, source: "dial" });
        this.onChange();
        return { remotePeer: id };
    }

    async hangUp(peerId: string): Promise<void> {
        const node = this.requireNode();
        const { peerIdFromString } = await import("@libp2p/peer-id");
        await node.hangUp(peerIdFromString(peerId));
        this.touchPeer(peerId, { connected: false });
        this.onChange();
    }

    async ping(peerId: string): Promise<number> {
        const node = this.requireNode();
        const { peerIdFromString } = await import("@libp2p/peer-id");
        const svc: any = (node.services as any).ping;
        if (!svc?.ping) throw new Error("Ping service unavailable");
        const latency = await svc.ping(peerIdFromString(peerId));
        this.touchPeer(peerId, { latencyMs: latency });
        this.onChange();
        return latency;
    }

    async subscribeTopic(topic: string): Promise<void> {
        const node = this.requireNode();
        const pubsub: any = (node.services as any).pubsub;
        if (!pubsub?.subscribe) throw new Error("Pubsub service unavailable");
        pubsub.subscribe(topic);
        this.topics.add(topic);
        this.onChange();
    }

    async unsubscribeTopic(topic: string): Promise<void> {
        const node = this.requireNode();
        const pubsub: any = (node.services as any).pubsub;
        if (!pubsub?.unsubscribe) return;
        pubsub.unsubscribe(topic);
        this.topics.delete(topic);
        this.onChange();
    }

    async publish(topic: string, message: string): Promise<void> {
        const node = this.requireNode();
        const pubsub: any = (node.services as any).pubsub;
        if (!pubsub?.publish) throw new Error("Pubsub service unavailable");
        const data = new TextEncoder().encode(message);
        await pubsub.publish(topic, data);
        const peerId = (() => { try { return node.peerId.toString(); } catch { return undefined; } })();
        this.recordPubsub({
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            topic,
            direction: "out",
            from: peerId,
            data: message,
            bytes: data.length,
            at: new Date().toISOString(),
        });
        this.onChange();
    }

    private recordPubsub(msg: PubsubMessage) {
        this.pubsubMessages.unshift(msg);
        if (this.pubsubMessages.length > Libp2pNode.PUBSUB_LOG_LIMIT) {
            this.pubsubMessages.length = Libp2pNode.PUBSUB_LOG_LIMIT;
        }
    }

    clearPeers() {
        this.peers.clear();
        this.onChange();
    }

    private requireNode(): Libp2p {
        if (!this.node || this.status !== "running") {
            throw new Error(`libp2p node "${this.label}" is not running`);
        }
        return this.node;
    }
}

// ── Manager ──────────────────────────────────────

class Libp2pManager {
    private nodes = new Map<string, Libp2pNode>();
    private order: string[] = [];
    private activeId: string | null = null;
    private listeners = new Set<ManagerListener>();
    private nextSeq = 1;

    constructor() {
        // Try to rehydrate the previous tab strip from localStorage. Each
        // node's identity (if any was saved) is restored asynchronously so
        // the snapshot reflects the persisted peer ids once decoded.
        const persisted = loadPersistedManager();
        if (persisted && persisted.nodes.length > 0) {
            this.nextSeq = Math.max(persisted.nextSeq ?? 1, 1);
            for (const p of persisted.nodes) {
                const node = new Libp2pNode(p.id, p.label, () => this.emit());
                this.nodes.set(p.id, node);
                this.order.push(p.id);
                if (p.privateKey) {
                    void node.hydrateIdentity(p.privateKey);
                }
            }
            this.activeId = persisted.activeId && this.nodes.has(persisted.activeId)
                ? persisted.activeId
                : (this.order[0] ?? null);
        } else {
            // First-run: always start with one node so the UI has something to show.
            this.addNode("Node 1");
        }
    }

    /** Subscribe to manager-level state (node list, active id, per-node snapshots). */
    subscribe(fn: ManagerListener): () => void {
        this.listeners.add(fn);
        try { fn(this.snapshot()); } catch { /* noop */ }
        return () => { this.listeners.delete(fn); };
    }

    snapshot(): ManagerSnapshot {
        return {
            activeId: this.activeId,
            nodes: this.order
                .map((id) => this.nodes.get(id))
                .filter((n): n is Libp2pNode => !!n)
                .map((n) => n.snapshot()),
        };
    }

    private emit() {
        const snap = this.snapshot();
        for (const fn of this.listeners) {
            try { fn(snap); } catch { /* swallow */ }
        }
        // Persist the node list (ids, labels, identities) so reloads restore
        // the current tab strip. Identity serialisation is async; fire-and-forget.
        void this.persist();
    }

    private async persist(): Promise<void> {
        try {
            const nodes: PersistedNode[] = await Promise.all(
                this.order
                    .map((id) => this.nodes.get(id))
                    .filter((n): n is Libp2pNode => !!n)
                    .map((n) => n.toPersisted()),
            );
            savePersistedManager({
                activeId: this.activeId,
                nextSeq: this.nextSeq,
                nodes,
            });
        } catch (err) { logError("libp2p.manager.persist", err, undefined, { warn: true }); }
    }

    /** Add a fresh node entry and make it active. Returns its local id. */
    addNode(label?: string): string {
        const seq = this.nextSeq++;
        const id = `n-${seq}-${Math.random().toString(36).slice(2, 6)}`;
        const node = new Libp2pNode(id, label ?? `Node ${seq}`, () => this.emit());
        this.nodes.set(id, node);
        this.order.push(id);
        this.activeId = id;
        this.emit();
        return id;
    }

    /** Remove a node, stopping it first. The next node (if any) becomes active. */
    async removeNode(id: string): Promise<void> {
        const node = this.nodes.get(id);
        if (!node) return;
        try { await node.stop(); } catch (err) { logError("libp2p.manager.removeNode.stop", err, { nodeId: id }, { warn: true }); }
        this.nodes.delete(id);
        this.order = this.order.filter((x) => x !== id);
        if (this.activeId === id) {
            this.activeId = this.order[this.order.length - 1] ?? null;
        }
        // Keep at least one node entry in the list for UX.
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

    listIds(): string[] { return [...this.order]; }
    getActiveId(): string | null { return this.activeId; }
    getNode(id?: string | null): Libp2pNode {
        const target = id ?? this.activeId;
        if (!target) throw new Error("No active libp2p node");
        const node = this.nodes.get(target);
        if (!node) throw new Error(`libp2p node "${target}" not found`);
        return node;
    }

    // Convenience proxies — use the active node by default.
    start(opts?: Libp2pStartOptions, id?: string) { return this.getNode(id).start(opts); }
    stop(id?: string) { return this.getNode(id).stop(); }
    dial(target: string, id?: string) { return this.getNode(id).dial(target); }
    hangUp(peerId: string, id?: string) { return this.getNode(id).hangUp(peerId); }
    ping(peerId: string, id?: string) { return this.getNode(id).ping(peerId); }
    subscribeTopic(topic: string, id?: string) { return this.getNode(id).subscribeTopic(topic); }
    unsubscribeTopic(topic: string, id?: string) { return this.getNode(id).unsubscribeTopic(topic); }
    publish(topic: string, message: string, id?: string) { return this.getNode(id).publish(topic, message); }
    clearPeers(id?: string) { this.getNode(id).clearPeers(); }
    generateIdentity(id?: string) { return this.getNode(id).generateIdentity(); }
    importIdentity(privKeyBase64: string, id?: string) { return this.getNode(id).importIdentity(privKeyBase64); }
    exportIdentity(id?: string) { return this.getNode(id).exportIdentity(); }
    clearIdentity(id?: string) { this.getNode(id).clearIdentity(); }
}

/** Singleton manager — shared across the app. */
export const libp2pService = new Libp2pManager();
export type { Libp2pManager, Libp2pNode };
