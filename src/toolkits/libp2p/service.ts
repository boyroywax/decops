/**
 * Libp2p Service — singleton wrapper around a js-libp2p browser node.
 *
 * Lazy-loads the heavy libp2p packages on first start so the initial app
 * bundle stays small. Exposes a tiny event-emitter style API the React
 * provider can subscribe to.
 */

import type { Libp2p } from "libp2p";
import type { Multiaddr } from "@multiformats/multiaddr";

// ── Types ────────────────────────────────────────

export type Libp2pStatus = "stopped" | "starting" | "running" | "stopping" | "error";

export interface PeerInfo {
    /** Stringified peer id (CID base58). */
    id: string;
    /** Multiaddrs the local node knows for the peer. */
    addrs: string[];
    /** True if a connection is currently open. */
    connected: boolean;
    /** Latency in ms from the most recent ping, if any. */
    latencyMs?: number;
    /** ISO timestamp the peer was first seen this session. */
    firstSeen: string;
    /** ISO timestamp of the last activity. */
    lastSeen: string;
    /** Discovery source (bootstrap, pubsub, dial, …). */
    source?: string;
}

export interface Libp2pSnapshot {
    status: Libp2pStatus;
    peerId: string | null;
    listenAddrs: string[];
    multiaddrs: string[];
    peers: PeerInfo[];
    error?: string;
    startedAt?: string;
    /** Subscribed gossipsub topics. */
    topics: string[];
}

export interface Libp2pStartOptions {
    /** Bootstrap multiaddrs to seed peer discovery. */
    bootstrap?: string[];
    /** Enable WebRTC transport (browser-to-browser via signalling). */
    enableWebRTC?: boolean;
    /** Enable circuit relay v2 transport (required for browser dial-out via relays). */
    enableCircuitRelay?: boolean;
    /** Pubsub peer-discovery topic (defaults to libp2p default). */
    pubsubDiscoveryTopic?: string;
}

type Listener = (snapshot: Libp2pSnapshot) => void;

// ── Default browser-friendly bootstrap list ──────
//
// These are the canonical js-libp2p public bootstrappers. They speak
// /dnsaddr resolved to /wss/ws transports which work from a browser tab.

export const DEFAULT_BOOTSTRAP: string[] = [
    "/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN",
    "/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa",
    "/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb",
    "/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjYZcYW3dwt",
];

// ── Internal state ───────────────────────────────

class Libp2pService {
    private node: Libp2p | null = null;
    private status: Libp2pStatus = "stopped";
    private peers = new Map<string, PeerInfo>();
    private topics = new Set<string>();
    private error?: string;
    private startedAt?: string;
    private listeners = new Set<Listener>();
    private startPromise: Promise<void> | null = null;

