/**
 * libp2p identity (key-material) commands.
 *
 * Split from commands/index.ts per §3.7 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
import type { CommandDefinition } from "@/services/commands/types";
import { libp2pService } from "../service";
import { logAudit } from "@/services/logging";
import { NODE_ID_ARG } from "./shared";

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
