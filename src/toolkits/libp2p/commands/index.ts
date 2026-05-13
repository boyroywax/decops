/**
 * libp2p toolkit commands.
 *
 * Each command thinly wraps the libp2pService manager so it can be invoked
 * from chat / job pipelines as well as from the UI. Every "node-scoped"
 * command accepts an optional `nodeId` arg; when omitted, the command
 * targets the currently-active node.
 */

import type { CommandDefinition } from "@/services/commands/types";
import { libp2pService } from "../service";
import { logAudit } from "@/services/logging";
import {
    useLibp2pCollections,
    encryptIdentity,
    decryptIdentity,
    getVaultEntry,
    getContact,
    generatePnetKey,
    normalisePnetKey,
    encryptPnetKey,
    decryptPnetKey,
    fingerprintPnetKey,
    getPnetEntry,
} from "../utils/collections";

const NODE_ID_ARG = {
    name: "nodeId",
    type: "string" as const,
    description: "Local node id. Defaults to the currently-active node.",
    required: false,
};

// ── libp2p_start ──

export const libp2pStartCommand: CommandDefinition = {
    id: "libp2p_start",
    description: "Start the in-browser libp2p node. Connects to public bootstrap peers, enables WebRTC + circuit relay, and begins peer discovery.",
    tags: ["libp2p", "network", "p2p"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        bootstrap: {
            name: "bootstrap",
            type: "array",
            description: "Optional list of bootstrap multiaddrs. Defaults to the public js-libp2p bootstrappers.",
            required: false,
        },
        disabledBootstrap: {
            name: "disabledBootstrap",
            type: "array",
            description: "Bootstrap multiaddrs to omit from the default (or supplied) list.",
            required: false,
        },
        services: {
            name: "services",
            type: "object",
            description: "Per-service toggles: { identify?, ping?, dcutr?, pubsub?, kadDht? }.",
            required: false,
        },
        discovery: {
            name: "discovery",
            type: "object",
            description: "Per-discovery toggles: { bootstrap?, pubsubPeerDiscovery? }.",
            required: false,
        },
        transports: {
            name: "transports",
            type: "object",
            description: "Per-transport toggles: { webSockets?, webRTC?, circuitRelay? }.",
            required: false,
        },
        enableWebRTC: {
            name: "enableWebRTC",
            type: "boolean",
            description: "Legacy alias for transports.webRTC.",
            required: false,
            defaultValue: true,
        },
        enableCircuitRelay: {
            name: "enableCircuitRelay",
            type: "boolean",
            description: "Legacy alias for transports.circuitRelay.",
            required: false,
            defaultValue: true,
        },
        pnetKey: {
            name: "pnetKey",
            type: "string",
            description: "Optional libp2p PSK document. When set, the node joins a private swarm and only peers with nodes sharing the same key.",
            required: false,
        },
    },
    output: "JSON object with node status, peer id, and listen multiaddrs.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const { nodeId, bootstrap, disabledBootstrap, services, discovery, transports, enableWebRTC, enableCircuitRelay, pnetKey } = args;
        await libp2pService.start({
            bootstrap: Array.isArray(bootstrap) && bootstrap.length ? bootstrap : undefined,
            disabledBootstrap: Array.isArray(disabledBootstrap) ? disabledBootstrap : undefined,
            services: services && typeof services === "object" ? services : undefined,
            discovery: discovery && typeof discovery === "object" ? discovery : undefined,
            transports: transports && typeof transports === "object" ? transports : undefined,
            enableWebRTC: enableWebRTC !== false,
            enableCircuitRelay: enableCircuitRelay !== false,
            pnetKey: typeof pnetKey === "string" && pnetKey.trim() ? pnetKey : undefined,
        }, nodeId);
        const node = libp2pService.getNode(nodeId);
        const snap = node.snapshot();
        context.workspace.addLog(`libp2p[${snap.label}] started — peerId ${snap.peerId?.slice(0, 16)}…`);
        return {
            nodeId: snap.nodeId,
            label: snap.label,
            status: snap.status,
            peerId: snap.peerId,
            multiaddrs: snap.multiaddrs,
        };
    },
};

// ── libp2p_stop ──

