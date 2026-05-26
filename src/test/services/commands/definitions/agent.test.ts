import { describe, it, expect, vi } from 'vitest';
import { createAgentCommand } from '@/services/commands/definitions/agent';

describe('createAgentCommand', () => {
    let agents: any[] = [];
    const mockContext = {
        workspace: {
            setAgents: vi.fn((updater: (prev: any[]) => any[]) => {
                agents = updater(agents);
            }),
            addLog: vi.fn(),
        },
        storage: {} as Record<string, any>,
    };

    it('validates name length', async () => {
        // Validation logic is inside args definition
        const validation = createAgentCommand.args.name.validation!;
        expect(validation('valid')).toBe(true);
        expect(validation('no')).toBe("Name must be at least 3 characters");
    });

    it('validates role', async () => {
        const validation = createAgentCommand.args.role.validation!;
        expect(validation('researcher')).toBe(true); // Assuming 'researcher' is in ROLES
        // We'd need to import ROLES or mock consistent behavior. 
        // ROLES are constants, so importing them in test is fine.
    });

    it('executes successfully', async () => {
        const args = {
            name: 'Test Agent',
            role: 'researcher',
            prompt: 'Test prompt'
        };

        agents = [];
        mockContext.workspace.setAgents.mockClear();
        mockContext.workspace.addLog.mockClear();

        const result = await createAgentCommand.execute(args, mockContext as any);

        expect(result).toHaveProperty('agentId');
        expect(result).toHaveProperty('did');
        expect(mockContext.workspace.setAgents).toHaveBeenCalled();
        expect(mockContext.workspace.addLog).toHaveBeenCalledWith(expect.stringContaining('Test Agent'));
    });

    it('defaults to collective memory mode for new agents', async () => {
        const args = {
            name: 'Collective Agent',
            role: 'researcher',
            prompt: 'Test prompt'
        };

        agents = [];
        mockContext.workspace.setAgents.mockClear();

        await createAgentCommand.execute(args, mockContext as any);

        expect(agents).toHaveLength(1);
        expect(agents[0].isDarkAgent).toBe(false);
        expect(agents[0].toolkits).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ toolkitId: 'collective-memory' }),
            ]),
        );
    });

    it('creates dark agents without collective-memory toolkit when darkAgent=true', async () => {
        const args = {
            name: 'Dark Agent',
            role: 'researcher',
            prompt: 'Test prompt',
            darkAgent: true,
        };

        agents = [];
        mockContext.workspace.setAgents.mockClear();

        await createAgentCommand.execute(args, mockContext as any);

        expect(agents).toHaveLength(1);
        expect(agents[0].isDarkAgent).toBe(true);
        expect(agents[0].toolkits).toEqual([]);
    });
});
