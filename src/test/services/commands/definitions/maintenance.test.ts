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
                agents: [
                    { id: '1', name: 'Agent 1' },
                    { id: '2', name: 'Agent 2' },
                    { id: '3', name: 'Agent 3' },
                ],
                channels: [],
                groups: [],
                messages: [],
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

    it('should throw if no IDs provided', async () => {
        const args = { type: 'agents', ids: [] };

        await expect(bulkDeleteCommand.execute(args, mockContext)).rejects.toThrow('No IDs provided');
    });

    it('should throw if none of the IDs are found', async () => {
        const args = { type: 'agents', ids: ['fake-1', 'fake-2'] };

        await expect(bulkDeleteCommand.execute(args, mockContext)).rejects.toThrow('None of the 2 provided agents IDs were found');
    });

    it('should report partial matches when some IDs are missing', async () => {
        setAgents.mockImplementation((callback: any) => callback(mockContext.workspace.agents));
        setChannels.mockImplementation((callback: any) => callback([]));
        setGroups.mockImplementation((callback: any) => callback([]));
        setMessages.mockImplementation((callback: any) => callback([]));

        const args = { type: 'agents', ids: ['1', 'nonexistent'] };
        const result = await bulkDeleteCommand.execute(args, mockContext);

        expect(result).toContain('Deleted 1 agents');
        expect(result).toContain('1 ID not found');
    });

    it('should clean up channels, groups, and messages when deleting agents', async () => {
        mockContext.workspace.channels = [
            { id: 'c1', from: '1', to: '2' },
            { id: 'c2', from: '2', to: '3' },
        ];
        mockContext.workspace.groups = [
            { id: 'g1', members: ['1', '2', '3'] },
        ];
        mockContext.workspace.messages = [
            { id: 'm1', fromId: '1', toId: '2' },
            { id: 'm2', fromId: '2', toId: '3' },
        ];

        setAgents.mockImplementation((cb: any) => cb(mockContext.workspace.agents));
        setChannels.mockImplementation((cb: any) => cb(mockContext.workspace.channels));
        setGroups.mockImplementation((cb: any) => cb(mockContext.workspace.groups));
        setMessages.mockImplementation((cb: any) => cb(mockContext.workspace.messages));

        const args = { type: 'agents', ids: ['1'] };
        const result = await bulkDeleteCommand.execute(args, mockContext);

        expect(result).toContain('Deleted 1 agents');

        // Verify setChannels filter removed channels involving agent 1
        const channelFilter = setChannels.mock.calls[0][0];
        const remainingChannels = channelFilter(mockContext.workspace.channels);
        expect(remainingChannels).toHaveLength(1);
        expect(remainingChannels[0].id).toBe('c2');

        // Verify setGroups updated membership
        const groupMapper = setGroups.mock.calls[0][0];
        const updatedGroups = groupMapper(mockContext.workspace.groups);
        expect(updatedGroups[0].members).not.toContain('1');
        expect(updatedGroups[0].members).toContain('2');

        // Verify setMessages filter removed messages from agent 1
        const messageFilter = setMessages.mock.calls[0][0];
        const remainingMessages = messageFilter(mockContext.workspace.messages);
        expect(remainingMessages).toHaveLength(1);
        expect(remainingMessages[0].id).toBe('m2');
    });

    it('should delete channels and clean up associated messages', async () => {
        mockContext.workspace.channels = [
            { id: 'c1', from: '1', to: '2' },
            { id: 'c2', from: '2', to: '3' },
        ];
        mockContext.workspace.messages = [
            { id: 'm1', channelId: 'c1' },
            { id: 'm2', channelId: 'c2' },
        ];

        const args = { type: 'channels', ids: ['c1'] };
        const result = await bulkDeleteCommand.execute(args, mockContext);

        expect(result).toContain('Deleted 1 channels');

        const channelFilter = setChannels.mock.calls[0][0];
        expect(channelFilter(mockContext.workspace.channels)).toHaveLength(1);

        const messageFilter = setMessages.mock.calls[0][0];
        expect(messageFilter(mockContext.workspace.messages)).toHaveLength(1);
        expect(messageFilter(mockContext.workspace.messages)[0].id).toBe('m2');
    });
});