export const libp2pStopCommand: CommandDefinition = {
    id: "libp2p_stop",
    description: "Stop the running libp2p node and close all connections.",
    tags: ["libp2p", "network", "p2p"],
    rbac: ["orchestrator", "builder"],
    args: { nodeId: NODE_ID_ARG },
    output: "Confirmation that the node is stopped.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        await libp2pService.stop(args.nodeId);
        const snap = libp2pService.getNode(args.nodeId).snapshot();
        context.workspace.addLog(`libp2p[${snap.label}] stopped`);
        return { nodeId: snap.nodeId, status: "stopped" };
    },
};

// ── libp2p_dial ──

export const libp2pDialCommand: CommandDefinition = {
    id: "libp2p_dial",
    description: "Dial a remote peer by multiaddr or peer id.",
    tags: ["libp2p", "network", "p2p"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        target: {
            name: "target",
            type: "string",
            description: "Multiaddr (e.g. /dnsaddr/example.com/p2p/Qm…) or bare peer id.",
            required: true,
        },
    },
    output: "JSON object with the connected remote peer id.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const { nodeId, target } = args;
        if (!target || typeof target !== "string") throw new Error("target is required");
        const result = await libp2pService.dial(target, nodeId);
        context.workspace.addLog(`libp2p dialed ${result.remotePeer.slice(0, 16)}…`);
        return result;
    },
};

// ── libp2p_ping ──

export const libp2pPingCommand: CommandDefinition = {
    id: "libp2p_ping",
    description: "Ping a connected peer and return its latency in ms.",
    tags: ["libp2p", "network", "diagnostics"],
    rbac: ["orchestrator", "builder", "validator"],
    args: {
        nodeId: NODE_ID_ARG,
        peerId: {
            name: "peerId",
            type: "string",
            description: "Remote peer id to ping.",
            required: true,
        },
    },
    output: "JSON object with peerId and latencyMs.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const { nodeId, peerId } = args;
        if (!peerId || typeof peerId !== "string") throw new Error("peerId is required");
        const latencyMs = await libp2pService.ping(peerId, nodeId);
        return { peerId, latencyMs };
    },
};

// ── libp2p_list_peers ──

export const libp2pListPeersCommand: CommandDefinition = {
    id: "libp2p_list_peers",
    description: "List discovered and connected libp2p peers for a node.",
    tags: ["libp2p", "network"],
    rbac: ["orchestrator", "builder", "validator", "researcher"],
    args: {
        nodeId: NODE_ID_ARG,
        connectedOnly: {
            name: "connectedOnly",
            type: "boolean",
            description: "If true, only return peers with an open connection.",
            required: false,
            defaultValue: false,
        },
    },
    output: "JSON array of peer descriptors.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const snap = libp2pService.getNode(args.nodeId).snapshot();
        const peers = args.connectedOnly ? snap.peers.filter((p) => p.connected) : snap.peers;
        return { nodeId: snap.nodeId, count: peers.length, peers };
    },
};

// ── libp2p_pubsub_subscribe ──

export const libp2pPubsubSubscribeCommand: CommandDefinition = {
    id: "libp2p_pubsub_subscribe",
    description: "Subscribe to a gossipsub topic.",
    tags: ["libp2p", "pubsub"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        topic: { name: "topic", type: "string", description: "Topic name.", required: true },
    },
    output: "JSON confirming the subscription.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const { nodeId, topic } = args;
        if (!topic || typeof topic !== "string") throw new Error("topic is required");
        await libp2pService.subscribeTopic(topic, nodeId);
        return { topic, subscribed: true };
    },
};

// ── libp2p_pubsub_publish ──

export const libp2pPubsubPublishCommand: CommandDefinition = {
    id: "libp2p_pubsub_publish",
    description: "Publish a message to a gossipsub topic.",
    tags: ["libp2p", "pubsub"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        topic: { name: "topic", type: "string", description: "Topic name.", required: true },
        message: { name: "message", type: "string", description: "Message body (UTF-8).", required: true },
    },
    output: "JSON confirming the publish.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const { nodeId, topic, message } = args;
        if (!topic || typeof topic !== "string") throw new Error("topic is required");
        if (typeof message !== "string") throw new Error("message is required");
        await libp2pService.publish(topic, message, nodeId);
        return { topic, published: true, bytes: message.length };
    },
};

// ── libp2p_hangup ──

