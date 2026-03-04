/**
 * Tests for the newly-added Studio-related types:
 * - InputSourceKind / InputSource discriminated union
 * - TriggerEvent
 * - JobTrigger
 * - Updated EntityInput (with source?)
 * - Updated JobDefinition (with triggers?, parallelGroups?, mixed mode)
 * - isParallelGroup + PARALLEL_GROUP_CMD helpers
 */
import { describe, it, expect } from 'vitest';
import type {
    InputSource,
    InputSourceKind,
    TriggerEvent,
    JobTrigger,
    EntityInput,
    JobDefinition,
} from '@/types';
import {
    PARALLEL_GROUP_CMD,
    isParallelGroup,
} from '@/components/views/StudioView';
import type { StudioStep } from '@/components/views/StudioView';

// ────────────────────────────────────────────────────
// InputSourceKind
// ────────────────────────────────────────────────────

describe('InputSourceKind', () => {
    it('accepts all four kinds', () => {
        const kinds: InputSourceKind[] = ['prompt', 'storage', 'hardcoded', 'artifact'];
        expect(kinds).toHaveLength(4);
        kinds.forEach(k => expect(typeof k).toBe('string'));
    });
});

// ────────────────────────────────────────────────────
// InputSource discriminated union
// ────────────────────────────────────────────────────

describe('InputSource', () => {
    it('supports prompt variant', () => {
        const src: InputSource = { kind: 'prompt', promptText: 'Enter agent name' };
        expect(src.kind).toBe('prompt');
        if (src.kind === 'prompt') {
            expect(src.promptText).toBe('Enter agent name');
        }
    });

    it('supports prompt variant without promptText', () => {
        const src: InputSource = { kind: 'prompt' };
        expect(src.kind).toBe('prompt');
    });

    it('supports storage variant', () => {
        const src: InputSource = { kind: 'storage', storageKey: 'results', path: 'data.items' };
        expect(src.kind).toBe('storage');
        if (src.kind === 'storage') {
            expect(src.storageKey).toBe('results');
            expect(src.path).toBe('data.items');
        }
    });

    it('supports hardcoded variant', () => {
        const src: InputSource = { kind: 'hardcoded', value: 'literal-value-42' };
        expect(src.kind).toBe('hardcoded');
        if (src.kind === 'hardcoded') {
            expect(src.value).toBe('literal-value-42');
        }
    });

    it('supports artifact variant', () => {
        const src: InputSource = { kind: 'artifact', artifactId: 'art-123', tag: 'latest' };
        expect(src.kind).toBe('artifact');
        if (src.kind === 'artifact') {
            expect(src.artifactId).toBe('art-123');
            expect(src.tag).toBe('latest');
        }
    });

    it('supports artifact variant with no fields', () => {
        const src: InputSource = { kind: 'artifact' };
        expect(src.kind).toBe('artifact');
    });
});

// ────────────────────────────────────────────────────
// EntityInput with optional source
// ────────────────────────────────────────────────────

describe('EntityInput with source', () => {
    it('works without source (backward-compatible)', () => {
        const input: EntityInput = {
            name: 'Scout',
            type: 'agent',
            entityId: 'agent-abc',
        };
        expect(input.source).toBeUndefined();
    });

    it('accepts a source of kind storage', () => {
        const input: EntityInput = {
            name: 'DataCh',
            type: 'channel',
            entityId: 'ch-1',
            source: { kind: 'storage', storageKey: 'channels.default' },
        };
        expect(input.source?.kind).toBe('storage');
    });
});

// ────────────────────────────────────────────────────
// TriggerEvent
// ────────────────────────────────────────────────────

describe('TriggerEvent', () => {
    const allEvents: TriggerEvent[] = [
        'artifact:created', 'artifact:updated', 'artifact:deleted',
        'agent:created', 'agent:updated',
        'group:created', 'group:updated',
        'channel:created', 'channel:updated',
        'network:created', 'network:updated',
        'job:completed', 'job:failed',
        'schedule:cron',
    ];

    it('enumerates 14 event strings', () => {
        expect(allEvents).toHaveLength(14);
    });

    it('every event follows entity:action pattern', () => {
        allEvents.forEach(evt => {
            expect(evt).toMatch(/^[a-z]+:[a-z]+$/);
        });
    });
});

// ────────────────────────────────────────────────────
// JobTrigger
// ────────────────────────────────────────────────────

