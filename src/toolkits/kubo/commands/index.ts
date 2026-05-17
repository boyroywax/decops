/**
 * Kubo toolkit commands.
 *
 * Thin wrappers around {@link kuboService} so each capability is invokable
 * from chat, jobs, or the React UI. Node-scoped commands accept an optional
 * `nodeId`; when omitted they target the currently-active Kubo node.
 */

import type { CommandDefinition } from "@/services/commands/types";
import { kuboService } from "../service";

const NODE_ID_ARG = {
    name: "nodeId",
    type: "string" as const,
    description: "Local Kubo node id. Defaults to the currently-active node.",
    required: false,
};

const ROLES_RW = ["orchestrator", "builder"] as const;
const ROLES_RO = ["orchestrator", "builder", "researcher"] as const;

// ── Lifecycle ──

export const kuboConnectCommand: CommandDefinition = {
    id: "kubo_connect",
    description:
        "Connect to a remote Kubo IPFS daemon over its HTTP RPC API. The handshake calls `id()` " +
        "and surfaces the remote peer's identity on the node snapshot.",
    tags: ["kubo", "ipfs", "connect"],
    rbac: [...ROLES_RW],
    args: {
        nodeId: NODE_ID_ARG,
        url: { name: "url", type: "string", description: "Override the configured API URL (e.g. http://127.0.0.1:5001).", required: false },
        authorization: { name: "authorization", type: "string", description: "Authorization header value (e.g. 'Bearer …').", required: false },
        timeoutMs: { name: "timeoutMs", type: "number", description: "Per-request timeout in milliseconds.", required: false },
    },
    output: "JSON object with the remote peer identity.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const { nodeId, url, authorization, timeoutMs } = args;
        await kuboService.connect({
            url: typeof url === "string" && url.trim() ? url.trim() : undefined,
            authorization: typeof authorization === "string" ? authorization : undefined,
            timeoutMs: typeof timeoutMs === "number" ? timeoutMs : undefined,
        }, nodeId);
        const snap = kuboService.getNode(nodeId).snapshot();
        context.workspace.addLog(`kubo[${snap.label}] connected → ${snap.peer?.peerId?.slice(0, 16) ?? "?"}…`);
        return { nodeId: snap.nodeId, label: snap.label, endpoint: snap.endpoint, peer: snap.peer };
    },
};

export const kuboDisconnectCommand: CommandDefinition = {
    id: "kubo_disconnect",
    description: "Drop the local client reference. The remote Kubo daemon keeps running.",
    tags: ["kubo", "ipfs"],
    rbac: [...ROLES_RW],
    args: { nodeId: NODE_ID_ARG },
    output: "JSON object with the final status.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const { nodeId } = args;
        kuboService.disconnect(nodeId);
        const snap = kuboService.getNode(nodeId).snapshot();
        context.workspace.addLog(`kubo[${snap.label}] disconnected`);
        return { nodeId: snap.nodeId, status: snap.status };
    },
};

export const kuboAddNodeCommand: CommandDefinition = {
    id: "kubo_add_node",
    description: "Register a new Kubo endpoint (does not connect).",
    tags: ["kubo", "ipfs"],
    rbac: [...ROLES_RW],
    args: {
        label: { name: "label", type: "string", description: "Human label for the node.", required: false },
        url: { name: "url", type: "string", description: "HTTP RPC URL (default: http://127.0.0.1:5001).", required: false },
    },
    output: "Created node id.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const { label, url } = args;
        const id = kuboService.addNode(typeof label === "string" ? label : undefined, typeof url === "string" && url.trim() ? url.trim() : undefined);
        context.workspace.addLog(`kubo: added node ${id}`);
        return { nodeId: id };
    },
};

export const kuboRemoveNodeCommand: CommandDefinition = {
    id: "kubo_remove_node",
    description: "Remove a Kubo node from the local registry.",
    tags: ["kubo", "ipfs"],
    rbac: [...ROLES_RW],
    args: { nodeId: { name: "nodeId", type: "string", description: "Node id to remove.", required: true } },
    output: "JSON object with success flag.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const { nodeId } = args;
        await kuboService.removeNode(String(nodeId));
        context.workspace.addLog(`kubo: removed node ${nodeId}`);
        return { ok: true };
    },
};