export const libp2pHangupCommand: CommandDefinition = {
    id: "libp2p_hangup",
    description: "Close the open connection to a remote peer.",
    tags: ["libp2p", "network", "p2p"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        peerId: {
            name: "peerId",
            type: "string",
            description: "Remote peer id to disconnect from.",
            required: true,
        },
    },
    output: "JSON confirming the hangup.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const { nodeId, peerId } = args;
        if (!peerId || typeof peerId !== "string") throw new Error("peerId is required");
        await libp2pService.hangUp(peerId, nodeId);
        context.workspace.addLog(`libp2p disconnected ${peerId.slice(0, 16)}…`);
        return { peerId, disconnected: true };
    },
};

// ── libp2p_pubsub_unsubscribe ──

export const libp2pPubsubUnsubscribeCommand: CommandDefinition = {
    id: "libp2p_pubsub_unsubscribe",
    description: "Unsubscribe from a gossipsub topic.",
    tags: ["libp2p", "pubsub"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        topic: { name: "topic", type: "string", description: "Topic name.", required: true },
    },
    output: "JSON confirming the unsubscribe.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const { nodeId, topic } = args;
        if (!topic || typeof topic !== "string") throw new Error("topic is required");
        await libp2pService.unsubscribeTopic(topic, nodeId);
        return { topic, subscribed: false };
    },
};

// ── libp2p_clear_peers ──

export const libp2pClearPeersCommand: CommandDefinition = {
    id: "libp2p_clear_peers",
    description: "Clear the local peer book (does not affect open connections).",
    tags: ["libp2p", "network"],
    rbac: ["orchestrator", "builder"],
    args: { nodeId: NODE_ID_ARG },
    output: "JSON confirming the peer book was cleared.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        libp2pService.clearPeers(args.nodeId);
        return { cleared: true };
    },
};

// ── libp2p_add_node ──

export const libp2pAddNodeCommand: CommandDefinition = {
    id: "libp2p_add_node",
    description: "Spawn a new libp2p node entry. The node is created in the stopped state and becomes active.",
    tags: ["libp2p", "node"],
    rbac: ["orchestrator", "builder"],
    args: {
        label: {
            name: "label",
            type: "string",
            description: "Optional human-friendly label (e.g. \"Relay tester\").",
            required: false,
        },
    },
    output: "JSON with the new node's local id and label.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const id = libp2pService.addNode(args.label);
        context.workspace.addLog(`libp2p node added (${id})`);
        const snap = libp2pService.getNode(id).snapshot();
        return { nodeId: snap.nodeId, label: snap.label };
    },
};

// ── libp2p_remove_node ──

export const libp2pRemoveNodeCommand: CommandDefinition = {
    id: "libp2p_remove_node",
    description: "Stop and remove a libp2p node entry.",
    tags: ["libp2p", "node"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: { ...NODE_ID_ARG, required: true, description: "Local node id to remove." },
    },
    output: "JSON confirming the removal.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        if (!args.nodeId) throw new Error("nodeId is required");
        await libp2pService.removeNode(args.nodeId);
        context.workspace.addLog(`libp2p node removed (${args.nodeId})`);
        return { nodeId: args.nodeId, removed: true };
    },
};

// ── libp2p_set_active_node ──

export const libp2pSetActiveNodeCommand: CommandDefinition = {
    id: "libp2p_set_active_node",
    description: "Switch the UI/active focus to another libp2p node.",
    tags: ["libp2p", "node"],
    rbac: ["orchestrator", "builder", "researcher"],
    args: {
        nodeId: { ...NODE_ID_ARG, required: true, description: "Local node id to make active." },
    },
    output: "JSON with the new active node id.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        if (!args.nodeId) throw new Error("nodeId is required");
        libp2pService.setActive(args.nodeId);
        return { activeId: args.nodeId };
    },
};

// ── libp2p_rename_node ──

export const libp2pRenameNodeCommand: CommandDefinition = {
    id: "libp2p_rename_node",
    description: "Rename a libp2p node's UI label.",
    tags: ["libp2p", "node"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        label: { name: "label", type: "string", description: "New label.", required: true },
    },
    output: "JSON confirming the rename.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        if (!args.label || typeof args.label !== "string") throw new Error("label is required");
        const id = args.nodeId ?? libp2pService.getActiveId();
        if (!id) throw new Error("No node selected");
        libp2pService.setLabel(id, args.label);
        return { nodeId: id, label: args.label };
    },
};

// ── libp2p_generate_identity ──

