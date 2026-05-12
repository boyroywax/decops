import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    resolveRefs,
    applyInputBindings,
    applyOutputMappings,
    evaluateCondition,
    getStepContext,
    resolveHandlerRefs,
    executeStepHandler,
    assembleDeliverables,
    DELIVERABLE_STORAGE_PREFIX,
    type RefContext,
    type HandlerRefContext,
} from '@/utils/jobRuntime';
import type { StepHandler, JobStep } from '@/types/jobs';
import type { CommandContext } from '@/services/commands/types';

/* ─── resolveRefs ─────────────────────────────────────────────────── */

describe('resolveRefs', () => {
    const refs: RefContext = {
        storage: { foo: 'bar', obj: { a: 1 } },
        deliverables: { report: 'md-content' },
        inputs: { agent: 'agent-123' },
    };

    it('resolves whole-string $storage ref', () => {
        expect(resolveRefs('$storage.foo', refs)).toBe('bar');
    });

    it('resolves whole-string $storage ref preserving object', () => {
        expect(resolveRefs('$storage.obj', refs)).toEqual({ a: 1 });
    });

    it('resolves whole-string $deliverable ref', () => {
        expect(resolveRefs('$deliverable.report', refs)).toBe('md-content');
    });

    it('resolves whole-string $input ref', () => {
        expect(resolveRefs('$input.agent', refs)).toBe('agent-123');
    });

    it('interpolates inline refs', () => {
        expect(resolveRefs('Result: $storage.foo done', refs)).toBe('Result: bar done');
    });

    it('returns value unchanged for unknown refs', () => {
        expect(resolveRefs('$storage.missing', refs)).toBe('$storage.missing');
    });

    it('resolves refs in nested objects', () => {
        const input = { name: '$storage.foo', nested: { val: '$input.agent' } };
        expect(resolveRefs(input, refs)).toEqual({ name: 'bar', nested: { val: 'agent-123' } });
    });

    it('resolves refs in arrays', () => {
        expect(resolveRefs(['$storage.foo', '$deliverable.report'], refs)).toEqual(['bar', 'md-content']);
    });

    it('passes through non-string primitives', () => {
        expect(resolveRefs(42, refs)).toBe(42);
        expect(resolveRefs(null, refs)).toBeNull();
        expect(resolveRefs(true, refs)).toBe(true);
    });
});

/* ─── applyInputBindings ─────────────────────────────────────────── */

describe('applyInputBindings', () => {
    it('binds storage values to args', () => {
        const args = { prompt: 'original' };
        const bindings = { prompt: { source: 'storage', sourceKey: 'data' } };
        const storage = { data: 'from-storage' };
        const result = applyInputBindings(args, bindings, storage, {});
        expect(result.prompt).toBe('from-storage');
    });

    it('binds deliverable values to args', () => {
        const args = { content: '' };
        const bindings = { content: { source: 'deliverable', sourceKey: 'report' } };
        const deliverables = { report: 'report-content' };
        const result = applyInputBindings(args, bindings, {}, deliverables);
        expect(result.content).toBe('report-content');
    });

    it('returns original args when no bindings', () => {
        const args = { foo: 'bar' };
        const result = applyInputBindings(args, undefined, {}, {});
        expect(result).toEqual({ foo: 'bar' });
    });

    it('does not mutate original args', () => {
        const args = { prompt: 'original' };
        const bindings = { prompt: { source: 'storage', sourceKey: 'data' } };
        applyInputBindings(args, bindings, { data: 'new' }, {});
        expect(args.prompt).toBe('original');
    });
});

/* ─── applyOutputMappings ────────────────────────────────────────── */

describe('applyOutputMappings', () => {
    it('writes to storage', () => {
        const storage: Record<string, any> = {};
        const mappings = [{ outputKey: 'text', target: 'storage', targetKey: 'resultText' }];
        applyOutputMappings(mappings, { text: 'hello' }, storage);
        expect(storage.resultText).toBe('hello');
    });

    it('stages deliverable content into storage with prefix', () => {
        const storage: Record<string, any> = {};
        const mappings = [{ outputKey: '*', target: 'deliverable', targetKey: 'report' }];
        applyOutputMappings(mappings, 'markdown content', storage);
        expect(storage[`${DELIVERABLE_STORAGE_PREFIX}report`]).toBe('markdown content');
    });

    it('stages object deliverable content into storage', () => {
        const storage: Record<string, any> = {};
        const mappings = [{ outputKey: 'data', target: 'deliverable', targetKey: 'analysis' }];
        applyOutputMappings(mappings, { data: { score: 100 } }, storage);
        expect(storage[`${DELIVERABLE_STORAGE_PREFIX}analysis`]).toEqual({ score: 100 });
    });

    it('handles wildcard (*) output key', () => {
        const storage: Record<string, any> = {};
        const mappings = [{ outputKey: '*', target: 'storage', targetKey: 'all' }];
        const result = { a: 1, b: 2 };
        applyOutputMappings(mappings, result, storage);
        expect(storage.all).toEqual({ a: 1, b: 2 });
    });

    it('does nothing when mappings are undefined', () => {
        const storage: Record<string, any> = {};
        applyOutputMappings(undefined, 'result', storage);
        expect(Object.keys(storage)).toHaveLength(0);
    });

    it('does nothing when result is null', () => {
        const storage: Record<string, any> = {};
        const mappings = [{ outputKey: 'text', target: 'storage', targetKey: 'out' }];
        applyOutputMappings(mappings, null, storage);
        expect(Object.keys(storage)).toHaveLength(0);
    });
});

