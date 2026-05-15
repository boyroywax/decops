/**
 * libp2p Toolkit module — manifest, commands, configuration.
 */

import type { ToolkitModule } from "@/services/toolkits/types";
import { libp2pCommands } from "./commands";
import { DEFAULT_BOOTSTRAP } from "./service";

export const libp2pModule: ToolkitModule = {
    manifest: {
        id: "libp2p",
        name: "libp2p",
        description:
            "Run an in-browser libp2p node. Connect to public peer-to-peer networks, discover and dial peers, and exchange gossipsub messages.",
        icon: "Globe",
        color: "#38bdf8",
        gradient: ["#38bdf8", "#a78bfa"],
        category: "infrastructure",
        status: "available",
        builtIn: true,
        tags: ["libp2p", "p2p", "network", "decentralized", "pubsub"],
        labels: { tier: "core", domain: "networking" },
        version: "0.1.0",
        author: { name: "decops", url: "https://decops.io" },
        license: "MIT",
        createdAt: "2026-05-10T00:00:00Z",
        updatedAt: "2026-05-10T00:00:00Z",
    },

    commands: libp2pCommands,
    tools: [],

    agents: [
        {
            id: "libp2p-bot",
            name: "libp2p Bot",
            description:
                "Specialized AI sub-agent for peer-to-peer networking — handles node lifecycle, peer dialing, pubsub, and identity management.",
            capabilities: [
                "Node start/stop with custom services",
                "Peer dial / ping / hangup",
                "Pubsub subscribe & publish",
                "Identity generation & vault",
                "Contact book management",
            ],
            status: "active",
        },
    ],

    configuration: {
        fields: [
            {
                key: "autoStart",
                label: "Auto-start node",
                description: "Start the libp2p node automatically when the toolkit loads.",
                type: "boolean",
                defaultValue: false,
            },
            {
                key: "enableWebRTC",
                label: "Enable WebRTC",
                description: "Enable browser-to-browser WebRTC transport.",
                type: "boolean",
                defaultValue: true,
            },
            {
                key: "enableCircuitRelay",
                label: "Enable circuit relay v2",
                description: "Required for browsers to receive incoming dials via a relay.",
                type: "boolean",
                defaultValue: true,
            },
            {
                key: "bootstrap",
                label: "Bootstrap multiaddrs",
                description: "Newline-separated multiaddrs used to seed peer discovery.",
                type: "string",
                defaultValue: DEFAULT_BOOTSTRAP.join("\n"),
            },
        ],
    },

    logging: {
        config: { minLevel: "info", maxEntries: 200 },
        channels: [
            { id: "libp2p.node", name: "Node lifecycle", description: "Node start / stop events" },
            { id: "libp2p.peers", name: "Peer events", description: "Discovery, connect, disconnect" },
            { id: "libp2p.pubsub", name: "Pubsub", description: "Topic subscribe / publish events" },
        ],
    },

    metrics: {
        definitions: [
            { name: "toolkit.libp2p.peers_connected", description: "Currently connected peers", type: "gauge" },
            { name: "toolkit.libp2p.peers_known", description: "Total peers in peer book", type: "gauge" },
            { name: "toolkit.libp2p.topics", description: "Subscribed pubsub topics", type: "gauge" },
        ],
        collect: () => ({
            "toolkit.libp2p.peers_connected": 0,
            "toolkit.libp2p.peers_known": 0,
            "toolkit.libp2p.topics": 0,
        }),
    },

    rbac: {
        permissions: [
            { id: "libp2p.node", name: "Manage Node", description: "Start/stop the libp2p node", resource: "node", actions: ["create", "delete"] },
            { id: "libp2p.dial", name: "Dial Peers", description: "Open connections to remote peers", resource: "peer", actions: ["create"] },
            { id: "libp2p.pubsub", name: "Use Pubsub", description: "Subscribe and publish to topics", resource: "topic", actions: ["read", "create"] },
        ],
        roles: [
            { id: "libp2p-user", name: "libp2p User", description: "Read-only peer browsing", permissions: ["libp2p.dial"] },
            { id: "libp2p-admin", name: "libp2p Admin", description: "Full libp2p access", permissions: ["libp2p.node", "libp2p.dial", "libp2p.pubsub"] },
        ],
        defaultRole: "libp2p-user",
    },

    docs: {
        documents: [
            {
                id: "libp2p-readme",
                title: "libp2p Toolkit",
                type: "readme",
                order: 1,
                content: [
                    "# libp2p Toolkit",
                    "",
                    "Run a [js-libp2p](https://github.com/libp2p/js-libp2p) node directly in the browser.",
                    "",
                    "## What it does",
                    "- Starts a libp2p node with WebSockets, WebRTC, and circuit relay v2 transports.",
                    "- Connects to the public js-libp2p bootstrap peers.",
                    "- Discovers peers via bootstrap and pubsub peer-discovery.",
                    "- Lets you dial peers by multiaddr or peer id, ping them, and exchange gossipsub messages.",
                    "",
                    "## Browser caveats",
                    "Browsers cannot accept inbound TCP connections. To be reachable by other peers, the node",
                    "advertises a `/p2p-circuit` listen address backed by a public relay reservation, and a",
                    "`/webrtc` address negotiated over the signalling stream provided by the relay.",
                    "",
                    "## Commands",
                    "- `libp2p_start` / `libp2p_stop` — start/stop a node",
                    "- `libp2p_add_node` / `libp2p_remove_node` / `libp2p_set_active_node` / `libp2p_rename_node` — manage multiple nodes",
                    "- `libp2p_dial` / `libp2p_hangup` — open or close a connection",
                    "- `libp2p_ping` — measure latency",
                    "- `libp2p_list_peers` / `libp2p_clear_peers` — inspect or reset the peer book",
                    "- `libp2p_pubsub_subscribe` / `libp2p_pubsub_unsubscribe` / `libp2p_pubsub_publish` — gossipsub messaging",
                    "- `libp2p_generate_identity` / `libp2p_import_identity` / `libp2p_export_identity` / `libp2p_clear_identity` — manage the node's Ed25519 keypair",
                ].join("\n"),
            },
        ],
        readme: "# libp2p Toolkit\n\nIn-browser libp2p node with peer discovery, dialing, and gossipsub.",
    },

    activity: { enabled: true },
};