export const libp2pGenerateIdentityCommand: CommandDefinition = {
    id: "libp2p_generate_identity",
    description: "Generate a fresh Ed25519 identity for the node. The node must be stopped. The new key is used on the next start.",
    tags: ["libp2p", "identity"],
    rbac: ["orchestrator", "builder"],
    args: { nodeId: NODE_ID_ARG },
    output: "JSON with the resulting peer id hint.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const result = await libp2pService.generateIdentity(args.nodeId);
        context.workspace.addLog(`libp2p generated identity ${result.peerIdHint.slice(0, 16)}…`);
        return { peerId: result.peerIdHint };
    },
};

// ── libp2p_import_identity ──

export const libp2pImportIdentityCommand: CommandDefinition = {
    id: "libp2p_import_identity",
    description: "Import a base64-encoded protobuf private key. The node must be stopped; the key is used on the next start.",
    tags: ["libp2p", "identity"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        privateKey: {
            name: "privateKey",
            type: "string",
            description: "Base64 protobuf-encoded libp2p PrivateKey (the format produced by libp2p_export_identity).",
            required: true,
        },
    },
    output: "JSON with the resulting peer id hint.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        if (!args.privateKey || typeof args.privateKey !== "string") {
            throw new Error("privateKey is required");
        }
        const result = await libp2pService.importIdentity(args.privateKey, args.nodeId);
        context.workspace.addLog(`libp2p imported identity ${result.peerIdHint.slice(0, 16)}…`);
        return { peerId: result.peerIdHint };
    },
};

// ── libp2p_export_identity ──

export const libp2pExportIdentityCommand: CommandDefinition = {
    id: "libp2p_export_identity",
    description: "Export the node's private key (base64 protobuf) along with its peer id. Treat the returned key as a credential.",
    tags: ["libp2p", "identity"],
    rbac: ["orchestrator", "builder"],
    args: { nodeId: NODE_ID_ARG },
    output: "JSON with peerId and base64 privateKey.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const result = await libp2pService.exportIdentity(args.nodeId);
        context.workspace.addLog(`libp2p exported identity ${result.peerId.slice(0, 16)}…`);
        const actor = context.auth?.user as { id?: string; role?: string } | null | undefined;
        logAudit("libp2p.identity.export", {
            peerId: result.peerId,
            nodeId: args.nodeId,
            surface: "command",
            actorRole: actor?.role,
            actorId: actor?.id,
            timestamp: new Date().toISOString(),
        });
        return result;
    },
};

// ── libp2p_clear_identity ──

export const libp2pClearIdentityCommand: CommandDefinition = {
    id: "libp2p_clear_identity",
    description: "Forget the node's preloaded identity so libp2p mints a fresh one on next start. The node must be stopped.",
    tags: ["libp2p", "identity"],
    rbac: ["orchestrator", "builder"],
    args: { nodeId: NODE_ID_ARG },
    output: "JSON confirming the identity was cleared.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        libp2pService.clearIdentity(args.nodeId);
        return { cleared: true };
    },
};

// ── Contact book ────────────────────────────────────────────

export const libp2pContactAddCommand: CommandDefinition = {
    id: "libp2p_contact_add",
    description: "Save a peer to the contact book.",
    tags: ["libp2p", "contacts"],
    rbac: ["orchestrator", "builder", "researcher"],
    args: {
        peerId: { name: "peerId", type: "string", description: "libp2p peer id.", required: true },
        name: { name: "name", type: "string", description: "Friendly name.", required: false },
        multiaddr: { name: "multiaddr", type: "string", description: "Default multiaddr to dial.", required: false },
        notes: { name: "notes", type: "string", description: "Optional notes.", required: false },
        tags: { name: "tags", type: "array", description: "Optional tags.", required: false },
    },
    output: "JSON with the new contact id.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        if (!args.peerId || typeof args.peerId !== "string") throw new Error("peerId is required");
        const c = useLibp2pCollections.getState().addContact({
            peerId: args.peerId,
            name: args.name,
            multiaddr: args.multiaddr,
            notes: args.notes,
            tags: Array.isArray(args.tags) ? args.tags : undefined,
        });
        return { id: c.id, peerId: c.peerId };
    },
};

export const libp2pContactRemoveCommand: CommandDefinition = {
    id: "libp2p_contact_remove",
    description: "Remove a contact from the contact book.",
    tags: ["libp2p", "contacts"],
    rbac: ["orchestrator", "builder"],
    args: { id: { name: "id", type: "string", description: "Contact id.", required: true } },
    output: "JSON confirming the removal.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        if (!args.id || typeof args.id !== "string") throw new Error("id is required");
        useLibp2pCollections.getState().removeContact(args.id);
        return { id: args.id, removed: true };
    },
};