/* ─── evaluateCondition ──────────────────────────────────────────── */

describe('evaluateCondition', () => {
    const ctx = {} as CommandContext;

    it('returns true for truthy condition', () => {
        const steps = [{ id: 's1', status: 'completed' }] as unknown as JobStep[];
        expect(evaluateCondition('steps.s1.status === "completed"', ctx, steps)).toBe(true);
    });

    it('returns false for falsy condition', () => {
        const steps = [{ id: 's1', status: 'failed' }] as unknown as JobStep[];
        expect(evaluateCondition('steps.s1.status === "completed"', ctx, steps)).toBe(false);
    });

    it('returns false on evaluation error', () => {
        expect(evaluateCondition('invalid.deep.ref', ctx, [])).toBe(false);
    });

    it('resolves by step name', () => {
        const steps = [{ id: 's1', name: 'fetch', status: 'completed' }] as unknown as JobStep[];
        expect(evaluateCondition('steps.fetch.status === "completed"', ctx, steps)).toBe(true);
    });
});

/* ─── getStepContext ─────────────────────────────────────────────── */

describe('getStepContext', () => {
    const baseContext = {
        system: {
            getModelForCommand: () => 'global-model',
            getModelForAgent: () => 'global-model',
        },
    } as unknown as CommandContext;

    it('returns base context when no modelId', () => {
        const result = getStepContext({ id: 's1' } as unknown as JobStep, baseContext);
        expect(result).toBe(baseContext);
    });

    it('overrides model resolution when modelId is set', () => {
        const result = getStepContext({ id: 's1', modelId: 'custom-model' } as unknown as JobStep, baseContext);
        expect(result.system.getModelForCommand('any')).toBe('custom-model');
        expect(result.system.getModelForAgent('any')).toBe('custom-model');
    });
});

/* ─── resolveHandlerRefs ─────────────────────────────────────────── */

describe('resolveHandlerRefs', () => {
    const refs: HandlerRefContext = {
        storage: { key1: 'val1' },
        deliverables: {},
        inputs: {},
        result: { summary: 'All good', count: 42 },
        error: 'Something went wrong',
    };

    it('resolves $result to entire result', () => {
        expect(resolveHandlerRefs('$result', refs)).toEqual({ summary: 'All good', count: 42 });
    });

    it('resolves $result.field to nested value', () => {
        expect(resolveHandlerRefs('$result.summary', refs)).toBe('All good');
        expect(resolveHandlerRefs('$result.count', refs)).toBe(42);
    });

    it('resolves $error to error string', () => {
        expect(resolveHandlerRefs('$error', refs)).toBe('Something went wrong');
    });

    it('interpolates $result and $error inline', () => {
        expect(resolveHandlerRefs('Error was: $error', refs)).toBe('Error was: Something went wrong');
    });

    it('interpolates $result.field inline', () => {
        expect(resolveHandlerRefs('Summary: $result.summary', refs)).toBe('Summary: All good');
    });

    it('falls through to standard resolveRefs for $storage', () => {
        expect(resolveHandlerRefs('$storage.key1', refs)).toBe('val1');
    });

    it('resolves refs in nested objects', () => {
        const input = { msg: '$error', data: '$result.summary' };
        expect(resolveHandlerRefs(input, refs)).toEqual({
            msg: 'Something went wrong',
            data: 'All good',
        });
    });

    it('resolves refs in arrays', () => {
        expect(resolveHandlerRefs(['$error', '$result.count'], refs)).toEqual([
            'Something went wrong', 42,
        ]);
    });

    it('passes through non-string primitives', () => {
        expect(resolveHandlerRefs(99, refs)).toBe(99);
        expect(resolveHandlerRefs(null, refs)).toBeNull();
    });

    it('keeps unresolved $result.missing as-is', () => {
        expect(resolveHandlerRefs('$result.missing', refs)).toBe('$result.missing');
    });
});

/* ─── executeStepHandler ─────────────────────────────────────────── */

