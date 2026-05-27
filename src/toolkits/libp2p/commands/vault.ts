/**
 * libp2p identity-vault commands (encrypted key storage).
 *
 * Split from commands/index.ts per §3.7 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
import type { CommandDefinition } from "@/services/commands/types";
import { libp2pService } from "../service";
import {
    useLibp2pCollections,
    encryptIdentity,
    decryptIdentity,
    getVaultEntry,
} from "../utils/collections";
import { NODE_ID_ARG } from "./shared";

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