export const libp2pContactListCommand: CommandDefinition = {
    id: "libp2p_contact_list",
    description: "List all saved contacts.",
    tags: ["libp2p", "contacts"],
    rbac: ["orchestrator", "builder", "researcher", "validator"],
    args: {},
    output: "JSON array of contacts.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async () => {
        const contacts = useLibp2pCollections.getState().contacts;
        return { count: contacts.length, contacts };
    },
};

export const libp2pContactDialCommand: CommandDefinition = {
    id: "libp2p_contact_dial",
    description: "Dial a saved contact (uses its multiaddr if present, otherwise its peer id).",
    tags: ["libp2p", "contacts", "network"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        contactId: { name: "contactId", type: "string", description: "Contact id.", required: true },
    },
    output: "JSON with the connected remote peer id.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        if (!args.contactId || typeof args.contactId !== "string") throw new Error("contactId is required");
        const c = getContact(args.contactId);
        const target = c.multiaddr || c.peerId;
        const result = await libp2pService.dial(target, args.nodeId);
        context.workspace.addLog(`libp2p dialed contact ${c.name ?? c.peerId.slice(0, 12)}`);
        return result;
    },
};

// ── Identity vault ───────────────────────────────────────────

export const libp2pVaultStoreCommand: CommandDefinition = {
    id: "libp2p_vault_store",
    description: "Encrypt a libp2p private key with a passphrase and store it in the identity vault.",
    tags: ["libp2p", "identity", "vault"],
    rbac: ["orchestrator", "builder"],
    args: {
        label: { name: "label", type: "string", description: "Friendly label.", required: true },
        peerId: { name: "peerId", type: "string", description: "Peer id derived from the key.", required: true },
        privateKey: { name: "privateKey", type: "string", description: "Base64 protobuf private key (treated as a credential).", required: true },
        passphrase: { name: "passphrase", type: "string", description: "Passphrase used to encrypt.", required: true },
        notes: { name: "notes", type: "string", description: "Optional notes (plaintext).", required: false },
    },
    output: "JSON with the new vault entry id and peer id.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        if (!args.label || !args.peerId || !args.privateKey || !args.passphrase) {
            throw new Error("label, peerId, privateKey and passphrase are required");
        }
        const enc = await encryptIdentity(args.privateKey, args.passphrase);
        const entry = useLibp2pCollections.getState().addVaultEntry({
            label: args.label,
            peerId: args.peerId,
            ciphertext: enc.ciphertext,
            salt: enc.salt,
            iv: enc.iv,
            notes: args.notes,
        });
        return { id: entry.id, peerId: entry.peerId };
    },
};

export const libp2pVaultRemoveCommand: CommandDefinition = {
    id: "libp2p_vault_remove",
    description: "Remove an encrypted identity from the vault.",
    tags: ["libp2p", "identity", "vault"],
    rbac: ["orchestrator", "builder"],
    args: { id: { name: "id", type: "string", description: "Vault entry id.", required: true } },
    output: "JSON confirming the removal.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        if (!args.id || typeof args.id !== "string") throw new Error("id is required");
        useLibp2pCollections.getState().removeVaultEntry(args.id);
        return { id: args.id, removed: true };
    },
};

export const libp2pVaultListCommand: CommandDefinition = {
    id: "libp2p_vault_list",
    description: "List vault entries (without decrypting).",
    tags: ["libp2p", "identity", "vault"],
    rbac: ["orchestrator", "builder", "researcher", "validator"],
    args: {},
    output: "JSON array of vault entries (metadata only).",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async () => {
        const vault = useLibp2pCollections.getState().vault.map((v) => ({
            id: v.id,
            label: v.label,
            peerId: v.peerId,
            notes: v.notes,
            createdAt: v.createdAt,
        }));
        return { count: vault.length, vault };
    },
};

