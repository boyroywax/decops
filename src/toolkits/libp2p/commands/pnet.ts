/**
 * libp2p private-network (pnet) commands.
 *
 * Split from commands/index.ts per §3.7 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
import type { CommandDefinition } from "@/services/commands/types";
import { libp2pService } from "../service";
import {
    useLibp2pCollections,
    generatePnetKey,
    normalisePnetKey,
    encryptPnetKey,
    decryptPnetKey,
    fingerprintPnetKey,
    getPnetEntry,
} from "../utils/collections";
import { NODE_ID_ARG } from "./shared";

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
