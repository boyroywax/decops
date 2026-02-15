import { describe, it, expect, vi, beforeEach } from 'vitest';
import { broadcastMessageCommand } from '../../../../services/commands/definitions/broadcast';
import * as aiService from '../../../../services/ai';

vi.mock('../../../../services/ai', () => ({
    callAgentAI: vi.fn()
}));

describe('broadcastMessageCommand', () => {
    const mockAgents = [
        { id: 'a1', name: 'Sender' },
        { id: 'a2', name: 'Receiver1', prompt: 'Prompt' },
        { id: 'a3', name: 'Receiver2', prompt: '' }
    ];
    const mockGroups = [
        { id: 'g1', name: 'Test Group', members: ['a1', 'a2', 'a3'] }
    ];
    const mockChannels = [
        { id: 'c1', from: 'a1', to: 'a2', type: 'data' },
        { id: 'c2', from: 'a1', to: 'a3', type: 'data' }
    ];

    const mockContext = {
        workspace: {
            agents: mockAgents,
            groups: mockGroups,
            channels: mockChannels,
            setMessages: vi.fn(),
            addLog: vi.fn(),
            setActiveChannels: vi.fn()
        }
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('broadcasts to all members', async () => {
        vi.mocked(aiService.callAgentAI).mockResolvedValue('Ack');

        const args = {
            group_id: 'g1',
            message: 'Hello Group',
            sender_id: 'a1'
        };

        const result = await broadcastMessageCommand.execute(args, mockContext as any);

        expect(result.success).toBe(true);
        expect(result.count).toBe(2); // a2 and a3
        expect(mockContext.workspace.setMessages).toHaveBeenCalled();
        expect(aiService.callAgentAI).toHaveBeenCalledTimes(1); // Only a2 has prompt
    });

    it('throws if group not found', async () => {
        await expect(broadcastMessageCommand.execute({ group_id: 'unknown', message: 'Hi' }, mockContext as any))
            .rejects.toThrow('Group not found');
    });

    it('skips if no channel exists', async () => {
        const contextNoChannel = {
            ...mockContext,
            workspace: { ...mockContext.workspace, channels: [] }
        };

        const args = { group_id: 'g1', message: 'Hi', sender_id: 'a1' };
        const result = await broadcastMessageCommand.execute(args, contextNoChannel as any);

        expect(result.count).toBe(0);
    });
});
