import { createArtifactCommand, editArtifactCommand, deleteArtifactCommand } from '../../../../services/commands/definitions/artifact';
import { CommandContext } from '../../../../services/commands/types';
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Artifact Commands', () => {
    let context: CommandContext;
    let mockArtifacts: any[] = [];
    let mockAddLog: any;
    let mockImportArtifact: any;
    let mockRemoveArtifact: any;

    beforeEach(() => {
        mockArtifacts = [];
        mockAddLog = vi.fn();
        mockImportArtifact = vi.fn((artifact) => mockArtifacts.push(artifact));
        mockRemoveArtifact = vi.fn((id) => {
            const index = mockArtifacts.findIndex(a => a.id === id);
            if (index > -1) mockArtifacts.splice(index, 1);
        });

        context = {
            workspace: {
                addLog: mockAddLog,
            } as any,
            jobs: {
                importArtifact: mockImportArtifact,
                removeArtifact: mockRemoveArtifact,
                get allArtifacts() { return mockArtifacts; },
            } as any,
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
            expect(result.artifact.name).toBe('test.md'); // Should preserve other fields

            // The command implements edit by remove + add
            expect(mockRemoveArtifact).toHaveBeenCalledWith('art-1');
            expect(mockImportArtifact).toHaveBeenCalledWith(expect.objectContaining({
                id: 'art-1',
                content: 'New'
            }));
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
});
