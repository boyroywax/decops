import { describe, it, expect, vi } from 'vitest';
import { dryRunCommand, dryRunJob } from '../../../services/commands/dryRun';
import type { CommandDefinition } from '../../../services/commands/types';
import { CommandRegistry } from '../../../services/commands/registry';

/* ─── Fixtures ───────────────────────────────────────────────────────── */

const simpleCommand: CommandDefinition = {
    id: 'test_cmd',
    description: 'A test command',
    args: {
        name: { name: 'name', type: 'string', required: true, description: 'Name' },
        count: { name: 'count', type: 'number', required: false, defaultValue: 5, description: 'Count' },
        verbose: { name: 'verbose', type: 'boolean', required: false, description: 'Verbose' },
    },
    execute: vi.fn(async () => ({ ok: true })),
    rbac: ['builder'],
    tags: ['test'],
    output: 'result',
};

const agentCommand: CommandDefinition = {
    id: 'send_msg',
    description: 'Send a message',
    args: {
        from: { name: 'from', type: 'agent', required: true, description: 'Sender' },
        to: { name: 'to', type: 'agent', required: true, description: 'Receiver' },
        message: { name: 'message', type: 'string', required: true, description: 'Message' },
    },
    execute: vi.fn(async () => 'sent'),
    rbac: ['builder'],
    tags: ['messaging'],
    output: 'result',
    usesAI: true,
};

const enumCommand: CommandDefinition = {
    id: 'set_mode',
    description: 'Set mode',
    args: {
        mode: { name: 'mode', type: 'string', required: true, description: 'Mode', enum: ['fast', 'slow', 'balanced'] },
    },
    execute: vi.fn(async () => 'done'),
    rbac: ['builder'],
    tags: ['config'],
    output: 'result',
};

const validatedCommand: CommandDefinition = {
    id: 'validated_cmd',
    description: 'Command with custom validation',
    args: {
        port: {
            name: 'port',
            type: 'number',
            required: true,
            description: 'Port number',
            validation: (v: number) => (v >= 1 && v <= 65535) ? true : 'Port must be between 1 and 65535',
        },
    },
    execute: vi.fn(async () => 'ok'),
    rbac: ['builder'],
    tags: ['system'],
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
        ecosystems: [],
    },
    storage: {},
};

/* ─── dryRunCommand ──────────────────────────────────────────────────── */