describe('executeStepHandler', () => {
    let storage: Record<string, any>;
    let execute: ReturnType<typeof vi.fn<(commandId: string, args: Record<string, any>) => Promise<any>>>;
    let addLog: ReturnType<typeof vi.fn<(msg: string) => void>>;
    const baseRefs: HandlerRefContext = {
        storage: {}, deliverables: {}, inputs: {},
        result: 'step-output',
    };

    beforeEach(() => {
        storage = {};
        execute = vi.fn<(commandId: string, args: Record<string, any>) => Promise<any>>().mockResolvedValue('cmd-result');
        addLog = vi.fn<(msg: string) => void>();
    });

    it('returns ok:true and no-op when handler is undefined', async () => {
        const r = await executeStepHandler(undefined, baseRefs, storage, execute, addLog);
        expect(r.ok).toBe(true);
        expect(r.continueOnFailure).toBe(false);
        expect(r.haltAfterSuccess).toBe(false);
    });

    it('writes setStorage values (with ref resolution)', async () => {
        const handler: StepHandler = {
            setStorage: { lastResult: '$result', flag: 'done' },
        };
        await executeStepHandler(handler, baseRefs, storage, execute, addLog);
        expect(storage.lastResult).toBe('step-output');
        expect(storage.flag).toBe('done');
    });

    it('logs resolved message', async () => {
        const handler: StepHandler = { log: 'Step produced: $result' };
        const r = await executeStepHandler(handler, baseRefs, storage, execute, addLog);
        expect(addLog).toHaveBeenCalledWith('Step produced: step-output');
        expect(r.logMessage).toBe('Step produced: step-output');
    });

    it('executes handler command with resolved args', async () => {
        const handler: StepHandler = {
            commandId: 'notify',
            args: { message: 'Done: $result' },
        };
        await executeStepHandler(handler, baseRefs, storage, execute, addLog);
        expect(execute).toHaveBeenCalledWith('notify', { message: 'Done: step-output' });
    });

    it('returns continueOnFailure from handler', async () => {
        const handler: StepHandler = { continueOnFailure: true, log: 'Ignoring failure' };
        const refs: HandlerRefContext = { ...baseRefs, error: 'oops' };
        const r = await executeStepHandler(handler, refs, storage, execute, addLog);
        expect(r.continueOnFailure).toBe(true);
    });

    it('returns haltAfterSuccess from handler', async () => {
        const handler: StepHandler = { haltAfterSuccess: true };
        const r = await executeStepHandler(handler, baseRefs, storage, execute, addLog);
        expect(r.haltAfterSuccess).toBe(true);
    });

    it('handles command execution error gracefully', async () => {
        execute.mockRejectedValue(new Error('cmd failed'));
        const handler: StepHandler = { commandId: 'bad_cmd', args: {} };
        const r = await executeStepHandler(handler, baseRefs, storage, execute, addLog);
        expect(r.ok).toBe(false);
        expect(addLog).toHaveBeenCalledWith('Step handler error: cmd failed');
    });

    it('executes all three phases in order: setStorage → log → command', async () => {
        const handler: StepHandler = {
            setStorage: { x: 1 },
            log: 'logging',
            commandId: 'cmd',
            args: {},
        };

        const trackedExecute = vi.fn<(commandId: string, args: Record<string, any>) => Promise<any>>().mockImplementation(async () => {
            // By this point, storage and log should already be set
            expect(storage.x).toBe(1);
            return 'ok';
        });
        const trackedLog = vi.fn<(msg: string) => void>();

        const r = await executeStepHandler(handler, baseRefs, storage, trackedExecute, trackedLog);
        expect(r.ok).toBe(true);
        expect(storage.x).toBe(1);
        expect(trackedLog).toHaveBeenCalledWith('logging');
        expect(trackedExecute).toHaveBeenCalledWith('cmd', {});
        // Log must be called before execute
        const logOrder = trackedLog.mock.invocationCallOrder[0];
        const execOrder = trackedExecute.mock.invocationCallOrder[0];
        expect(logOrder).toBeLessThan(execOrder);
    });

    it('processes $error ref in onFailure handler args', async () => {
        const handler: StepHandler = {
            commandId: 'log_error',
            args: { error: '$error', context: 'step-3' },
        };
        const refs: HandlerRefContext = { ...baseRefs, error: 'timeout' };
        await executeStepHandler(handler, refs, storage, execute, addLog);
        expect(execute).toHaveBeenCalledWith('log_error', { error: 'timeout', context: 'step-3' });
    });
});

/* ─── assembleDeliverables ───────────────────────────────────────── */

