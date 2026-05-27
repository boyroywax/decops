/**
 * libp2p contact-book commands.
 *
 * Split from commands/index.ts per §3.7 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
import type { CommandDefinition } from "@/services/commands/types";
import { libp2pService } from "../service";
import { useLibp2pCollections, getContact } from "../utils/collections";
import { NODE_ID_ARG } from "./shared";

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
