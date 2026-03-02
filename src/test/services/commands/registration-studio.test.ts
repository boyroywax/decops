/**
 * Verify that the newly added studio commands are properly registered
 * in the command registry via initializeRegistry.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { registry } from '../../../services/commands/registry';
import { initializeRegistry } from '../../../services/commands/init';

describe('Studio Command Registration', () => {
    beforeAll(() => {
        // initializeRegistry is idempotent — safe to call multiple times
        initializeRegistry();
    });

    const expectedIds = [
        'studio_add_parallel_group',
        'studio_add_trigger',
        'studio_remove_trigger',
    ];

    expectedIds.forEach(id => {
        it(`registers "${id}" command`, () => {
            const cmd = registry.get(id);
            expect(cmd).toBeDefined();
            expect(cmd!.id).toBe(id);
        });
    });

    it('studio_add_parallel_group has no required args', () => {
        const cmd = registry.get('studio_add_parallel_group')!;
        const requiredArgs = Object.values(cmd.args).filter(a => a.required);
        expect(requiredArgs).toHaveLength(0);
    });

    it('studio_add_trigger requires event arg', () => {
        const cmd = registry.get('studio_add_trigger')!;
        expect(cmd.args.event).toBeDefined();
        expect(cmd.args.event.required).toBe(true);
    });

    it('studio_remove_trigger requires triggerId arg', () => {
        const cmd = registry.get('studio_remove_trigger')!;
        expect(cmd.args.triggerId).toBeDefined();
        expect(cmd.args.triggerId.required).toBe(true);
    });
});
