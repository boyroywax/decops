import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    studioGetStateCommand,
    studioSetJobMetaCommand,
    studioAddStepCommand,
    studioRemoveStepCommand,
    studioAddParallelGroupCommand,
    studioAddTriggerCommand,
    studioRemoveTriggerCommand,
} from '@/toolkits/studio';
import { CommandContext } from '@/services/commands/types';

describe('Studio Commands', () => {
    let context: CommandContext;
    let mockStudio: any;

    beforeEach(() => {
        mockStudio = {
            getState: vi.fn(() => ({
                name: 'Test Job',
                description: 'A test job',
                mode: 'serial',
                steps: [],
                deliverables: [],
                storageEntries: [],
            })),
            setName: vi.fn(),
            setDescription: vi.fn(),
            addStep: vi.fn(() => 'step-1'),
            removeStep: vi.fn(),
            updateStepArg: vi.fn(),
            addParallelGroup: vi.fn(() => 'pg-1'),
            addTrigger: vi.fn(),
            removeTrigger: vi.fn(),
        };

        context = { studio: mockStudio } as unknown as CommandContext;
    });

    // ── studioGetStateCommand ──────────────────────────────

    describe('studioGetStateCommand', () => {
        it('has correct metadata', () => {
            expect(studioGetStateCommand.id).toBe('studio_get_state');
            expect(studioGetStateCommand.tags).toContain('studio');
            expect(studioGetStateCommand.tags).toContain('query');
        });

        it('returns current studio state', async () => {
            const result = await studioGetStateCommand.execute({}, context);
            expect(mockStudio.getState).toHaveBeenCalled();
            expect(result).toHaveProperty('name', 'Test Job');
        });

        it('returns error when studio not available', async () => {
            const noStudioCtx = { studio: undefined } as unknown as CommandContext;
            const result = await studioGetStateCommand.execute({}, noStudioCtx);
            expect(result).toHaveProperty('error');
        });
    });

    // ── studioSetJobMetaCommand ────────────────────────────

    describe('studioSetJobMetaCommand', () => {
        it('has correct metadata', () => {
            expect(studioSetJobMetaCommand.id).toBe('studio_set_job_meta');
            expect(studioSetJobMetaCommand.tags).toContain('studio');
        });

        it('sets job name', async () => {
            await studioSetJobMetaCommand.execute({ name: 'New Name' }, context);
            expect(mockStudio.setName).toHaveBeenCalledWith('New Name');
        });

        it('sets job description', async () => {
            await studioSetJobMetaCommand.execute({ description: 'New desc' }, context);
            expect(mockStudio.setDescription).toHaveBeenCalledWith('New desc');
        });

        it('returns error when studio not available', async () => {
            const noStudioCtx = { studio: undefined } as unknown as CommandContext;
            const result = await studioSetJobMetaCommand.execute({ name: 'x' }, noStudioCtx);
            expect(result).toHaveProperty('error');
        });
    });

    // ── studioAddStepCommand ───────────────────────────────

    describe('studioAddStepCommand', () => {
        it('has correct metadata', () => {
            expect(studioAddStepCommand.id).toBe('studio_add_step');
            expect(studioAddStepCommand.args.commandId.required).toBe(true);
        });

        it('returns error when studio not available', async () => {
            const noStudioCtx = { studio: undefined } as unknown as CommandContext;
            const result = await studioAddStepCommand.execute({ commandId: 'create_agent' }, noStudioCtx);
            expect(result).toHaveProperty('error');
        });
    });

    // ── studioAddParallelGroupCommand ──────────────────────

    describe('studioAddParallelGroupCommand', () => {
        it('has correct metadata', () => {
            expect(studioAddParallelGroupCommand.id).toBe('studio_add_parallel_group');
            expect(studioAddParallelGroupCommand.tags).toContain('parallel');
            expect(studioAddParallelGroupCommand.tags).toContain('studio');
        });

        it('takes no required arguments', () => {
            expect(Object.keys(studioAddParallelGroupCommand.args)).toHaveLength(0);
        });

        it('calls studio.addParallelGroup and returns groupId', async () => {
            const result = await studioAddParallelGroupCommand.execute({}, context);
            expect(mockStudio.addParallelGroup).toHaveBeenCalled();
            expect(result).toEqual({ groupId: 'pg-1' });
        });

        it('returns error when studio not available', async () => {
            const noStudioCtx = { studio: undefined } as unknown as CommandContext;
            const result = await studioAddParallelGroupCommand.execute({}, noStudioCtx);
            expect(result).toHaveProperty('error');
            expect((result as any).error).toContain('Studio is not available');
        });
    });

    // ── studioAddTriggerCommand ────────────────────────────

    describe('studioAddTriggerCommand', () => {
        it('has correct metadata', () => {
            expect(studioAddTriggerCommand.id).toBe('studio_add_trigger');
            expect(studioAddTriggerCommand.tags).toContain('trigger');
            expect(studioAddTriggerCommand.tags).toContain('automation');
            expect(studioAddTriggerCommand.args.event.required).toBe(true);
        });

        it('creates a trigger with event only', async () => {
            const result = await studioAddTriggerCommand.execute(
                { event: 'artifact:created' },
                context,
            );
            expect(result).toHaveProperty('triggerId');
            expect(result).toHaveProperty('event', 'artifact:created');
            expect(mockStudio.addTrigger).toHaveBeenCalled();
        });

        it('creates a trigger with label and name-pattern filter', async () => {
            // Use a short string (< 8 chars) so the ID regex doesn't match
            const result = await studioAddTriggerCommand.execute(
                { event: 'agent:created', filter: 'scout', label: 'On new agent' },
                context,
            );
            expect(result).toHaveProperty('event', 'agent:created');
            expect(result).toHaveProperty('label', 'On new agent');
            // "scout" is < 8 chars, no colon → name pattern
            expect(result.filter).toEqual(
                expect.objectContaining({ name: 'scout' }),
            );
        });

        it('parses an ID-like filter string as entityId', async () => {
            const idVal = 'abcdef12-3456-7890-abcd-ef1234567890';
            const result = await studioAddTriggerCommand.execute(
                { event: 'artifact:updated', filter: idVal },
                context,
            );
            expect(result.filter).toHaveProperty('entityId', idVal);
        });

        it('parses a tag-like filter string as tag', async () => {
            const result = await studioAddTriggerCommand.execute(
                { event: 'artifact:deleted', filter: 'type:report' },
                context,
            );
            expect(result.filter).toHaveProperty('tag', 'type:report');
        });

        it('passes cron expression for schedule:cron events', async () => {
            const result = await studioAddTriggerCommand.execute(
                { event: 'schedule:cron', cron: '0 * * * *' },
                context,
            );
            expect(result).toHaveProperty('event', 'schedule:cron');
            expect(mockStudio.addTrigger).toHaveBeenCalledWith(
                'schedule:cron',
                expect.any(String),
                undefined,
                undefined,
                '0 * * * *',
            );
        });

        it('returns error when studio not available', async () => {
            const noStudioCtx = { studio: undefined } as unknown as CommandContext;
            const result = await studioAddTriggerCommand.execute(
                { event: 'artifact:created' },
                noStudioCtx,
            );
            expect(result).toHaveProperty('error');
        });
    });

    // ── studioRemoveTriggerCommand ─────────────────────────

    describe('studioRemoveTriggerCommand', () => {
        it('has correct metadata', () => {
            expect(studioRemoveTriggerCommand.id).toBe('studio_remove_trigger');
            expect(studioRemoveTriggerCommand.tags).toContain('trigger');
            expect(studioRemoveTriggerCommand.args.triggerId.required).toBe(true);
        });

        it('calls studio.removeTrigger and returns confirmation', async () => {
            const result = await studioRemoveTriggerCommand.execute(
                { triggerId: 'trigger-abc' },
                context,
            );
            expect(mockStudio.removeTrigger).toHaveBeenCalledWith('trigger-abc');
            expect(result).toEqual({ removed: 'trigger-abc' });
        });

        it('returns error when studio not available', async () => {
            const noStudioCtx = { studio: undefined } as unknown as CommandContext;
            const result = await studioRemoveTriggerCommand.execute(
                { triggerId: 'trigger-abc' },
                noStudioCtx,
            );
            expect(result).toHaveProperty('error');
        });
    });
});
