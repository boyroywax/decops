import {
    queueNewJobCommand,
    pauseQueueCommand,
    resumeQueueCommand,
    deleteQueuedJobCommand,
    listQueueCommand,
    listCatalogJobsCommand,
    saveJobDefinitionCommand,
    deleteJobDefinitionCommand
} from '../../../../services/commands/definitions/jobs';
import { CommandContext } from '../../../../services/commands/types';
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Jobs Commands', () => {
    let context: CommandContext;
    let mockQueue: any[] = [];
    let mockCatalog: any[] = [];
    let mockAddJob: any;
    let mockRemoveJob: any;
    let mockPauseQueue: any;
    let mockResumeQueue: any;
    let mockSaveDefinition: any;
    let mockDeleteDefinition: any;

    beforeEach(() => {
        mockQueue = [];
        mockCatalog = [];
        mockAddJob = vi.fn((job) => mockQueue.push(job));
        mockRemoveJob = vi.fn((id) => {
            const index = mockQueue.findIndex(j => j.id === id);
            if (index > -1) mockQueue.splice(index, 1);
        });
        mockPauseQueue = vi.fn();
        mockResumeQueue = vi.fn();
        mockSaveDefinition = vi.fn((def) => mockCatalog.push(def));
        mockDeleteDefinition = vi.fn((id) => {
            const index = mockCatalog.findIndex(d => d.id === id);
            if (index > -1) mockCatalog.splice(index, 1);
        });

        context = {
            jobs: {
                addJob: mockAddJob,
                removeJob: mockRemoveJob,
                pauseQueue: mockPauseQueue,
                resumeQueue: mockResumeQueue,
                getQueue: () => mockQueue,
                getCatalog: () => mockCatalog,
                saveDefinition: mockSaveDefinition,
                deleteDefinition: mockDeleteDefinition,
            } as any,
        } as unknown as CommandContext;
    });

    describe('Queue Management', () => {
        it('should queue a new job', async () => {
            const args = { type: 'test_cmd', request: { foo: 'bar' } };
            const result = await queueNewJobCommand.execute(args, context);

            expect(result).toBe('Job queued');
            expect(mockAddJob).toHaveBeenCalledWith({ type: 'test_cmd', request: { foo: 'bar' } });
        });

        it('should pause the queue', async () => {
            await pauseQueueCommand.execute({}, context);
            expect(mockPauseQueue).toHaveBeenCalled();
        });

        it('should resume the queue', async () => {
            await resumeQueueCommand.execute({}, context);
            expect(mockResumeQueue).toHaveBeenCalled();
        });

        it('should list queued jobs', async () => {
            mockQueue.push({ id: 'j1' }, { id: 'j2' });
            const result = await listQueueCommand.execute({}, context);
            expect(result).toHaveLength(2);
            expect(result).toEqual(mockQueue);
        });

        it('should delete a queued job', async () => {
            mockQueue.push({ id: 'j1' });
            await deleteQueuedJobCommand.execute({ id: 'j1' }, context);
            expect(mockRemoveJob).toHaveBeenCalledWith('j1');
        });
    });

    describe('Catalog Management', () => {
        it('should save a job definition', async () => {
            const args = {
                name: 'My Job',
                description: 'Desc',
                mode: 'serial',
                steps: [{ id: 's1' }]
            };
            const result = await saveJobDefinitionCommand.execute(args, context);

            expect(result).toContain('job-def-');
            expect(mockSaveDefinition).toHaveBeenCalledWith(expect.objectContaining({
                name: 'My Job',
                steps: [{ id: 's1' }]
            }));
        });

        it('should list catalog jobs', async () => {
            mockCatalog.push({ id: 'def1' });
            const result = await listCatalogJobsCommand.execute({}, context);
            expect(result).toHaveLength(1);
            expect(result).toEqual(mockCatalog);
        });

        it('should delete a job definition', async () => {
            mockCatalog.push({ id: 'def1' });
            await deleteJobDefinitionCommand.execute({ id: 'def1' }, context);
            expect(mockDeleteDefinition).toHaveBeenCalledWith('def1');
        });
    });
});
