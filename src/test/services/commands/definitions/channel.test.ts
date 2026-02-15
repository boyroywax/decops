import { describe, it, expect, vi } from 'vitest';
import { createChannelCommand } from '../../../../services/commands/definitions/channel';

describe('createChannelCommand', () => {
    const mockAgents = [
        { id: 'agent-1', name: 'Agent 1' },
        { id: 'agent-2', name: 'Agent 2' }
    ];

    const mockContext = {
        workspace: {
            agents: mockAgents,
            channels: [],
            setChannels: vi.fn(),
            addLog: vi.fn(),
        }
    };

    it('creates a new channel', async () => {
        const args = { from: 'agent-1', to: 'agent-2', type: 'data' };
        const result = await createChannelCommand.execute(args, mockContext);

        expect(result.status).toBe('created');
        expect(result).toHaveProperty('channelId');
        expect(mockContext.workspace.setChannels).toHaveBeenCalled();
    });

    it('throws if agent not found', async () => {
        const args = { from: 'unknown', to: 'agent-2' };
        await expect(createChannelCommand.execute(args, mockContext)).rejects.toThrow("Agent 'unknown' not found");
    });

    it('throws if creating channel to self', async () => {
        const args = { from: 'agent-1', to: 'agent-1' };
        await expect(createChannelCommand.execute(args, mockContext)).rejects.toThrow("Cannot create channel to self");
    });

    it('detects existing channels', async () => {
        const contextWithChannel = {
            ...mockContext,
            workspace: {
                ...mockContext.workspace,
                channels: [{ from: 'agent-1', to: 'agent-2' }]
            }
        };

        const args = { from: 'agent-1', to: 'agent-2' };
        const result = await createChannelCommand.execute(args, contextWithChannel);
        expect(result.status).toBe('exists');
    });
});
