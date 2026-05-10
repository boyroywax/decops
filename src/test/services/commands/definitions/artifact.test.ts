import { createArtifactCommand, editArtifactCommand, deleteArtifactCommand, listArtifactsCommand, searchArtifactsCommand, tagArtifactCommand } from '@/services/commands/definitions/artifact';
import { CommandContext } from '@/services/commands/types';
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Artifact Commands', () => {
    let context: CommandContext;
    let mockArtifacts: any[] = [];
    let mockAddLog: any;
    let mockImportArtifact: any;
    let mockRemoveArtifact: any;
    let mockUpdateArtifact: any;
    let mockAddDeliverable: any;

    beforeEach(() => {
        mockArtifacts = [];
        mockAddLog = vi.fn();
        mockImportArtifact = vi.fn((artifact) => mockArtifacts.push(artifact));
        mockRemoveArtifact = vi.fn((id) => {
            const index = mockArtifacts.findIndex(a => a.id === id);
            if (index > -1) mockArtifacts.splice(index, 1);
        });
        mockUpdateArtifact = vi.fn((id, updates) => {
            const idx = mockArtifacts.findIndex(a => a.id === id);
            if (idx > -1) Object.assign(mockArtifacts[idx], updates);
        });
        mockAddDeliverable = vi.fn();

        context = {
            workspace: {
                addLog: mockAddLog,
            } as any,
            jobs: {
                importArtifact: mockImportArtifact,
                removeArtifact: mockRemoveArtifact,
                updateArtifact: mockUpdateArtifact,
                get allArtifacts() { return mockArtifacts; },
            } as any,
            storage: {} as Record<string, any>,
            addDeliverable: mockAddDeliverable,
        } as unknown as CommandContext;
    });

    describe('create_artifact', () => {
        it('should create a new artifact', async () => {
            const args = { name: 'test.md', type: 'markdown', content: '# Hello' };
            const result = await createArtifactCommand.execute(args, context);

            expect(result.success).toBe(true);
            expect(result.artifact.name).toBe('test.md');
            expect(result.artifact.type).toBe('markdown');
            expect(result.artifact.content).toBe('# Hello');
            expect(result.artifact.id).toBeDefined();

            expect(mockImportArtifact).toHaveBeenCalledWith(result.artifact);
            expect(mockAddLog).toHaveBeenCalledWith(expect.stringContaining('Artifact created'));
        });
    });

    describe('edit_artifact', () => {
        it('should edit an existing artifact', async () => {
            const existing = { id: 'art-1', name: 'test.md', type: 'markdown', content: 'Old' };
            mockArtifacts.push(existing);

            const args = { id: 'art-1', content: 'New' };
            const result = await editArtifactCommand.execute(args, context);

            expect(result.success).toBe(true);
            expect(result.artifact.content).toBe('New');
            expect(result.artifact.name).toBe('test.md');

            expect(mockUpdateArtifact).toHaveBeenCalledWith('art-1', { content: 'New' });
            expect(mockAddLog).toHaveBeenCalledWith(expect.stringContaining('Artifact updated'));
        });

        it('should throw error if artifact not found', async () => {
            const args = { id: 'missing', content: 'New' };
            await expect(editArtifactCommand.execute(args, context)).rejects.toThrow('Artifact missing not found');
        });
    });

    describe('delete_artifact', () => {
        it('should delete an artifact', async () => {
            const args = { id: 'art-1' };
            const result = await deleteArtifactCommand.execute(args, context);

            expect(result.success).toBe(true);
            expect(mockRemoveArtifact).toHaveBeenCalledWith('art-1');
            expect(mockAddLog).toHaveBeenCalledWith(expect.stringContaining('Artifact deleted'));
        });
    });

    describe('tag_artifact', () => {
        it('should add tags to an artifact', async () => {
            mockArtifacts.push({ id: 'art-1', name: 'test.md', type: 'markdown', tags: ['type:markdown'] });

            const result = await tagArtifactCommand.execute({ id: 'art-1', add: 'status:reviewed,priority:high' }, context);

            expect(result.success).toBe(true);
            expect(result.artifact.tags).toContain('type:markdown');
            expect(result.artifact.tags).toContain('status:reviewed');
            expect(result.artifact.tags).toContain('priority:high');
            expect(mockUpdateArtifact).toHaveBeenCalledWith('art-1', { tags: expect.arrayContaining(['status:reviewed', 'priority:high']) });
        });

        it('should not duplicate existing tags when adding', async () => {
            mockArtifacts.push({ id: 'art-1', name: 'test.md', type: 'markdown', tags: ['existing'] });

            const result = await tagArtifactCommand.execute({ id: 'art-1', add: 'existing,new-tag' }, context);

            expect(result.artifact.tags).toEqual(['existing', 'new-tag']);
        });

        it('should remove tags from an artifact', async () => {
            mockArtifacts.push({ id: 'art-1', name: 'test.md', type: 'markdown', tags: ['keep', 'remove-me', 'also-remove'] });

            const result = await tagArtifactCommand.execute({ id: 'art-1', remove: 'remove-me,also-remove' }, context);

            expect(result.artifact.tags).toEqual(['keep']);
            expect(mockUpdateArtifact).toHaveBeenCalled();
        });

        it('should replace all tags when using set', async () => {
            mockArtifacts.push({ id: 'art-1', name: 'test.md', type: 'markdown', tags: ['old1', 'old2'] });

            const result = await tagArtifactCommand.execute({ id: 'art-1', set: 'new1,new2,new3' }, context);

            expect(result.artifact.tags).toEqual(['new1', 'new2', 'new3']);
        });

        it('should throw if artifact not found', async () => {
            await expect(tagArtifactCommand.execute({ id: 'missing', add: 'tag' }, context))
                .rejects.toThrow('Artifact missing not found');
        });

        it('should throw if no add/remove/set provided', async () => {
            mockArtifacts.push({ id: 'art-1', name: 'test.md', type: 'markdown', tags: [] });

            await expect(tagArtifactCommand.execute({ id: 'art-1' }, context))
                .rejects.toThrow('Provide at least one of: add, remove, or set');
        });
    });

    describe('list_artifacts', () => {
        beforeEach(() => {
            mockArtifacts.push(
                { id: 'a1', name: 'report.md', type: 'markdown', source: 'command', tags: ['type:markdown', 'project:alpha'], content: '# Report', createdAt: 1000 },
                { id: 'a2', name: 'data.json', type: 'json', source: 'job', tags: ['type:json'], content: '{}', createdAt: 2000 },
                { id: 'a3', name: 'config.yaml', type: 'yaml', source: 'user', tags: ['type:yaml', 'project:alpha'], content: 'key: val', createdAt: 3000 },
            );
        });

        it('should list all artifacts', async () => {
            const result = await listArtifactsCommand.execute({}, context);

            expect(result.total).toBe(3);
            expect(result.returned).toBe(3);
            expect(result.artifacts).toHaveLength(3);
            // Newest first
            expect(result.artifacts[0].id).toBe('a3');
        });

        it('should filter by type', async () => {
            const result = await listArtifactsCommand.execute({ type: 'json' }, context);

            expect(result.total).toBe(1);
            expect(result.artifacts[0].name).toBe('data.json');
        });

        it('should filter by source', async () => {
            const result = await listArtifactsCommand.execute({ source: 'command' }, context);

            expect(result.total).toBe(1);
            expect(result.artifacts[0].name).toBe('report.md');
        });

        it('should filter by tag', async () => {
            const result = await listArtifactsCommand.execute({ tag: 'project:alpha' }, context);

            expect(result.total).toBe(2);
            expect(result.artifacts.map((a: any) => a.id)).toEqual(expect.arrayContaining(['a1', 'a3']));
        });

        it('should respect limit', async () => {
            const result = await listArtifactsCommand.execute({ limit: 2 }, context);

            expect(result.total).toBe(3);
            expect(result.returned).toBe(2);
            expect(result.artifacts).toHaveLength(2);
        });

        it('should include content preview', async () => {
            const result = await listArtifactsCommand.execute({}, context);

            expect(result.artifacts[0].contentPreview).toBeDefined();
            expect(typeof result.artifacts[0].contentPreview).toBe('string');
        });

        it('should return empty for no matches', async () => {
            const result = await listArtifactsCommand.execute({ type: 'image' }, context);

            expect(result.total).toBe(0);
            expect(result.artifacts).toHaveLength(0);
        });
    });

    describe('search_artifacts', () => {
        beforeEach(() => {
            mockArtifacts.push(
                { id: 'a1', name: 'architecture.md', type: 'markdown', tags: ['design'], content: 'The microservice architecture uses event-driven patterns', description: 'System design doc', createdAt: 1000 },
                { id: 'a2', name: 'api-spec.json', type: 'json', tags: ['api', 'spec'], content: '{"endpoints": ["/users", "/orders"]}', description: '', createdAt: 2000 },
                { id: 'a3', name: 'deploy.yaml', type: 'yaml', tags: ['devops'], content: 'image: nginx:latest', description: 'Deployment config', createdAt: 3000 },
            );
        });

        it('should search by name', async () => {
            const result = await searchArtifactsCommand.execute({ query: 'architecture' }, context);

            expect(result.total).toBe(1);
            expect(result.results[0].id).toBe('a1');
            expect(result.results[0].matchFields).toContain('name');
        });

        it('should search by content', async () => {
            const result = await searchArtifactsCommand.execute({ query: 'microservice' }, context);

            expect(result.total).toBe(1);
            expect(result.results[0].matchFields).toContain('content');
            expect(result.results[0].snippet).toContain('microservice');
        });

        it('should search by tag', async () => {
            const result = await searchArtifactsCommand.execute({ query: 'devops' }, context);

            expect(result.total).toBe(1);
            expect(result.results[0].id).toBe('a3');
            expect(result.results[0].matchFields).toContain('tags');
        });

        it('should search by description', async () => {
            const result = await searchArtifactsCommand.execute({ query: 'design' }, context);

            expect(result.total).toBeGreaterThanOrEqual(1);
            const matchedFields = result.results.flatMap((r: any) => r.matchFields);
            expect(matchedFields).toContain('description');
        });

        it('should be case-insensitive', async () => {
            const result = await searchArtifactsCommand.execute({ query: 'NGINX' }, context);

            expect(result.total).toBe(1);
            expect(result.results[0].id).toBe('a3');
        });

        it('should filter by type', async () => {
            const result = await searchArtifactsCommand.execute({ query: 'a', type: 'json' }, context);

            expect(result.results.every((r: any) => r.type === 'json')).toBe(true);
        });

        it('should respect limit', async () => {
            const result = await searchArtifactsCommand.execute({ query: 'a', limit: 1 }, context);

            expect(result.results).toHaveLength(1);
        });

        it('should throw on empty query', async () => {
            await expect(searchArtifactsCommand.execute({ query: '  ' }, context))
                .rejects.toThrow('Search query cannot be empty');
        });

        it('should rank by relevance (more matched fields first)', async () => {
            // 'design' matches a1 in both tags and description
            mockArtifacts.length = 0;
            mockArtifacts.push(
                { id: 'x1', name: 'other.md', type: 'markdown', tags: [], content: 'design patterns', description: '', createdAt: 1000 },
                { id: 'x2', name: 'design-doc.md', type: 'markdown', tags: ['design'], content: 'some design concepts', description: 'A design document', createdAt: 2000 },
            );

            const result = await searchArtifactsCommand.execute({ query: 'design' }, context);

            // x2 matches in name, tags, content, description (4 fields) vs x1 in content only (1 field)
            expect(result.results[0].id).toBe('x2');
            expect(result.results[0].matchFields.length).toBeGreaterThan(result.results[1].matchFields.length);
        });
    });
});
