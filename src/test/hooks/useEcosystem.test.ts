import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEcosystem } from '../../hooks/useEcosystem';

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

    it('initializes with empty ecosystems', () => {
        const { result } = renderHook(() => useEcosystem(mockDeps, mockAddJob));
        expect(result.current.ecosystems).toEqual([]);
        expect(result.current.bridges).toEqual([]);
    });

    it('queues save_ecosystem job', () => {
        const { result } = renderHook(() => useEcosystem({ ...mockDeps, agents: [{ id: 'a1' } as any] }, mockAddJob));

        act(() => {
            result.current.setEcoSaveName('Backup');
        });

        act(() => {
            result.current.saveCurrentNetwork();
        });

        expect(mockAddJob).toHaveBeenCalledWith(expect.objectContaining({
            type: 'save_ecosystem',
            request: { name: 'Backup' }
        }));
    });

    it('queues load_ecosystem job', () => {
        const { result } = renderHook(() => useEcosystem(mockDeps, mockAddJob));

        act(() => {
            result.current.loadNetwork('net-1');
        });

        expect(mockAddJob).toHaveBeenCalledWith(expect.objectContaining({
            type: 'load_ecosystem',
            request: { id: 'net-1' }
        }));
        expect(mockDeps.setView).toHaveBeenCalledWith('agents');
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
