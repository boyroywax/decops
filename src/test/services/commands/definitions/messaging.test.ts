import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendMessageCommand } from '../../../../services/commands/definitions/messaging';
import * as aiService from '../../../../services/ai';

// Mock the AI service
vi.mock('../../../../services/ai', () => ({
    callAgentAI: vi.fn()
}));

describe('sendMessageCommand', () => {
    const mockAgents = [
        { id: 'agent-1', name: 'Sender', prompt: 'You are a sender' },
        { id: 'agent-2', name: 'Receiver', prompt: 'You are a receiver' },
        { id: 'agent-3', name: 'Passive', prompt: '' } // No prompt
    ];

    const mockChannels = [
        { id: 'ch-1', from: 'agent-1', to: 'agent-2', type: 'data' },
        { id: 'ch-2', from: 'agent-1', to: 'agent-3', type: 'data' }
    ];

    const mockContext = {
        workspace: {
            agents: mockAgents,
            channels: mockChannels,
            messages: [],
            setMessages: vi.fn((cb) => {
                // Simulate state update if needed, but for unit test we check mock call
            }),
            addLog: vi.fn(),
        }
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('sends a message and triggers AI response', async () => {
        const args = {
            from_agent_name: 'Sender',
            to_agent_name: 'Receiver',
            message: 'Hello'
        };

        // Mock AI response
        vi.mocked(aiService.callAgentAI).mockResolvedValue("AI Response");

        const result = await sendMessageCommand.execute(args, mockContext);

        expect(result.status).toBe('delivered');
        expect(result.response).toBe('AI Response');
        expect(aiService.callAgentAI).toHaveBeenCalled();
        expect(mockContext.workspace.setMessages).toHaveBeenCalled(); // Should be called for sending and response
    });

    it('sends a message to agent without prompt (no AI trigger)', async () => {
        const args = {
            from_agent_name: 'Sender',
            to_agent_name: 'Passive', // agent-3 has no prompt
            message: 'Hello'
        };

        const result = await sendMessageCommand.execute(args, mockContext);

        expect(result.status).toBe('no-prompt');
        expect(aiService.callAgentAI).not.toHaveBeenCalled();
        expect(mockContext.workspace.setMessages).toHaveBeenCalled();
    });

    it('throws if agent not found', async () => {
        const args = {
            from_agent_name: 'Unknown',
            to_agent_name: 'Receiver',
            message: 'Hello'
        };

        await expect(sendMessageCommand.execute(args, mockContext)).rejects.toThrow("Sender agent 'Unknown' not found");
    });

    it('throws if channel does not exist', async () => {
        // Create a context without channel
        const contextNoChannel = {
            ...mockContext,
            workspace: {
                ...mockContext.workspace,
                channels: []
            }
        };

        const args = {
            from_agent_name: 'Sender',
            to_agent_name: 'Receiver', // Agents exist, but no channel
            message: 'Hello'
        };

        // The implementation throws "No channel exists..." if not found
        // Note: implementation might construct error string dynamically
        await expect(sendMessageCommand.execute(args, contextNoChannel)).rejects.toThrow(/No channel exists/);
    });
});
