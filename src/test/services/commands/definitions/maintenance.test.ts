import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bulkDeleteCommand } from '../../../../services/commands/definitions/maintenance';

describe('bulkDeleteCommand', () => {
    let mockContext: any;
    let setAgents: any;
    let setChannels: any;
    let setGroups: any;
    let setMessages: any;

    beforeEach(() => {
        setAgents = vi.fn();
        setChannels = vi.fn();
        setGroups = vi.fn();
        setMessages = vi.fn();

        mockContext = {
            workspace: {
                setAgents,
                setChannels,
                setGroups,
                setMessages,
                addLog: vi.fn(),
            },
        };
    });

    it('should bulk delete agents', async () => {
        const initialAgents = [
            { id: '1', name: 'Agent 1' },
            { id: '2', name: 'Agent 2' },
            { id: '3', name: 'Agent 3' },
        ];

        // Mock the state update function to capture the callback
        setAgents.mockImplementation((callback: any) => {
            const newState = callback(initialAgents);
            return newState;
        });

        const args = {
            type: 'agents',
            ids: ['1', '3'],
        };

        const result = await bulkDeleteCommand.execute(args, mockContext);

        expect(result).toContain('Deleted 2 agents');
        expect(setAgents).toHaveBeenCalled();

        // Verify the filter logic
        const updateFn = setAgents.mock.calls[0][0];
        const newState = updateFn(initialAgents);
        expect(newState).toHaveLength(1);
        expect(newState[0].id).toBe('2');
    });

    it('should throw error for unknown type', async () => {
        const args = {
            type: 'unknown_type',
            ids: ['1'],
        };

        await expect(bulkDeleteCommand.execute(args, mockContext)).rejects.toThrow('Unknown type: unknown_type');
    });
});