export const kuboSetActiveNodeCommand: CommandDefinition = {
    id: "kubo_set_active_node",
    description: "Set the active Kubo node — subsequent commands default to it.",
    tags: ["kubo", "ipfs"],
    rbac: [...ROLES_RW],
    args: { nodeId: { name: "nodeId", type: "string", description: "Node id.", required: true } },
    output: "JSON object with the new active id.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const { nodeId } = args;
        kuboService.setActive(String(nodeId));
        return { activeId: kuboService.getActiveId() };
    },
};

export const kuboRenameNodeCommand: CommandDefinition = {
    id: "kubo_rename_node",
    description: "Rename a Kubo node.",
    tags: ["kubo", "ipfs"],
    rbac: [...ROLES_RW],
    args: {
        nodeId: { name: "nodeId", type: "string", description: "Node id.", required: true },
        label: { name: "label", type: "string", description: "New label.", required: true },
    },
    output: "JSON object with the updated label.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const { nodeId, label } = args;
        kuboService.setLabel(String(nodeId), String(label));
        return { nodeId, label };
    },
};

export const kuboSetEndpointCommand: CommandDefinition = {
    id: "kubo_set_endpoint",
    description: "Update endpoint URL / auth / timeout. Node must be disconnected first.",
    tags: ["kubo", "ipfs"],
    rbac: [...ROLES_RW],
    args: {
        nodeId: NODE_ID_ARG,
        url: { name: "url", type: "string", description: "HTTP RPC URL.", required: false },
        authorization: { name: "authorization", type: "string", description: "Authorization header value. Empty to clear.", required: false },
        timeoutMs: { name: "timeoutMs", type: "number", description: "Request timeout in ms.", required: false },
    },
    output: "JSON object with the updated endpoint config.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const { nodeId, url, authorization, timeoutMs } = args;
        kuboService.setConfig(nodeId, {
            endpoint: typeof url === "string" ? url : undefined,
            authorization: typeof authorization === "string" ? authorization : undefined,
            timeoutMs: typeof timeoutMs === "number" ? timeoutMs : undefined,
        });
        const snap = kuboService.getNode(nodeId).snapshot();
        return { nodeId: snap.nodeId, endpoint: snap.endpoint };
    },
};

// ── Identity / Status ──

export const kuboIdCommand: CommandDefinition = {
    id: "kubo_id",
    description: "Re-issue the `id()` handshake — returns the remote peer's identity.",
    tags: ["kubo", "ipfs", "identity"],
    rbac: [...ROLES_RO],
    args: { nodeId: NODE_ID_ARG },
    output: "JSON object with peerId, addresses, agentVersion, etc.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const { nodeId } = args;
        const peer = await kuboService.refresh(nodeId);
        return peer ?? {};
    },
};

export const kuboVersionCommand: CommandDefinition = {
    id: "kubo_version",
    description: "Report the remote Kubo version.",
    tags: ["kubo", "ipfs"],
    rbac: [...ROLES_RO],
    args: { nodeId: NODE_ID_ARG },
    output: "JSON object with version / commit / repo.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => kuboService.version(args.nodeId),
};

// ── Content ──

export const kuboAddTextCommand: CommandDefinition = {
    id: "kubo_add_text",
    description: "Add a UTF-8 string to IPFS via the remote daemon and return its CID.",
    tags: ["kubo", "ipfs", "add"],
    rbac: [...ROLES_RW],
    args: {
        nodeId: NODE_ID_ARG,
        text: { name: "text", type: "string", description: "Content to add.", required: true },
        label: { name: "label", type: "string", description: "Human label / file name.", required: false },
        pin: { name: "pin", type: "boolean", description: "Pin on the remote node (default: true).", required: false },
    },
    output: "JSON object with the new CID and size.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const { nodeId, text, label, pin } = args;
        const entry = await kuboService.addString(String(text), typeof label === "string" ? label : undefined, pin !== false, nodeId);
        context.workspace.addLog(`kubo: added ${entry.cid.slice(0, 16)}… (${entry.bytes ?? "?"} bytes${entry.pinned ? ", pinned" : ""})`);
        return entry;
    },
};