export const libp2pVaultLoadCommand: CommandDefinition = {
    id: "libp2p_vault_load",
    description: "Decrypt a vault identity and load it into the active node for the next start. The node must be stopped.",
    tags: ["libp2p", "identity", "vault"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        vaultId: { name: "vaultId", type: "string", description: "Vault entry id.", required: true },
        passphrase: { name: "passphrase", type: "string", description: "Passphrase that protects the entry.", required: true },
    },
    output: "JSON with the loaded peer id.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        if (!args.vaultId || !args.passphrase) throw new Error("vaultId and passphrase are required");
        const entry = getVaultEntry(args.vaultId);
        const privateKey = await decryptIdentity(entry, args.passphrase);
        const result = await libp2pService.importIdentity(privateKey, args.nodeId);
        context.workspace.addLog(`libp2p loaded vault identity "${entry.label}" (${result.peerIdHint.slice(0, 12)}…)`);
        return { vaultId: entry.id, peerId: result.peerIdHint };
    },
};

export const libp2pVaultExportCurrentCommand: CommandDefinition = {
    id: "libp2p_vault_export_current",
    description: "Encrypt the active node's current identity and store it in the vault.",
    tags: ["libp2p", "identity", "vault"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        label: { name: "label", type: "string", description: "Friendly label for the vault entry.", required: true },
        passphrase: { name: "passphrase", type: "string", description: "Passphrase to encrypt the key.", required: true },
        notes: { name: "notes", type: "string", description: "Optional notes.", required: false },
    },
    output: "JSON with the new vault entry id and peer id.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        if (!args.label || !args.passphrase) throw new Error("label and passphrase are required");
        const exported = await libp2pService.exportIdentity(args.nodeId);
        const enc = await encryptIdentity(exported.privateKey, args.passphrase);
        const entry = useLibp2pCollections.getState().addVaultEntry({
            label: args.label,
            peerId: exported.peerId,
            ciphertext: enc.ciphertext,
            salt: enc.salt,
            iv: enc.iv,
            notes: args.notes,
        });
        context.workspace.addLog(`libp2p stored "${entry.label}" in vault (${entry.peerId.slice(0, 12)}…)`);
        return { id: entry.id, peerId: entry.peerId };
    },
};

// ── pnet (private swarm) commands ──

export const libp2pPnetGenerateCommand: CommandDefinition = {
    id: "libp2p_pnet_generate",
    description: "Generate a new libp2p private-swarm pre-shared key, encrypt it with a passphrase, and store it in the networks collection.",
    tags: ["libp2p", "network", "pnet"],
    rbac: ["orchestrator", "builder"],
    args: {
        label: { name: "label", type: "string", description: "Friendly label for the network.", required: true },
        passphrase: { name: "passphrase", type: "string", description: "Passphrase used to encrypt the PSK at rest.", required: true },
        notes: { name: "notes", type: "string", description: "Optional notes.", required: false },
    },
    output: "JSON with the new network entry id and fingerprint.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        if (!args.label || !args.passphrase) throw new Error("label and passphrase are required");
        const asciiKey = generatePnetKey();
        const fingerprint = await fingerprintPnetKey(asciiKey);
        const enc = await encryptPnetKey(asciiKey, args.passphrase);
        const entry = useLibp2pCollections.getState().addPnetEntry({
            label: args.label,
            fingerprint,
            ciphertext: enc.ciphertext,
            salt: enc.salt,
            iv: enc.iv,
            notes: args.notes,
        });
        context.workspace.addLog(`libp2p generated pnet "${entry.label}" (fp:${fingerprint})`);
        return { id: entry.id, label: entry.label, fingerprint };
    },
};

export const libp2pPnetAddCommand: CommandDefinition = {
    id: "libp2p_pnet_add",
    description: "Import an existing libp2p PSK document, encrypt it with a passphrase, and store it in the networks collection.",
    tags: ["libp2p", "network", "pnet"],
    rbac: ["orchestrator", "builder"],
    args: {
        label: { name: "label", type: "string", description: "Friendly label for the network.", required: true },
        psk: { name: "psk", type: "string", description: "The PSK ascii document (must begin with /key/swarm/psk/1.0.0/).", required: true },
        passphrase: { name: "passphrase", type: "string", description: "Passphrase used to encrypt the PSK at rest.", required: true },
        notes: { name: "notes", type: "string", description: "Optional notes.", required: false },
    },
    output: "JSON with the new network entry id and fingerprint.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        if (!args.label || !args.psk || !args.passphrase) {
            throw new Error("label, psk and passphrase are required");
        }
        const asciiKey = normalisePnetKey(args.psk);
        const fingerprint = await fingerprintPnetKey(asciiKey);
        const enc = await encryptPnetKey(asciiKey, args.passphrase);
        const entry = useLibp2pCollections.getState().addPnetEntry({
            label: args.label,
            fingerprint,
            ciphertext: enc.ciphertext,
            salt: enc.salt,
            iv: enc.iv,
            notes: args.notes,
        });
        context.workspace.addLog(`libp2p imported pnet "${entry.label}" (fp:${fingerprint})`);
        return { id: entry.id, label: entry.label, fingerprint };
    },
};