describe('dryRunCommand', () => {
    it('returns valid result when all checks pass', () => {
        const result = dryRunCommand(simpleCommand, 'test_cmd', { name: 'hello' }, ctx);
        expect(result.valid).toBe(true);
        expect(result.commandFound).toBe(true);
        expect(result.checks.some(c => c.status === 'fail')).toBe(false);
        expect(result.resolvedArgs.count).toBe(5); // Default applied
    });

    it('fails when command not found', () => {
        const result = dryRunCommand(undefined, 'nonexistent', {}, ctx);
        expect(result.valid).toBe(false);
        expect(result.commandFound).toBe(false);
        expect(result.checks[0].status).toBe('fail');
        expect(result.checks[0].message).toContain('nonexistent');
    });

    it('fails when required argument is missing', () => {
        const result = dryRunCommand(simpleCommand, 'test_cmd', {}, ctx);
        expect(result.valid).toBe(false);
        const failCheck = result.checks.find(c => c.label === 'Arg: name' && c.status === 'fail');
        expect(failCheck).toBeDefined();
        expect(failCheck!.message).toBe('Missing required argument');
    });

    it('applies default values for optional args', () => {
        const result = dryRunCommand(simpleCommand, 'test_cmd', { name: 'test' }, ctx);
        expect(result.resolvedArgs.count).toBe(5);
        const defaultCheck = result.checks.find(c => c.label === 'Arg: count');
        expect(defaultCheck?.status).toBe('pass');
        expect(defaultCheck?.message).toContain('Default applied');
    });

    it('skips optional args that are not provided', () => {
        const result = dryRunCommand(simpleCommand, 'test_cmd', { name: 'test' }, ctx);
        const skipCheck = result.checks.find(c => c.label === 'Arg: verbose');
        expect(skipCheck?.status).toBe('skip');
    });

    it('validates types correctly', () => {
        const result = dryRunCommand(simpleCommand, 'test_cmd', { name: 123 }, ctx);
        expect(result.valid).toBe(false);
        const typeCheck = result.checks.find(c => c.label === 'Type: name');
        expect(typeCheck?.status).toBe('fail');
        expect(typeCheck?.message).toContain('Expected string');
    });

    it('resolves entity names to IDs', () => {
        const result = dryRunCommand(agentCommand, 'send_msg', {
            from: 'Lead', to: 'Ideator', message: 'hello',
        }, ctx);
        expect(result.valid).toBe(true);
        expect(result.resolvedArgs.from).toBe('a-001');
        expect(result.resolvedArgs.to).toBe('a-002');
        const resolveCheck = result.checks.find(c => c.label === 'Resolve from');
        expect(resolveCheck?.status).toBe('pass');
    });

    it('warns when entity cannot be resolved', () => {
        const result = dryRunCommand(agentCommand, 'send_msg', {
            from: 'Ghost', to: 'Ideator', message: 'hello',
        }, ctx);
        // Still "valid" because entity resolution is a warning, not a hard fail
        const resolveCheck = result.checks.find(c => c.label === 'Resolve from');
        expect(resolveCheck?.status).toBe('warn');
        expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('validates enum values', () => {
        const valid = dryRunCommand(enumCommand, 'set_mode', { mode: 'fast' }, {});
        expect(valid.valid).toBe(true);
        const enumCheck = valid.checks.find(c => c.label === 'Enum: mode');
        expect(enumCheck?.status).toBe('pass');

        const invalid = dryRunCommand(enumCommand, 'set_mode', { mode: 'turbo' }, {});
        expect(invalid.valid).toBe(false);
        const failCheck = invalid.checks.find(c => c.label === 'Enum: mode');
        expect(failCheck?.status).toBe('fail');
    });

    it('runs custom validation', () => {
        const valid = dryRunCommand(validatedCommand, 'validated_cmd', { port: 8080 }, {});
        expect(valid.valid).toBe(true);

        const invalid = dryRunCommand(validatedCommand, 'validated_cmd', { port: 99999 }, {});
        expect(invalid.valid).toBe(false);
        const valCheck = invalid.checks.find(c => c.label === 'Validate: port');
        expect(valCheck?.status).toBe('fail');
        expect(valCheck?.message).toContain('Port must be between');
    });

    it('warns about unknown arguments', () => {
        const result = dryRunCommand(simpleCommand, 'test_cmd', { name: 'test', foobar: true }, ctx);
        const unknownCheck = result.checks.find(c => c.label === 'Unknown arg: foobar');
        expect(unknownCheck?.status).toBe('warn');
    });

    it('does not call execute()', () => {
        dryRunCommand(simpleCommand, 'test_cmd', { name: 'test' }, ctx);
        expect(simpleCommand.execute).not.toHaveBeenCalled();
    });

    it('produces a summary string', () => {
        const valid = dryRunCommand(simpleCommand, 'test_cmd', { name: 'test' }, ctx);
        expect(valid.summary).toContain('✓');

        const invalid = dryRunCommand(simpleCommand, 'test_cmd', {}, ctx);
        expect(invalid.summary).toContain('✗');
    });
});

/* ─── dryRunJob ──────────────────────────────────────────────────────── */

describe('dryRunJob', () => {
    const commands: Record<string, CommandDefinition> = {
        test_cmd: simpleCommand,
        send_msg: agentCommand,
    };
    const getCmd = (id: string) => commands[id];

    it('validates all steps in a serial job', () => {
        const steps = [
            { id: 's1', commandId: 'test_cmd', args: { name: 'step1' } },
            { id: 's2', commandId: 'send_msg', args: { from: 'Lead', to: 'Ideator', message: 'hi' } },
        ];
        const result = dryRunJob(steps, 'serial', getCmd, ctx);
        expect(result.valid).toBe(true);
        expect(result.steps).toHaveLength(2);
        expect(result.steps[0].result.valid).toBe(true);
        expect(result.steps[1].result.valid).toBe(true);
    });

    it('reports failures in individual steps', () => {
        const steps = [
            { id: 's1', commandId: 'test_cmd', args: {} }, // Missing required 'name'
            { id: 's2', commandId: 'send_msg', args: { from: 'Lead', to: 'Ideator', message: 'hi' } },
        ];
        const result = dryRunJob(steps, 'serial', getCmd, ctx);
        expect(result.valid).toBe(false);
        expect(result.steps[0].result.valid).toBe(false);
        expect(result.steps[1].result.valid).toBe(true);
        expect(result.failedChecks).toBeGreaterThan(0);
    });

    it('detects unknown commands in steps', () => {
        const steps = [
            { id: 's1', commandId: 'nonexistent_cmd', args: {} },
        ];
        const result = dryRunJob(steps, 'serial', getCmd, ctx);
        expect(result.valid).toBe(false);
        expect(result.steps[0].result.commandFound).toBe(false);
    });

    it('simulates storage output mappings in serial mode', () => {
        const steps = [
            {
                id: 's1',
                commandId: 'test_cmd',
                args: { name: 'step1' },
                outputMappings: [{ outputKey: '*', target: 'storage' as const, targetKey: 'step1_result' }],
            },
            {
                id: 's2',
                commandId: 'test_cmd',
                args: { name: '$storage.step1_result' },
            },
        ];
        const result = dryRunJob(steps, 'serial', getCmd, ctx);
        // Step 2 should not have unresolved refs for $storage.step1_result
        // because step 1 simulated writing to storage
        expect(result.unresolvedRefs).not.toContain('$storage.step1_result');
    });

    it('detects unresolved $storage refs', () => {
        const steps = [
            {
                id: 's1',
                commandId: 'test_cmd',
                args: { name: '$storage.missing_key' },
            },
        ];
        const result = dryRunJob(steps, 'serial', getCmd, ctx);
        expect(result.unresolvedRefs).toContain('$storage.missing_key');
    });

    it('detects embedded $storage refs in larger strings', () => {
        const steps = [
            {
                id: 's1',
                commandId: 'test_cmd',
                args: { name: '# Report\n$storage.section_a\n$storage.section_b' },
            },
        ];
        const result = dryRunJob(steps, 'serial', getCmd, ctx);
        expect(result.unresolvedRefs).toContain('$storage.section_a');
        expect(result.unresolvedRefs).toContain('$storage.section_b');
    });

    it('does not flag embedded refs when storage key exists via output mappings', () => {
        const steps = [
            {
                id: 's1',
                commandId: 'test_cmd',
                args: { name: 'step1' },
                outputMappings: [
                    { outputKey: '*', target: 'storage' as const, targetKey: 'data_a' },
                ],
            },
            {
                id: 's2',
                commandId: 'test_cmd',
                args: { name: 'Combined: $storage.data_a and more text' },
            },
        ];
        const result = dryRunJob(steps, 'serial', getCmd, ctx);
        expect(result.unresolvedRefs).not.toContain('$storage.data_a');
    });

    it('provides aggregate check counts', () => {
        const steps = [
            { id: 's1', commandId: 'test_cmd', args: { name: 'ok' } },
            { id: 's2', commandId: 'test_cmd', args: {} }, // Missing required
        ];
        const result = dryRunJob(steps, 'serial', getCmd, ctx);
        expect(result.totalChecks).toBeGreaterThan(0);
        expect(result.passedChecks).toBeGreaterThan(0);
        expect(result.failedChecks).toBeGreaterThan(0);
    });

    it('works with registry.dryRun method', () => {
        const registry = new CommandRegistry();
        registry.register(simpleCommand);

        const result = registry.dryRun('test_cmd', { name: 'hi' }, ctx);
        expect(result.valid).toBe(true);
        expect(result.commandFound).toBe(true);
    });

    it('works with registry.dryRunJob method', () => {
        const registry = new CommandRegistry();
        registry.register(simpleCommand);
        registry.register(agentCommand);

        const steps = [
            { id: 's1', commandId: 'test_cmd', args: { name: 'step1' } },
            { id: 's2', commandId: 'send_msg', args: { from: 'Lead', to: 'Ideator', message: 'hi' } },
        ];
        const result = registry.dryRunJob(steps, 'serial', ctx);
        expect(result.valid).toBe(true);
        expect(result.steps).toHaveLength(2);
    });
});
