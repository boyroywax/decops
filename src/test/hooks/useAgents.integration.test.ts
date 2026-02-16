import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAgents } from '../../hooks/useAgents';

// Mock useLocalStorage
vi.mock('../../hooks/useLocalStorage', () => ({
    useLocalStorage: (key: string, initialValue: any) => {
        return [initialValue, vi.fn()];
    }
}));

describe('useAgents Integration', () => {
    it('should call addJob with correct arguments when removeAgents is called', () => {
        const addJobMock = vi.fn();
        const { result } = renderHook(() => useAgents(addJobMock));

        const idsToDelete = new Set(['1', '2', '3']);

        act(() => {
            result.current.removeAgents(idsToDelete);
        });

        expect(addJobMock).toHaveBeenCalledTimes(1);
        expect(addJobMock).toHaveBeenCalledWith({
            type: 'bulk_delete',
            request: {
                type: 'agents',
                ids: ['1', '2', '3']
            }
        });
    });
});