export const kuboAddJsonCommand: CommandDefinition = {
    id: "kubo_add_json",
    description: "Add a JSON-serialisable value to IPFS via the remote daemon.",
    tags: ["kubo", "ipfs", "add", "json"],
    rbac: [...ROLES_RW],
    args: {
        nodeId: NODE_ID_ARG,
        value: { name: "value", type: "object", description: "JSON-serialisable value.", required: true },
        label: { name: "label", type: "string", description: "Optional file name (e.g. data.json).", required: false },
        pin: { name: "pin", type: "boolean", description: "Pin on the remote node (default: true).", required: false },
    },
    output: "JSON object with the new CID and size.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const { nodeId, value, label, pin } = args;
        const entry = await kuboService.addJson(value, typeof label === "string" ? label : undefined, pin !== false, nodeId);
        context.workspace.addLog(`kubo: added json ${entry.cid.slice(0, 16)}…`);
        return entry;
    },
};

export const kuboAddBytesCommand: CommandDefinition = {
    id: "kubo_add_bytes",
    description: "Add base64-encoded bytes to IPFS via the remote daemon.",
    tags: ["kubo", "ipfs", "add", "binary"],
    rbac: [...ROLES_RW],
    args: {
        nodeId: NODE_ID_ARG,
        base64: { name: "base64", type: "string", description: "Base64-encoded payload.", required: true },
        label: { name: "label", type: "string", description: "File name or label.", required: false },
        pin: { name: "pin", type: "boolean", description: "Pin on the remote node (default: true).", required: false },
    },
    output: "JSON object with the new CID and size.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const { nodeId, base64, label, pin } = args;
        const bin = atob(String(base64));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const entry = await kuboService.addBytes(bytes, typeof label === "string" ? label : undefined, pin !== false, nodeId);
        context.workspace.addLog(`kubo: added ${entry.bytes ?? bytes.byteLength} bytes → ${entry.cid.slice(0, 16)}…`);
        return entry;
    },
};

export const kuboCatCommand: CommandDefinition = {
    id: "kubo_cat",
    description: "Fetch a CID (or IPFS path) from the remote daemon as a UTF-8 string.",
    tags: ["kubo", "ipfs", "cat", "fetch"],
    rbac: [...ROLES_RO],
    args: {
        nodeId: NODE_ID_ARG,
        cid: { name: "cid", type: "string", description: "CID or '/ipfs/CID/path' to fetch.", required: true },
    },
    output: "JSON object with the fetched text.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const { nodeId, cid } = args;
        const text = await kuboService.catString(String(cid), nodeId);
        context.workspace.addLog(`kubo: fetched ${String(cid).slice(0, 16)}… (${text.length} chars)`);
        return { cid, text, bytes: new TextEncoder().encode(text).byteLength };
    },
};

export const kuboLsCommand: CommandDefinition = {
    id: "kubo_ls",
    description: "List directory entries for an IPFS path.",
    tags: ["kubo", "ipfs", "ls"],
    rbac: [...ROLES_RO],
    args: {
        nodeId: NODE_ID_ARG,
        cid: { name: "cid", type: "string", description: "CID or '/ipfs/CID/path'.", required: true },
    },
    output: "JSON array of directory entries.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const entries = await kuboService.ls(String(args.cid), args.nodeId);
        return { entries };
    },
};

// ── Pinning ──

export const kuboPinCommand: CommandDefinition = {
    id: "kubo_pin",
    description: "Pin a CID on the remote Kubo node so it is preserved across GC.",
    tags: ["kubo", "ipfs", "pin"],
    rbac: [...ROLES_RW],
    args: {
        nodeId: NODE_ID_ARG,
        cid: { name: "cid", type: "string", description: "CID to pin.", required: true },
        recursive: { name: "recursive", type: "boolean", description: "Pin all linked blocks (default: true).", required: false },
        name: { name: "name", type: "string", description: "Optional pin name (Kubo ≥ 0.21).", required: false },
    },
    output: "JSON object with success flag.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const { nodeId, cid, recursive, name } = args;
        await kuboService.pin(String(cid), {
            recursive: recursive !== false,
            name: typeof name === "string" ? name : undefined,
        }, nodeId);
        context.workspace.addLog(`kubo: pinned ${String(cid).slice(0, 16)}…`);
        return { cid, pinned: true };
    },
};

