
import { CommandDefinition, CommandArgType } from "./types";
import { dryRunCommand, dryRunJob, type DryRunResult, type DryRunJobResult } from "./dryRun";
import { assertRBAC } from "./rbac";
import type { JobStep } from "@/types";

/** Shape of an entity that resolveEntityName looks up — needs id and (optionally) name. */
interface NamedEntity {
    id: string;
    name?: string;
}

/**
 * Resolve entity name → ID for semantic arg types ("agent", "group", "channel", "network").
 * If the provided value is already a valid entity ID, it passes through unchanged.
 * If not, we attempt a case-insensitive name lookup and swap the value for the real ID.
 */
function resolveEntityName(
    value: string,
    argType: CommandArgType,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: any,
): string {
    if (!value || typeof value !== "string") return value;

    // Determine which collection to search and key for name
    let entities: NamedEntity[] | undefined;
    switch (argType) {
        case "agent":
            entities = context?.workspace?.agents as NamedEntity[] | undefined;
            // Also check agents nested inside networks (ecosystem)
            if (entities && !entities.find((e) => e.id === value)) {
                const match = entities.find(
                    (e) => e.name?.toLowerCase() === value.toLowerCase(),
                );
                if (match) return match.id;
                // Fall through to check ecosystem network agents
                const nets = (context?.ecosystem?.networks ?? []) as Array<{ agents?: NamedEntity[] }>;
                for (const net of nets) {
                    const netAgents: NamedEntity[] = net.agents ?? [];
                    const netMatch = netAgents.find(
                        (a) => a.id === value || a.name?.toLowerCase() === value.toLowerCase(),
                    );
                    if (netMatch) return netMatch.id;
                }
                // Also search mutable storage._agents (populated during deploy_network)
                const storageAgents = (context?.storage?._agents ?? []) as NamedEntity[];
                const storageMatch = storageAgents.find(
                    (a) => a.id === value || a.name?.toLowerCase() === value.toLowerCase(),
                );
                if (storageMatch) return storageMatch.id;
            }
            break;
        case "group":
            entities = context?.workspace?.groups as NamedEntity[] | undefined;
            break;
        case "channel":
            entities = context?.workspace?.channels as NamedEntity[] | undefined;
            break;
        case "network":
            entities = context?.ecosystem?.networks as NamedEntity[] | undefined;
            break;
        default:
            return value;
    }

    if (!entities) return value;

    // Already a valid ID — pass through
    if (entities.find((e) => e.id === value)) return value;

    // Try case-insensitive name match
    const match = entities.find(
        (e) => e.name?.toLowerCase() === value.toLowerCase(),
    );
    return match ? match.id : value;
}

export class CommandRegistry {
    private commands: Map<string, CommandDefinition> = new Map();

    register(command: CommandDefinition) {
        if (this.commands.has(command.id)) {
            console.warn(`Command ${command.id} is already registered. Overwriting.`);
        }
        this.commands.set(command.id, command);
    }

    /** Remove a command from the registry (used by toolkit hot-unload). */
    unregister(id: string): boolean {
        return this.commands.delete(id);
    }

    get(id: string): CommandDefinition | undefined {
        return this.commands.get(id);
    }

    getAll(): CommandDefinition[] {
        return Array.from(this.commands.values());
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async execute<T extends Record<string, any> = any>(id: string, args: T, context: any): Promise<any> {
        const command = this.get(id);
        if (!command) {
            throw new Error(`Command ${id} not found`);
        }

        // ── RBAC enforcement ──
        // Verify the current actor's role is permitted to invoke this command.
        // Throws RBACDenied (typed) so UI surfaces can detect and display
        // a permission-denied message rather than a generic failure.
        assertRBAC(command, context);

        // Validate Arguments
        // When batch mode (items arg) is provided, skip required checks for
        // individual args — the command's execute body validates each item.
        const isBatch = 'items' in command.args && args.items != null;

        // ── Resolve entity names → IDs ──
        // For args with semantic types (agent, group, channel, network),
        // allow callers to pass entity names and auto-resolve to real IDs.
        const entityTypes: Set<string> = new Set(["agent", "group", "channel", "network"]);
        for (const [argName, argDef] of Object.entries(command.args)) {
            const value = args[argName];
            if (typeof value === "string" && entityTypes.has(argDef.type)) {
                (args as any)[argName] = resolveEntityName(value, argDef.type, context);
            }
        }
        // Also resolve entity names inside batch items arrays
        if (isBatch && Array.isArray(args.items)) {
            for (const item of args.items) {
                if (item && typeof item === "object") {
                    for (const [argName, argDef] of Object.entries(command.args)) {
                        const value = item[argName];
                        if (typeof value === "string" && entityTypes.has(argDef.type)) {
                            item[argName] = resolveEntityName(value, argDef.type, context);
                        }
                    }
                }
            }
        }

        for (const [argName, argDef] of Object.entries(command.args)) {
            const value = args[argName];

            // Check required
            // Handle missing values
            if (value === undefined || value === null) {
                if (argDef.defaultValue !== undefined) {
                    (args as any)[argName] = argDef.defaultValue;
                } else if (argDef.required !== false && !(isBatch && argName !== 'items')) {
                    throw new Error(`Missing required argument: ${argName}`);
                }
            }

            // Type coercion & check (basic)
            // Storage/deliverable refs may resolve to objects — coerce to string when arg expects string
            if (value !== undefined && value !== null) {
                if (argDef.type === 'string' && typeof value !== 'string') {
                    (args as any)[argName] = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
                }
                if (argDef.type === 'number' && typeof value !== 'number') throw new Error(`Argument ${argName} must be a number`);
                if (argDef.type === 'boolean' && typeof value !== 'boolean') throw new Error(`Argument ${argName} must be a boolean`);
                if (argDef.type === 'array' && !Array.isArray(value)) throw new Error(`Argument ${argName} must be an array`);
            }

            // Custom Validation
            if (argDef.validation && value !== undefined) {
                const result = argDef.validation(value);
                if (result !== true) {
                    throw new Error(`Argument ${argName} invalid: ${typeof result === 'string' ? result : 'Validation failed'}`);
                }
            }
        }

        // Execute
        return await command.execute(args, context);
    }

    /** Dry-run a single command: validate everything without executing */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dryRun(id: string, args: Record<string, any>, context: any): DryRunResult {
        return dryRunCommand(this.get(id), id, args, context);
    }

    /** Dry-run an entire multi-step job */
    dryRunJob(
        steps: JobStep[],
        mode: "serial" | "parallel",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        context: any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        storage: Record<string, any> = {},
        deliverableKeys: string[] = [],
        inputMap: Record<string, string> = {},
    ): DryRunJobResult {
        return dryRunJob(steps, mode, (cid) => this.get(cid), context, storage, deliverableKeys, inputMap);
    }
}

export const registry = new CommandRegistry();