describe('assembleDeliverables', () => {
    let storage: Record<string, any>;
    let executeCommand: ReturnType<typeof vi.fn<(commandId: string, args: Record<string, any>) => Promise<any>>>;
    let addLog: ReturnType<typeof vi.fn<(msg: string) => void>>;

    beforeEach(() => {
        storage = {};
        executeCommand = vi.fn<(commandId: string, args: Record<string, any>) => Promise<any>>()
            .mockResolvedValue({ artifact: { id: 'art-123' } });
        addLog = vi.fn<(msg: string) => void>();
    });

    it('assembles deliverables from staged storage content', async () => {
        storage[`${DELIVERABLE_STORAGE_PREFIX}report`] = '# Report\nAll good';
        const deliverables = [{ key: 'report', label: 'Final Report', type: 'markdown' }];

        const result = await assembleDeliverables(deliverables, storage, executeCommand, addLog);

        expect(result).toHaveLength(1);
        expect(result[0].key).toBe('report');
        expect(result[0].artifactId).toBe('art-123');
        expect(executeCommand).toHaveBeenCalledWith('create_artifact', expect.objectContaining({
            name: 'Final Report',
            type: 'markdown',
            content: '# Report\nAll good',
            deliverableKey: 'report',
        }));
    });

    it('skips deliverables with no content in storage', async () => {
        const deliverables = [{ key: 'missing', label: 'Missing', type: 'json' }];
        const result = await assembleDeliverables(deliverables, storage, executeCommand, addLog);

        expect(result).toHaveLength(0);
        expect(executeCommand).not.toHaveBeenCalled();
        expect(addLog).toHaveBeenCalledWith(expect.stringContaining('skipped'));
    });

    it('uses sourceStorageKey when specified', async () => {
        storage['custom_key'] = { data: 'value' };
        const deliverables = [{
            key: 'analysis',
            label: 'Analysis',
            type: 'json',
            sourceStorageKey: 'custom_key',
        }];

        const result = await assembleDeliverables(deliverables, storage, executeCommand, addLog);

        expect(result).toHaveLength(1);
        expect(executeCommand).toHaveBeenCalledWith('create_artifact', expect.objectContaining({
            content: JSON.stringify({ data: 'value' }, null, 2),
        }));
    });

    it('stringifies object content as JSON', async () => {
        storage[`${DELIVERABLE_STORAGE_PREFIX}data`] = { x: 1, y: 2 };
        const deliverables = [{ key: 'data', label: 'Data', type: 'json' }];

        await assembleDeliverables(deliverables, storage, executeCommand, addLog);

        expect(executeCommand).toHaveBeenCalledWith('create_artifact', expect.objectContaining({
            content: JSON.stringify({ x: 1, y: 2 }, null, 2),
        }));
    });

    it('handles create_artifact failure gracefully', async () => {
        storage[`${DELIVERABLE_STORAGE_PREFIX}broken`] = 'content';
        executeCommand.mockRejectedValue(new Error('create failed'));
        const deliverables = [{ key: 'broken', label: 'Broken', type: 'txt' }];

        const result = await assembleDeliverables(deliverables, storage, executeCommand, addLog);

        expect(result).toHaveLength(0);
        expect(addLog).toHaveBeenCalledWith(expect.stringContaining('assembly failed'));
    });

    it('assembles multiple deliverables in order', async () => {
        storage[`${DELIVERABLE_STORAGE_PREFIX}a`] = 'content-a';
        storage[`${DELIVERABLE_STORAGE_PREFIX}b`] = 'content-b';
        let callCount = 0;
        executeCommand.mockImplementation(async () => {
            callCount++;
            return { artifact: { id: `art-${callCount}` } };
        });
        const deliverables = [
            { key: 'a', label: 'A', type: 'markdown' },
            { key: 'b', label: 'B', type: 'markdown' },
        ];

        const result = await assembleDeliverables(deliverables, storage, executeCommand, addLog);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ key: 'a', artifactId: 'art-1' });
        expect(result[1]).toEqual({ key: 'b', artifactId: 'art-2' });
    });

    it('falls back to lastArtifactId from storage when artifact.id not in result', async () => {
        storage[`${DELIVERABLE_STORAGE_PREFIX}x`] = 'hello';
        executeCommand.mockResolvedValue({ success: true }); // no artifact.id
        storage.lastArtifactId = 'fallback-id';
        const deliverables = [{ key: 'x', label: 'X', type: 'txt' }];

        const result = await assembleDeliverables(deliverables, storage, executeCommand, addLog);

        expect(result).toHaveLength(1);
        expect(result[0].artifactId).toBe('fallback-id');
    });

    it('includes tags with deliverable key and source:job', async () => {
        storage[`${DELIVERABLE_STORAGE_PREFIX}report`] = 'content';
        const deliverables = [{ key: 'report', label: 'Report', type: 'markdown', description: 'Final' }];

        await assembleDeliverables(deliverables, storage, executeCommand, addLog);

        expect(executeCommand).toHaveBeenCalledWith('create_artifact', expect.objectContaining({
            tags: 'deliverable:report,source:job',
            description: 'Final',
        }));
    });
});
