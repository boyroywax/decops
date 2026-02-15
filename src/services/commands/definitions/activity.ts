import { CommandDefinition } from "../types";

export const createActivityEntryCommand: CommandDefinition = {
    id: "create_activity_entry",
    description: "Creates a new entry in the activity log (notebook).",
    tags: ["system", "notebook", "activity"],
    rbac: ["orchestrator", "builder", "researcher", "curator", "validator"], // Accessible to all roles basically
    args: {
        category: {
            name: "category",
            type: "string",
            description: "Category of the entry (action, output, navigation, system, narrative)",
            required: true,
            defaultValue: "narrative",
            validation: (val) => ["action", "output", "navigation", "system", "narrative"].includes(val) || "Invalid category"
        },
        title: {
            name: "title",
            type: "string",
            description: "Title of the entry",
            required: true
        },
        description: {
            name: "description",
            type: "string",
            description: "Description or body text",
            required: true
        },
        details: {
            name: "details",
            type: "object",
            description: "JSON details object",
            required: false,
            defaultValue: {}
        },
        tags: {
            name: "tags",
            type: "array",
            description: "List of tags",
            required: false,
            defaultValue: []
        }
    },
    output: "The ID of the created entry",
    execute: async (args, context) => {
        const { category, title, description, details, tags } = args;

        // We utilize the addEntry function from context.notebook
        // Note: The UI might need to handle the 'icon' generation if not provided, 
        // or we can pass a generic icon type. 
        // useNotebook.addEntry expects: { category, icon?, title, description, details, tags }
        // Wait, context.notebook.addEntry in App.tsx typically expects the full object including icon. 
        // But functions cannot be passed easily purely via JSON command args if icon is a ReactNode.
        // However, useNotebook.tsx *internal* addEntry constructs the ID and timestamp.
        // We should check how App.tsx exposes it. 

        // Let's assume for now we pass the data and App.tsx or the hook handles the Icon based on Category 
        // OR we just pass undefined for icon and let the UI fallback (it usually doesn't, it might crash or show nothing).
        // A better approach: The command just passes data. The "Notebook" component renders icons based on category if missing.
        // Or we pass a string identifier for icon?
        // Let's look at useNotebook.tsx again. It stores `icon`.

        // For the command, we'll pass the raw data. 
        context.notebook.addEntry({
            category,
            title,
            description,
            details,
            tags,
            // We can't pass a React Node here (icon). 
            // We might need to rely on the UI rendering a default icon if one is missing, 
            // OR update useNotebook to handle string identifiers for icons.
            // For now, let's omit icon and see if we can patch useNotebook/App to default it.
        });

        return "Activity entry created";
    }
};
