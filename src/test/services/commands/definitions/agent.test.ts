import { describe, it, expect, vi } from 'vitest';
import { createAgentCommand } from '../../../../services/commands/definitions/agent';

describe('createAgentCommand', () => {
    const mockContext = {
        workspace: {
            setAgents: vi.fn(),
            addLog: vi.fn(),
        }
    };

    it('validates name length', async () => {
        // Validation logic is inside args definition
        const validation = createAgentCommand.args.name.validation;
        expect(validation('valid')).toBe(true);
        expect(validation('no')).toBe("Name must be at least 3 characters");
    });

    it('validates role', async () => {
        const validation = createAgentCommand.args.role.validation;
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

        const result = await createAgentCommand.execute(args, mockContext);

        expect(result).toHaveProperty('agentId');
        expect(result).toHaveProperty('did');
        expect(mockContext.workspace.setAgents).toHaveBeenCalled();
        expect(mockContext.workspace.addLog).toHaveBeenCalledWith(expect.stringContaining('Created agent: Test Agent'));
    });
});