export const libp2pPnetListCommand: CommandDefinition = {
    id: "libp2p_pnet_list",
    description: "List stored private-network entries (without decrypting).",
    tags: ["libp2p", "network", "pnet"],
    rbac: ["orchestrator", "builder", "researcher", "validator"],
    args: {},
    output: "JSON array of network entry metadata.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async () => {
        const networks = useLibp2pCollections.getState().networks.map((n) => ({
            id: n.id,
            label: n.label,
            fingerprint: n.fingerprint,
            notes: n.notes,
            createdAt: n.createdAt,
        }));
        return { count: networks.length, networks };
    },
};

export const libp2pPnetRemoveCommand: CommandDefinition = {
    id: "libp2p_pnet_remove",
    description: "Remove a stored private-network entry.",
    tags: ["libp2p", "network", "pnet"],
    rbac: ["orchestrator", "builder"],
    args: { id: { name: "id", type: "string", description: "Network entry id.", required: true } },
    output: "JSON confirming the removal.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        if (!args.id || typeof args.id !== "string") throw new Error("id is required");
        useLibp2pCollections.getState().removePnetEntry(args.id);
        return { id: args.id, removed: true };
    },
};

export const libp2pPnetApplyCommand: CommandDefinition = {
    id: "libp2p_pnet_apply",
    description: "Decrypt a stored private-network key and start the node on that swarm. Node must be stopped.",
    tags: ["libp2p", "network", "pnet"],
    rbac: ["orchestrator", "builder"],
    args: {
        nodeId: NODE_ID_ARG,
        pnetId: { name: "pnetId", type: "string", description: "Network entry id.", required: true },
        passphrase: { name: "passphrase", type: "string", description: "Passphrase that protects the entry.", required: true },
    },
    output: "JSON with the started node status and the network fingerprint.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        if (!args.pnetId || !args.passphrase) throw new Error("pnetId and passphrase are required");
        const entry = getPnetEntry(args.pnetId);
        const asciiKey = await decryptPnetKey(entry, args.passphrase);
        await libp2pService.start({ pnetKey: asciiKey }, args.nodeId);
        const snap = libp2pService.getNode(args.nodeId).snapshot();
        context.workspace.addLog(`libp2p[${snap.label}] joined pnet "${entry.label}" (fp:${entry.fingerprint ?? "?"})`);
        return {
            nodeId: snap.nodeId,
            label: snap.label,
            status: snap.status,
            peerId: snap.peerId,
            pnetId: entry.id,
            pnetLabel: entry.label,
            fingerprint: entry.fingerprint,
        };
    },
};

export const libp2pCommands: CommandDefinition[] = [
    libp2pStartCommand,
    libp2pStopCommand,
    libp2pDialCommand,
    libp2pHangupCommand,
    libp2pPingCommand,
    libp2pListPeersCommand,
    libp2pPubsubSubscribeCommand,
    libp2pPubsubUnsubscribeCommand,
    libp2pPubsubPublishCommand,
    libp2pClearPeersCommand,
    libp2pAddNodeCommand,
    libp2pRemoveNodeCommand,
    libp2pSetActiveNodeCommand,
    libp2pRenameNodeCommand,
    libp2pGenerateIdentityCommand,
    libp2pImportIdentityCommand,
    libp2pExportIdentityCommand,
    libp2pClearIdentityCommand,
    libp2pContactAddCommand,
    libp2pContactRemoveCommand,
    libp2pContactListCommand,
    libp2pContactDialCommand,
    libp2pVaultStoreCommand,
    libp2pVaultRemoveCommand,
    libp2pVaultListCommand,
    libp2pVaultLoadCommand,
    libp2pVaultExportCurrentCommand,
    libp2pPnetGenerateCommand,
    libp2pPnetAddCommand,
    libp2pPnetListCommand,
    libp2pPnetRemoveCommand,
    libp2pPnetApplyCommand,
];