export const kuboUnpinCommand: CommandDefinition = {
    id: "kubo_unpin",
    description: "Remove a pin from the remote Kubo node.",
    tags: ["kubo", "ipfs", "pin"],
    rbac: [...ROLES_RW],
    args: {
        nodeId: NODE_ID_ARG,
        cid: { name: "cid", type: "string", description: "CID to unpin.", required: true },
        recursive: { name: "recursive", type: "boolean", description: "Unpin recursively (default: true).", required: false },
    },
    output: "JSON object with success flag.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const { nodeId, cid, recursive } = args;
        await kuboService.unpin(String(cid), { recursive: recursive !== false }, nodeId);
        context.workspace.addLog(`kubo: unpinned ${String(cid).slice(0, 16)}…`);
        return { cid, pinned: false };
    },
};

export const kuboListPinsCommand: CommandDefinition = {
    id: "kubo_list_pins",
    description: "List pinned CIDs on the remote daemon.",
    tags: ["kubo", "ipfs", "pin"],
    rbac: [...ROLES_RO],
    args: {
        nodeId: NODE_ID_ARG,
        filter: { name: "filter", type: "string", description: "recursive | direct | indirect | all (default: all).", required: false },
    },
    output: "JSON array of pinned CIDs.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const { nodeId, filter } = args;
        const f = filter === "recursive" || filter === "direct" || filter === "indirect" || filter === "all" ? filter : undefined;
        const pins = await kuboService.listPins(f, nodeId);
        return { count: pins.length, pins };
    },
};

// ── Swarm ──

export const kuboSwarmPeersCommand: CommandDefinition = {
    id: "kubo_swarm_peers",
    description: "List libp2p peers currently connected to the remote daemon.",
    tags: ["kubo", "ipfs", "swarm", "p2p"],
    rbac: [...ROLES_RO],
    args: { nodeId: NODE_ID_ARG },
    output: "JSON array of connected peers.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const peers = await kuboService.listPeers(args.nodeId);
        return { count: peers.length, peers };
    },
};

export const kuboSwarmConnectCommand: CommandDefinition = {
    id: "kubo_swarm_connect",
    description: "Tell the remote daemon to dial a multiaddr.",
    tags: ["kubo", "ipfs", "swarm"],
    rbac: [...ROLES_RW],
    args: {
        nodeId: NODE_ID_ARG,
        multiaddr: { name: "multiaddr", type: "string", description: "e.g. /ip4/1.2.3.4/tcp/4001/p2p/Qm…", required: true },
    },
    output: "JSON object with success flag.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const { nodeId, multiaddr } = args;
        await kuboService.swarmConnect(String(multiaddr), nodeId);
        context.workspace.addLog(`kubo: swarm.connect → ${String(multiaddr).slice(0, 32)}…`);
        return { multiaddr, ok: true };
    },
};

// ── Activity log ──

export const kuboListEntriesCommand: CommandDefinition = {
    id: "kubo_list_entries",
    description: "List the local activity log of CIDs added/fetched via this UI.",
    tags: ["kubo", "ipfs", "history"],
    rbac: [...ROLES_RO],
    args: { nodeId: NODE_ID_ARG },
    output: "JSON object with the local entries cache.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args) => {
        const entries = kuboService.listEntries(args.nodeId);
        return { count: entries.length, entries };
    },
};

export const kuboClearEntriesCommand: CommandDefinition = {
    id: "kubo_clear_entries",
    description: "Clear the local activity log for a node (does NOT touch the remote daemon).",
    tags: ["kubo", "ipfs", "history"],
    rbac: [...ROLES_RW],
    args: { nodeId: NODE_ID_ARG },
    output: "JSON object with success flag.",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const { nodeId } = args;
        kuboService.clearEntries(nodeId);
        context.workspace.addLog("kubo: cleared local activity log");
        return { ok: true };
    },
};

// ── Bundle ──

export const kuboCommands: CommandDefinition[] = [
    kuboConnectCommand,
    kuboDisconnectCommand,
    kuboAddNodeCommand,
    kuboRemoveNodeCommand,
    kuboSetActiveNodeCommand,
    kuboRenameNodeCommand,
    kuboSetEndpointCommand,
    kuboIdCommand,
    kuboVersionCommand,
    kuboAddTextCommand,
    kuboAddJsonCommand,
    kuboAddBytesCommand,
    kuboCatCommand,
    kuboLsCommand,
    kuboPinCommand,
    kuboUnpinCommand,
    kuboListPinsCommand,
    kuboSwarmPeersCommand,
    kuboSwarmConnectCommand,
    kuboListEntriesCommand,
    kuboClearEntriesCommand,
];
