import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useJobs } from '../../hooks/useJobs';

describe('useJobs', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it('initializes with empty jobs', () => {
        const { result } = renderHook(() => useJobs());
        expect(result.current.jobs).toEqual([]);
    });

    it('adds a job', () => {
        const { result } = renderHook(() => useJobs());

        act(() => {
            result.current.addJob({ type: 'test', request: { foo: 'bar' } });
        });

        expect(result.current.jobs).toHaveLength(1);
        expect(result.current.jobs[0]).toMatchObject({
            status: 'queued',
            type: 'test',
            request: { foo: 'bar' }
        });
        expect(result.current.jobs[0].id).toBeDefined();
    });

    it('updates job status', () => {
        const { result } = renderHook(() => useJobs());

        act(() => {
            result.current.addJob({ type: 'test', request: {} });
        });

        const jobId = result.current.jobs[0].id;

        act(() => {
            result.current.updateJobStatus(jobId, 'running');
        });

        expect(result.current.jobs[0].status).toBe('running');

        act(() => {
            result.current.updateJobStatus(jobId, 'completed', 'Success');
        });

        expect(result.current.jobs[0].status).toBe('completed');
        expect(result.current.jobs[0].result).toBe('Success');
    });

    it('clears jobs', () => {
        const { result } = renderHook(() => useJobs());

        act(() => {
            result.current.addJob({ type: 'test', request: {} });
            result.current.clearJobs();
        });

        expect(result.current.jobs).toHaveLength(0);
    });

    it('pauses and unpauses queue', () => {
        const { result } = renderHook(() => useJobs());
        expect(result.current.isPaused).toBe(false);

        act(() => {
            result.current.toggleQueuePause();
        });
        expect(result.current.isPaused).toBe(true);

        act(() => {
            result.current.toggleQueuePause();
        });
        expect(result.current.isPaused).toBe(false);
    });
    it('manages artifacts', () => {
        const { result } = renderHook(() => useJobs());
        const artifact = { id: 'art-1', name: 'Test', type: 'markdown', content: 'content', createdAt: Date.now() } as const;

        // Add Job
        act(() => {
            result.current.addJob({ type: 'test', request: {} });
        });
        const jobId = result.current.jobs[0].id;

        // Add Artifact to Job
        act(() => {
            result.current.addArtifact(jobId, artifact);
        });
        expect(result.current.jobs[0].artifacts).toHaveLength(1);
        expect(result.current.allArtifacts).toHaveLength(1);

        // Import Standalone Artifact
        const artifact2 = { ...artifact, id: 'art-2' };
        act(() => {
            result.current.importArtifact(artifact2);
        });
        expect(result.current.allArtifacts).toHaveLength(2);

        // Remove Artifact
        act(() => {
            result.current.removeArtifact('art-1');
        });
        expect(result.current.allArtifacts).toHaveLength(1);
        expect(result.current.jobs[0].artifacts).toHaveLength(0);
    });
});