    /** Subscribe to snapshot updates. Returns an unsubscribe fn. */
    subscribe(fn: Listener): () => void {
        this.listeners.add(fn);
        // Push current snapshot immediately for new subscribers.
        try { fn(this.snapshot()); } catch { /* noop */ }
        return () => { this.listeners.delete(fn); };
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
                // @ts-ignore — components.transportManager is the canonical path
                const tm = (node as any).components?.transportManager;
                if (tm) {
                    for (const ma of tm.getAddrs() as Multiaddr[]) listenAddrs.push(ma.toString());
                }
            } catch { /* noop */ }
        }
        return {
            status: this.status,
            peerId,
            listenAddrs,
            multiaddrs,
            peers: Array.from(this.peers.values()),
            error: this.error,
            startedAt: this.startedAt,
            topics: Array.from(this.topics),
        };
    }

    private emit() {
        const snap = this.snapshot();
        for (const fn of this.listeners) {
            try { fn(snap); } catch { /* swallow */ }
        }
    }

    private setStatus(status: Libp2pStatus, error?: string) {
        this.status = status;
        this.error = error;
        this.emit();
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

    /** Start (or return) the libp2p node. Idempotent. */
    async start(opts: Libp2pStartOptions = {}): Promise<void> {
        if (this.status === "running") return;
        if (this.startPromise) return this.startPromise;

        this.startPromise = (async () => {
            this.setStatus("starting");
            try {
                // Lazy import to keep these huge modules out of the initial bundle.
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
                    import("@chainsafe/libp2p-gossipsub"),
                    import("@libp2p/pubsub-peer-discovery"),
                ]);

                const list = (opts.bootstrap && opts.bootstrap.length > 0)
                    ? opts.bootstrap
                    : DEFAULT_BOOTSTRAP;

                const transports: any[] = [
                    webSockets(),
                ];
                if (opts.enableWebRTC !== false) transports.push(webRTC());
                if (opts.enableCircuitRelay !== false) {
                    transports.push(circuitRelayTransport());
                }

                const node = await createLibp2p({
                    addresses: {
                        listen: [
                            ...(opts.enableCircuitRelay !== false ? ["/p2p-circuit"] : []),
                            ...(opts.enableWebRTC !== false ? ["/webrtc"] : []),
                        ],
                    },
                    transports,
                    connectionEncrypters: [noise()],
                    streamMuxers: [yamux()],
                    peerDiscovery: [
                        bootstrap({ list }),
                        pubsubPeerDiscovery({
                            interval: 10_000,
                            topics: opts.pubsubDiscoveryTopic ? [opts.pubsubDiscoveryTopic] : undefined,
                        }),
                    ],
                    services: {
                        identify: identify(),
                        ping: ping(),
                        // Cast to any to bypass duplicate `@libp2p/interface` type identity
                        // when nested deps install their own copy.
                        pubsub: gossipsub({ allowPublishToZeroTopicPeers: true }) as any,
                    } as any,
                    connectionGater: {
                        // Browser nodes can't accept incoming TCP, but allow everything else.
                        denyDialMultiaddr: () => false,
                    },
                });

                this.node = node;
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
        // Peer discovery
        node.addEventListener("peer:discovery", (evt) => {
            const detail: any = (evt as any).detail;
            const id = detail?.id?.toString?.() ?? String(detail?.id ?? "");
            if (!id) return;
            const addrs = (detail?.multiaddrs ?? []).map((ma: Multiaddr) => ma.toString());
            this.touchPeer(id, { addrs, source: "discovery" });
            this.emit();
        });

        node.addEventListener("peer:connect", (evt) => {
            const id = (evt as any).detail?.toString?.() ?? "";
            if (!id) return;
            this.touchPeer(id, { connected: true });
            this.emit();
        });

        node.addEventListener("peer:disconnect", (evt) => {
            const id = (evt as any).detail?.toString?.() ?? "";
            if (!id) return;
            this.touchPeer(id, { connected: false });
            this.emit();
        });

        node.addEventListener("self:peer:update", () => {
            this.emit();
        });
    }

    /** Stop the node and clear state (peers retained for visibility). */
    async stop(): Promise<void> {
        if (!this.node) {
            this.setStatus("stopped");
            return;
        }
        this.setStatus("stopping");
        try {
            await this.node.stop();
        } catch { /* ignore */ }
        this.node = null;
        // Mark all peers disconnected.
        for (const p of this.peers.values()) p.connected = false;
        this.setStatus("stopped");
    }

    /** Dial a multiaddr or peer id string. */
    async dial(target: string): Promise<{ remotePeer: string }> {
        const node = this.requireNode();
        const { multiaddr } = await import("@multiformats/multiaddr");
        const ma = target.startsWith("/") ? multiaddr(target) : null;
        const conn = ma
            ? await node.dial(ma)
            : await node.dial((await import("@libp2p/peer-id")).peerIdFromString(target));
        const id = conn.remotePeer.toString();
        this.touchPeer(id, { connected: true, source: "dial" });
        this.emit();
        return { remotePeer: id };
    }

    /** Hang up an open connection by peer id. */
    async hangUp(peerId: string): Promise<void> {
        const node = this.requireNode();
        const { peerIdFromString } = await import("@libp2p/peer-id");
        await node.hangUp(peerIdFromString(peerId));
        this.touchPeer(peerId, { connected: false });
        this.emit();
    }

    /** Ping a peer and return latency in ms. */
    async ping(peerId: string): Promise<number> {
        const node = this.requireNode();
        const { peerIdFromString } = await import("@libp2p/peer-id");
        const svc: any = (node.services as any).ping;
        if (!svc?.ping) throw new Error("Ping service unavailable");
        const latency = await svc.ping(peerIdFromString(peerId));
        this.touchPeer(peerId, { latencyMs: latency });
        this.emit();
        return latency;
    }

    /** Subscribe to a gossipsub topic. */
    async subscribeTopic(topic: string): Promise<void> {
        const node = this.requireNode();
        const pubsub: any = (node.services as any).pubsub;
        if (!pubsub?.subscribe) throw new Error("Pubsub service unavailable");
        pubsub.subscribe(topic);
        this.topics.add(topic);
        this.emit();
    }

    async unsubscribeTopic(topic: string): Promise<void> {
        const node = this.requireNode();
        const pubsub: any = (node.services as any).pubsub;
        if (!pubsub?.unsubscribe) return;
        pubsub.unsubscribe(topic);
        this.topics.delete(topic);
        this.emit();
    }

    async publish(topic: string, message: string): Promise<void> {
        const node = this.requireNode();
        const pubsub: any = (node.services as any).pubsub;
        if (!pubsub?.publish) throw new Error("Pubsub service unavailable");
        const data = new TextEncoder().encode(message);
        await pubsub.publish(topic, data);
    }

    /** Reset peer book (does not affect open connections). */
    clearPeers() {
        this.peers.clear();
        this.emit();
    }

    private requireNode(): Libp2p {
        if (!this.node || this.status !== "running") {
            throw new Error("libp2p node is not running");
        }
        return this.node;
    }
}

/** Singleton instance — shared across the app. */
export const libp2pService = new Libp2pService();