describe('JobTrigger', () => {
    it('requires id, event, and enabled', () => {
        const trigger: JobTrigger = {
            id: 'trig-1',
            event: 'artifact:created',
            enabled: true,
        };
        expect(trigger.id).toBe('trig-1');
        expect(trigger.event).toBe('artifact:created');
        expect(trigger.enabled).toBe(true);
        expect(trigger.filter).toBeUndefined();
        expect(trigger.cron).toBeUndefined();
        expect(trigger.label).toBeUndefined();
    });

    it('supports filter with all fields', () => {
        const trigger: JobTrigger = {
            id: 'trig-2',
            event: 'agent:updated',
            enabled: false,
            filter: { entityId: 'agt-1', tag: 'v2', name: 'Scout' },
            label: 'When scout updates',
        };
        expect(trigger.filter?.entityId).toBe('agt-1');
        expect(trigger.filter?.tag).toBe('v2');
        expect(trigger.filter?.name).toBe('Scout');
    });

    it('supports cron for schedule:cron events', () => {
        const trigger: JobTrigger = {
            id: 'trig-3',
            event: 'schedule:cron',
            enabled: true,
            cron: '*/5 * * * *',
            label: 'Every 5 minutes',
        };
        expect(trigger.cron).toBe('*/5 * * * *');
    });
});

// ────────────────────────────────────────────────────
// JobDefinition extensions (mixed mode, parallelGroups, triggers)
// ────────────────────────────────────────────────────

describe('JobDefinition extensions', () => {
    const baseDef: JobDefinition = {
        id: 'jd-1',
        name: 'Test',
        description: 'desc',
        mode: 'serial',
        steps: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };

    it('supports serial mode', () => {
        expect(baseDef.mode).toBe('serial');
    });

    it('supports parallel mode', () => {
        const def: JobDefinition = { ...baseDef, mode: 'parallel' };
        expect(def.mode).toBe('parallel');
    });

    it('supports mixed mode', () => {
        const def: JobDefinition = { ...baseDef, mode: 'mixed' };
        expect(def.mode).toBe('mixed');
    });

    it('includes parallelGroups array', () => {
        const def: JobDefinition = {
            ...baseDef,
            mode: 'mixed',
            parallelGroups: [
                { id: 'pg-1', label: 'Fetch batch', stepIds: ['s1', 's2', 's3'] },
            ],
        };
        expect(def.parallelGroups).toHaveLength(1);
        expect(def.parallelGroups![0].stepIds).toEqual(['s1', 's2', 's3']);
    });

    it('includes triggers array', () => {
        const def: JobDefinition = {
            ...baseDef,
            triggers: [
                { id: 't1', event: 'artifact:created', enabled: true },
                { id: 't2', event: 'schedule:cron', enabled: false, cron: '0 0 * * *' },
            ],
        };
        expect(def.triggers).toHaveLength(2);
        expect(def.triggers![0].event).toBe('artifact:created');
        expect(def.triggers![1].cron).toBe('0 0 * * *');
    });

    it('supports inputDefaults with sources', () => {
        const def: JobDefinition = {
            ...baseDef,
            inputDefaults: [
                {
                    name: 'Scout',
                    type: 'agent',
                    entityId: 'agt-1',
                    source: { kind: 'prompt', promptText: 'Pick an agent' },
                },
            ],
        };
        expect(def.inputDefaults![0].source?.kind).toBe('prompt');
    });
});

// ────────────────────────────────────────────────────
// Parallel Group helpers
// ────────────────────────────────────────────────────

describe('PARALLEL_GROUP_CMD & isParallelGroup', () => {
    it('PARALLEL_GROUP_CMD is "__parallel__"', () => {
        expect(PARALLEL_GROUP_CMD).toBe('__parallel__');
    });

    it('isParallelGroup returns true for parallel container steps', () => {
        const step: StudioStep = {
            id: 'g1',
            commandId: PARALLEL_GROUP_CMD,
            args: {},
            inputBindings: {},
            preCondition: '',
            postCondition: '',
            parentId: null,
            outputMappings: [],
            label: 'Batch A',
            x: 0,
            y: 0,
        };
        expect(isParallelGroup(step)).toBe(true);
    });

    it('isParallelGroup returns false for regular steps', () => {
        const step: StudioStep = {
            id: 's1',
            commandId: 'create_agent',
            args: {},
            inputBindings: {},
            preCondition: '',
            postCondition: '',
            parentId: null,
            outputMappings: [],
            x: 0,
            y: 0,
        };
        expect(isParallelGroup(step)).toBe(false);
    });

    it('isParallelGroup returns false for steps whose commandId resembles but is not exact', () => {
        const step: StudioStep = {
            id: 's2',
            commandId: '__parallel',
            args: {},
            inputBindings: {},
            preCondition: '',
            postCondition: '',
            parentId: null,
            outputMappings: [],
            x: 0,
            y: 0,
        };
        expect(isParallelGroup(step)).toBe(false);
    });
});
