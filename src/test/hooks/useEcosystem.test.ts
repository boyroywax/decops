import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEcosystem } from '@/hooks/useEcosystem';

describe('useEcosystem', () => {
    const mockDeps = {
        addLog: vi.fn(),
        agents: [],
        channels: [],
        groups: [],
        messages: [],
        setAgents: vi.fn(),
        setChannels: vi.fn(),
        setGroups: vi.fn(),
        setMessages: vi.fn(),
        setView: vi.fn(),
    };
    const mockAddJob = vi.fn();

    beforeEach(() => {
        window.localStorage.clear();
        vi.clearAllMocks();
    });

    it('initializes with empty networks', () => {
        const { result } = renderHook(() => useEcosystem(mockDeps, mockAddJob));
        expect(result.current.networks).toEqual([]);
        expect(result.current.bridges).toEqual([]);
    });

    it('queues destroy_network job', () => {
        const { result } = renderHook(() => useEcosystem(mockDeps, mockAddJob));

        act(() => {
            result.current.dissolveNetwork('net-1');
        });

        expect(mockAddJob).toHaveBeenCalledWith(expect.objectContaining({
            type: 'destroy_network',
            request: { id: 'net-1' }
        }));
    });

    it('creates bridge via job', () => {
        const { result } = renderHook(() => useEcosystem(mockDeps, mockAddJob));

        act(() => {
            result.current.setBridgeForm({
                fromNet: 'net-1',
                toNet: 'net-2',
                fromAgent: 'a1',
                toAgent: 'a2',
                type: 'data'
            });
        });

        act(() => {
            result.current.createBridge();
        });

        expect(mockAddJob).toHaveBeenCalledWith(expect.objectContaining({
            type: 'create_bridge',
            request: {
                from_network: 'net-1',
                to_network: 'net-2',
                from_agent: 'a1',
                to_agent: 'a2',
                type: 'data'
            }
        }));
    });
});
