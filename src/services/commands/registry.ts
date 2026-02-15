
import { CommandDefinition } from "./types";

export class CommandRegistry {
    private commands: Map<string, CommandDefinition> = new Map();

    register(command: CommandDefinition) {
        if (this.commands.has(command.id)) {
            console.warn(`Command ${command.id} is already registered. Overwriting.`);
        }
        this.commands.set(command.id, command);
    }

    get(id: string): CommandDefinition | undefined {
        return this.commands.get(id);
    }

    getAll(): CommandDefinition[] {
        return Array.from(this.commands.values());
    }

    async execute<T extends Record<string, any> = any>(id: string, args: T, context: any): Promise<any> {
        const command = this.get(id);
        if (!command) {
            throw new Error(`Command ${id} not found`);
        }

        // Validate Arguments
        for (const [argName, argDef] of Object.entries(command.args)) {
            const value = args[argName];

            // Check required
            // Handle missing values
            if (value === undefined || value === null) {
                if (argDef.defaultValue !== undefined) {
                    (args as any)[argName] = argDef.defaultValue;
                } else if (argDef.required !== false) {
                    throw new Error(`Missing required argument: ${argName}`);
                }
            }

            // Type check (basic)
            if (value !== undefined && value !== null) {
                if (argDef.type === 'string' && typeof value !== 'string') throw new Error(`Argument ${argName} must be a string`);
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
}

export const registry = new CommandRegistry();
