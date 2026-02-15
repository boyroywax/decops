import { describe, it, expect, vi } from 'vitest';
import { createGroupCommand } from '../../../../services/commands/definitions/group';

describe('createGroupCommand', () => {
    const mockAgents = [
        { id: 'agent-1', name: 'Agent 1' },
        { id: 'agent-2', name: 'Agent 2' },
        { id: 'agent-3', name: 'Agent 3' }
    ];

    const mockContext = {
        workspace: {
            agents: mockAgents,
            groups: [],
            channels: [], // Needed for auto-channel creation logic
            setGroups: vi.fn(),
            setChannels: vi.fn(), // Needed
            addLog: vi.fn(),
        }
    };

    it('creates a group with valid members', async () => {
        const args = {
            name: 'Test Group',
            members: ['agent-1', 'agent-2'],
            governance: 'majority'
        };

        const result = await createGroupCommand.execute(args, mockContext as any);

        expect(result.status).toBe('created');
        expect(result).toHaveProperty('groupId');
        expect(mockContext.workspace.setGroups).toHaveBeenCalled();
    });

    it('throws if member not found', async () => {
        const args = {
            name: 'Bad Group',
            members: ['agent-1', 'unknown'],
            governance: 'majority'
        };

        await expect(createGroupCommand.execute(args, mockContext as any)).rejects.toThrow("Agent 'unknown' not found");
    });

    it('throws if fewer than 2 members', async () => {
        const args = {
            name: 'Lonely Group',
            members: ['agent-1'],
            governance: 'majority'
        };

        await expect(createGroupCommand.execute(args, mockContext as any)).rejects.toThrow("Group must have at least 2 members");
    });

    it('creates consensus channels between members', async () => {
        const args = {
            name: 'Consensus Group',
            members: ['agent-1', 'agent-2', 'agent-3'],
            governance: 'majority'
        };

        const result = await createGroupCommand.execute(args, mockContext as any);

        // 3 members -> 3 connections (1-2, 1-3, 2-3)
        // Check log message or mock call
        expect(mockContext.workspace.addLog).toHaveBeenCalledWith(expect.stringContaining('Created 3 consensus channels'));
        expect(mockContext.workspace.setChannels).toHaveBeenCalled();
    });
});
