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
            requiredArg: { name: 'requiredArg', type: 'string', required: true, description: 'Required arg' },
            optionalArg: { name: 'optionalArg', type: 'string', required: false, defaultValue: 'default', description: 'Optional arg' },
            numberArg: { name: 'numberArg', type: 'number', required: false, description: 'Number arg' }
        },
        execute: vi.fn(async (args, context) => {
            return { success: true, args };
        }),
        rbac: ['builder'],
        tags: ['test'],
        output: 'Test Output'
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

    describe('entity name → ID resolution', () => {
        const agentCommand: CommandDefinition = {
            id: 'msg_test',
            description: 'Test agent resolution',
            args: {
                from: { name: 'from', type: 'agent', required: true, description: 'Sender' },
                to: { name: 'to', type: 'agent', required: true, description: 'Receiver' },
                networkId: { name: 'networkId', type: 'network', required: false, description: 'Network' },
            },
            execute: vi.fn(async (args) => ({ resolved: args })),
            rbac: ['builder'],
            tags: ['test'],
            output: 'result',
        };

        const ctx = {
            workspace: {
                agents: [
                    { id: 'a-001', name: 'Lead' },
                    { id: 'a-002', name: 'Ideator' },
                ],
                groups: [],
                channels: [],
            },
            ecosystem: {
                ecosystems: [
                    { id: 'n-001', name: 'Marketing Net', agents: [] },
                ],
            },
            storage: {},
        };

        it('resolves agent names to IDs', async () => {
            registry.register(agentCommand);
            const result = await registry.execute('msg_test', { from: 'Lead', to: 'Ideator' }, ctx);
            expect(result.resolved.from).toBe('a-001');
            expect(result.resolved.to).toBe('a-002');
        });

        it('passes through valid IDs unchanged', async () => {
            registry.register(agentCommand);
            const result = await registry.execute('msg_test', { from: 'a-001', to: 'a-002' }, ctx);
            expect(result.resolved.from).toBe('a-001');
            expect(result.resolved.to).toBe('a-002');
        });

        it('resolves network names to IDs', async () => {
            registry.register(agentCommand);
            const result = await registry.execute('msg_test', {
                from: 'a-001', to: 'a-002', networkId: 'Marketing Net',
            }, ctx);
            expect(result.resolved.networkId).toBe('n-001');
        });

        it('is case-insensitive for name lookup', async () => {
            registry.register(agentCommand);
            const result = await registry.execute('msg_test', { from: 'lead', to: 'IDEATOR' }, ctx);
            expect(result.resolved.from).toBe('a-001');
            expect(result.resolved.to).toBe('a-002');
        });

        it('leaves unresolvable values unchanged', async () => {
            registry.register(agentCommand);
            const result = await registry.execute('msg_test', { from: 'Ghost', to: 'a-002' }, ctx);
            // 'Ghost' doesn't match any agent — passes through as-is
            expect(result.resolved.from).toBe('Ghost');
        });

        it('resolves names inside batch items', async () => {
            const batchCmd: CommandDefinition = {
                id: 'batch_test',
                description: 'Batch test',
                args: {
                    agent_id: { name: 'agent_id', type: 'agent', required: false, description: 'Agent' },
                    items: { name: 'items', type: 'array', required: true, description: 'Batch items' },
                },
                execute: vi.fn(async (args) => ({ items: args.items })),
                rbac: ['builder'],
                tags: ['test'],
                output: 'result',
            };
            registry.register(batchCmd);
            const result = await registry.execute('batch_test', {
                items: [
                    { agent_id: 'Lead' },
                    { agent_id: 'a-002' },
                ],
            }, ctx);
            expect(result.items[0].agent_id).toBe('a-001');
            expect(result.items[1].agent_id).toBe('a-002');
        });
    });
});
