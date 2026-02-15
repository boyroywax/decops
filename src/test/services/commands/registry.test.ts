import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommandRegistry } from '../../../services/commands/registry';
import { CommandDefinition } from '../../../services/commands/types';

describe('CommandRegistry', () => {
    let registry: CommandRegistry;

    beforeEach(() => {
        registry = new CommandRegistry();
    });

    const mockCommand: CommandDefinition = {
        id: 'test_command',
        description: 'Test Command',
        args: {
            requiredArg: { name: 'requiredArg', type: 'string', required: true },
            optionalArg: { name: 'optionalArg', type: 'string', required: false, defaultValue: 'default' },
            numberArg: { name: 'numberArg', type: 'number', required: false }
        },
        execute: vi.fn(async (args, context) => {
            return { success: true, args };
        })
    };

    it('registers and retrieves commands', () => {
        registry.register(mockCommand);
        expect(registry.get('test_command')).toBe(mockCommand);
        expect(registry.getAll()).toContain(mockCommand);
    });

    it('executes valid commands', async () => {
        registry.register(mockCommand);
        const result = await registry.execute('test_command', { requiredArg: 'foo' }, {});
        expect(result.success).toBe(true);
        expect(result.args.requiredArg).toBe('foo');
        expect(mockCommand.execute).toHaveBeenCalled();
    });

    it('applies default values', async () => {
        registry.register(mockCommand);
        const result = await registry.execute('test_command', { requiredArg: 'foo' }, {});
        expect(result.args.optionalArg).toBe('default');
    });

    it('throws on missing required argument', async () => {
        registry.register(mockCommand);
        await expect(registry.execute('test_command', {}, {}))
            .rejects.toThrow('Missing required argument: requiredArg');
    });

    it('throws on invalid type', async () => {
        registry.register(mockCommand);
        await expect(registry.execute('test_command', { requiredArg: 'foo', numberArg: "not a number" }, {}))
            .rejects.toThrow('Argument numberArg must be a number');
    });

    it('throws on unknown command', async () => {
        await expect(registry.execute('unknown_command', {}, {}))
            .rejects.toThrow('Command unknown_command not found');
    });
});
