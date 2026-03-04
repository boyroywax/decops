import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    resolveRefs,
    applyInputBindings,
    applyOutputMappings,
    evaluateCondition,
    getStepContext,
    resolveHandlerRefs,
    executeStepHandler,
    type RefContext,
    type HandlerRefContext,
} from '@/utils/jobRuntime';
import type { StepHandler } from '@/types/jobs';
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
        applyOutputMappings(mappings, { text: 'hello' }, storage, vi.fn());
        expect(storage.resultText).toBe('hello');
    });

    it('produces deliverable via addDeliverable', () => {
        const addDeliverable = vi.fn();
        const mappings = [{ outputKey: '*', target: 'deliverable', targetKey: 'report' }];
        applyOutputMappings(mappings, 'markdown content', {}, addDeliverable);
        expect(addDeliverable).toHaveBeenCalledWith(expect.objectContaining({
            key: 'report', name: 'report', type: 'markdown', content: 'markdown content',
        }));
    });

    it('handles wildcard (*) output key', () => {
        const storage: Record<string, any> = {};
        const mappings = [{ outputKey: '*', target: 'storage', targetKey: 'all' }];
        const result = { a: 1, b: 2 };
        applyOutputMappings(mappings, result, storage, vi.fn());
        expect(storage.all).toEqual({ a: 1, b: 2 });
    });

    it('does nothing when mappings are undefined', () => {
        const storage: Record<string, any> = {};
        applyOutputMappings(undefined, 'result', storage, vi.fn());
        expect(Object.keys(storage)).toHaveLength(0);
    });

    it('does nothing when result is null', () => {
        const storage: Record<string, any> = {};
        const mappings = [{ outputKey: 'text', target: 'storage', targetKey: 'out' }];
        applyOutputMappings(mappings, null, storage, vi.fn());
        expect(Object.keys(storage)).toHaveLength(0);
    });
});

/* ─── evaluateCondition ──────────────────────────────────────────── */

describe('evaluateCondition', () => {
    const ctx = {} as CommandContext;

    it('returns true for truthy condition', () => {
        const steps = [{ id: 's1', status: 'completed' }];
        expect(evaluateCondition('steps.s1.status === "completed"', ctx, steps)).toBe(true);
    });

    it('returns false for falsy condition', () => {
        const steps = [{ id: 's1', status: 'failed' }];
        expect(evaluateCondition('steps.s1.status === "completed"', ctx, steps)).toBe(false);
    });

    it('returns false on evaluation error', () => {
        expect(evaluateCondition('invalid.deep.ref', ctx, [])).toBe(false);
    });

    it('resolves by step name', () => {
        const steps = [{ id: 's1', name: 'fetch', status: 'completed' }];
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
        const result = getStepContext({ id: 's1' }, baseContext);
        expect(result).toBe(baseContext);
    });

    it('overrides model resolution when modelId is set', () => {
        const result = getStepContext({ id: 's1', modelId: 'custom-model' }, baseContext);
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
