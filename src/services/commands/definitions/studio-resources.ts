/**
 * Studio Resource Commands — Deliverables, Storage defaults, and Entity Inputs.
 */

import { CommandDefinition } from "@/services/commands/types";

// ────────────────────────────────────────────────────
// Deliverables
// ────────────────────────────────────────────────────

export const studioAddDeliverableCommand: CommandDefinition = {
    id: "studio_add_deliverable",
    description: "Adds a deliverable declaration to the Studio job. Deliverables are declared outputs the job is expected to produce.",
    tags: ["studio", "edit", "deliverable"],
    rbac: ["orchestrator", "builder"],
    args: {
        key: { name: "key", type: "string", description: "Unique key for the deliverable (used in output mappings and bindings)", required: true },
        label: { name: "label", type: "string", description: "Display label", required: true },
        type: { name: "type", type: "string", description: "Artifact type: markdown | json | yaml | csv | image | code", required: false, defaultValue: "json" },
        description: { name: "description", type: "string", description: "Description of what this deliverable contains", required: false },
    },
    output: "Added deliverable info",
    execute: async (args, context) => {
        const studio = context.extensions?.studio as import("@/context/StudioContext").StudioAPI | undefined;
        if (!studio) return { error: "Studio is not available." };
        studio.addDeliverableEntry({ key: args.key, label: args.label, type: args.type, description: args.description });
        return { key: args.key, label: args.label, type: args.type };
    },
};

export const studioRemoveDeliverableCommand: CommandDefinition = {
    id: "studio_remove_deliverable",
    description: "Removes a deliverable from the Studio job by its index (0-based).",
    tags: ["studio", "edit", "deliverable"],
    rbac: ["orchestrator", "builder"],
    args: {
        index: { name: "index", type: "number", description: "Index of the deliverable to remove (0-based)", required: true },
    },
    output: "Removal confirmation",
    execute: async (args, context) => {
        const studio = context.extensions?.studio as import("@/context/StudioContext").StudioAPI | undefined;
        if (!studio) return { error: "Studio is not available." };
        studio.removeDeliverableEntry(args.index);
        return { removed: args.index };
    },
};

// ────────────────────────────────────────────────────
// Storage Defaults
// ────────────────────────────────────────────────────

export const studioAddStorageCommand: CommandDefinition = {
    id: "studio_add_storage",
    description: "Adds a default storage key-value pair to the Studio job. Storage provides inter-step shared state.",
    tags: ["studio", "edit", "storage"],
    rbac: ["orchestrator", "builder"],
    args: {
        key: { name: "key", type: "string", description: "Storage key name", required: true },
        value: { name: "value", type: "string", description: "Default value (string or JSON)", required: false, defaultValue: "" },
    },
    output: "Added storage entry",
    execute: async (args, context) => {
        const studio = context.extensions?.studio as import("@/context/StudioContext").StudioAPI | undefined;
        if (!studio) return { error: "Studio is not available." };
        studio.addStorageEntryWithValues(args.key, args.value);
        return { key: args.key, value: args.value };
    },
};

export const studioRemoveStorageCommand: CommandDefinition = {
    id: "studio_remove_storage",
    description: "Removes a storage entry from the Studio job by its index (0-based).",
    tags: ["studio", "edit", "storage"],
    rbac: ["orchestrator", "builder"],
    args: {
        index: { name: "index", type: "number", description: "Index of the storage entry to remove (0-based)", required: true },
    },
    output: "Removal confirmation",
    execute: async (args, context) => {
        const studio = context.extensions?.studio as import("@/context/StudioContext").StudioAPI | undefined;
        if (!studio) return { error: "Studio is not available." };
        studio.removeStorageEntry(args.index);
        return { removed: args.index };
    },
};

// ────────────────────────────────────────────────────
// Entity Inputs
// ────────────────────────────────────────────────────

export const studioAddInputCommand: CommandDefinition = {
    id: "studio_add_input",
    description: "Adds an entity input reference to the Studio job. Inputs map friendly names to entity IDs (agents, channels, groups, networks) and are resolved via $input.name in step args at runtime.",
    tags: ["studio", "edit", "input"],
    rbac: ["orchestrator", "builder"],
    args: {
        name: { name: "name", type: "string", description: "Friendly name for the entity input (used as $input.name)", required: true },
        type: { name: "type", type: "string", description: "Input type — workspace entity or value type", required: true, enum: ["agent", "channel", "group", "network", "text", "number_range", "list"] },
        entityId: { name: "entityId", type: "string", description: "The entity ID to map to", required: false, defaultValue: "" },
    },
    output: "Added entity input",
    execute: async (args, context) => {
        const studio = context.extensions?.studio as import("@/context/StudioContext").StudioAPI | undefined;
        if (!studio) return { error: "Studio is not available." };
        studio.addInput({ name: args.name, type: args.type, entityId: args.entityId || "" });
        return { name: args.name, type: args.type, entityId: args.entityId };
    },
};

export const studioRemoveInputCommand: CommandDefinition = {
    id: "studio_remove_input",
    description: "Removes an entity input from the Studio job by its index (0-based).",
    tags: ["studio", "edit", "input"],
    rbac: ["orchestrator", "builder"],
    args: {
        index: { name: "index", type: "number", description: "Index of the input to remove (0-based)", required: true },
    },
    output: "Removal confirmation",
    execute: async (args, context) => {
        const studio = context.extensions?.studio as import("@/context/StudioContext").StudioAPI | undefined;
        if (!studio) return { error: "Studio is not available." };
        studio.removeInput(args.index);
        return { removed: args.index };
    },
};

export const studioUpdateInputCommand: CommandDefinition = {
    id: "studio_update_input",
    description: "Updates a field on an entity input in the Studio job.",
    tags: ["studio", "edit", "input"],
    rbac: ["orchestrator", "builder"],
    args: {
        index: { name: "index", type: "number", description: "Index of the input to update (0-based)", required: true },
        field: { name: "field", type: "string", description: "Field to update", required: true, enum: ["name", "type", "entityId", "placeholder", "min", "max", "step", "options", "multiSelect"] },
        value: { name: "value", type: "string", description: "New value for the field", required: true },
    },
    output: "Updated input",
    execute: async (args, context) => {
        const studio = context.extensions?.studio as import("@/context/StudioContext").StudioAPI | undefined;
        if (!studio) return { error: "Studio is not available." };
        studio.updateInput(args.index, args.field as any, args.value);
        return { index: args.index, field: args.field, value: args.value };
    },
};
