import { describe, it, expect } from "vitest";
import { selectBatch, reserveBatch, type QueuedJobLike } from "@/hooks/jobScheduler";

const makeJob = (id: string, status = "queued"): QueuedJobLike => ({ id, status });

describe("selectBatch", () => {
    it("returns empty array when no jobs are queued", () => {
        const inFlight = new Set<string>();
        expect(selectBatch([], { inFlight, maxConcurrent: 4 })).toEqual([]);
    });

    it("returns empty array when paused", () => {
        const inFlight = new Set<string>();
        const jobs = [makeJob("a"), makeJob("b")];
        expect(selectBatch(jobs, { inFlight, maxConcurrent: 4, paused: true })).toEqual([]);
    });

    it("skips jobs that are not 'queued'", () => {
        const inFlight = new Set<string>();
        const jobs = [
            makeJob("a", "running"),
            makeJob("b", "completed"),
            makeJob("c", "queued"),
            makeJob("d", "failed"),
        ];
        const batch = selectBatch(jobs, { inFlight, maxConcurrent: 4 });
        expect(batch.map((j) => j.id)).toEqual(["c"]);
    });

    it("skips jobs already in the in-flight set", () => {
        const inFlight = new Set<string>(["a", "b"]);
        const jobs = [makeJob("a"), makeJob("b"), makeJob("c"), makeJob("d")];
        const batch = selectBatch(jobs, { inFlight, maxConcurrent: 4 });
        expect(batch.map((j) => j.id)).toEqual(["c", "d"]);
    });

    it("caps batch size at the number of available slots", () => {
        const inFlight = new Set<string>(["a", "b"]);
        const jobs = [makeJob("a"), makeJob("b"), makeJob("c"), makeJob("d"), makeJob("e"), makeJob("f")];
        const batch = selectBatch(jobs, { inFlight, maxConcurrent: 4 });
        expect(batch.map((j) => j.id)).toEqual(["c", "d"]); // only 2 slots free
    });

    it("returns empty array when all slots are occupied", () => {
        const inFlight = new Set<string>(["a", "b", "c", "d"]);
        const jobs = [makeJob("e"), makeJob("f")];
        const batch = selectBatch(jobs, { inFlight, maxConcurrent: 4 });
        expect(batch).toEqual([]);
    });

    it("does not mutate the inFlight set", () => {
        const inFlight = new Set<string>(["a"]);
        const jobs = [makeJob("b"), makeJob("c")];
        selectBatch(jobs, { inFlight, maxConcurrent: 4 });
        expect([...inFlight].sort()).toEqual(["a"]);
    });
});

describe("reserveBatch (atomic select + reserve)", () => {
    it("adds every returned job to the in-flight set", () => {
        const inFlight = new Set<string>();
        const jobs = [makeJob("a"), makeJob("b"), makeJob("c")];
        const batch = reserveBatch(jobs, { inFlight, maxConcurrent: 4 });
        expect(batch.map((j) => j.id)).toEqual(["a", "b", "c"]);
        expect([...inFlight].sort()).toEqual(["a", "b", "c"]);
    });

    it("preserves the concurrency invariant across many calls", () => {
        // Simulate the executor: queue 20 jobs, repeatedly reserve while
        // marking some as completing. The in-flight set must NEVER exceed
        // MAX at any point.
        const MAX = 4;
        const inFlight = new Set<string>();
        const jobs: QueuedJobLike[] = Array.from({ length: 20 }, (_, i) => makeJob(`j${i}`));
        const completed = new Set<string>();

        let observedMaxInFlight = 0;
        let safety = 0;
        while (completed.size < jobs.length && safety++ < 100) {
            // Update job statuses based on completion set
            const view = jobs.map((j) =>
                completed.has(j.id) ? { ...j, status: "completed" } : j,
            );

            const batch = reserveBatch(view, { inFlight, maxConcurrent: MAX });
            observedMaxInFlight = Math.max(observedMaxInFlight, inFlight.size);
            expect(inFlight.size).toBeLessThanOrEqual(MAX);

            // "Complete" one in-flight job each iteration to free a slot
            const next = [...inFlight][0];
            if (next) {
                inFlight.delete(next);
                completed.add(next);
            } else if (batch.length === 0) {
                break; // nothing left to do
            }
        }

        expect(observedMaxInFlight).toBeLessThanOrEqual(MAX);
        expect(completed.size).toBe(jobs.length);
    });

    it("never double-reserves a job across rapid successive calls", () => {
        const inFlight = new Set<string>();
        const jobs = [makeJob("a"), makeJob("b"), makeJob("c"), makeJob("d"), makeJob("e")];

        const batch1 = reserveBatch(jobs, { inFlight, maxConcurrent: 4 });
        const batch2 = reserveBatch(jobs, { inFlight, maxConcurrent: 4 });

        const ids1 = new Set(batch1.map((j) => j.id));
        const ids2 = new Set(batch2.map((j) => j.id));
        for (const id of ids2) expect(ids1.has(id)).toBe(false);

        expect(batch1.length).toBe(4);
        expect(batch2.length).toBe(0); // all 4 slots taken
    });

    it("respects pause flag", () => {
        const inFlight = new Set<string>();
        const jobs = [makeJob("a"), makeJob("b")];
        const batch = reserveBatch(jobs, { inFlight, maxConcurrent: 4, paused: true });
        expect(batch).toEqual([]);
        expect(inFlight.size).toBe(0);
    });
});

/**
 * Slot-release lifecycle tests — mirror the fire-and-forget IIFE pattern in
 * useJobExecutor.tsx where each job runs inside `try { … } finally { delete }`.
 *
 * These tests verify the **invariant guarantee** that a reserved slot is
 * released regardless of how the async task exits (normal completion, early
 * return, thrown error). Without this guarantee the executor would leak
 * slots and eventually deadlock with 0 available concurrency.
 */
describe("slot-release lifecycle (mirrors useJobExecutor fire-and-forget IIFE)", () => {
    /** Helper that mirrors the IIFE pattern in useJobExecutor.tsx. */
    async function runWithSlot(
        inFlight: Set<string>,
        jobId: string,
        task: () => Promise<void>,
    ): Promise<void> {
        try {
            await task();
        } catch {
            // swallowed for test — executor reports via updateJobStatus
        } finally {
            inFlight.delete(jobId);
        }
    }

    it("releases slot on normal completion", async () => {
        const inFlight = new Set<string>();
        const jobs = [makeJob("a")];
        const [job] = reserveBatch(jobs, { inFlight, maxConcurrent: 4 });
        expect(inFlight.has(job.id)).toBe(true);

        await runWithSlot(inFlight, job.id, async () => {
            await Promise.resolve();
        });

        expect(inFlight.has(job.id)).toBe(false);
        expect(inFlight.size).toBe(0);
    });

    it("releases slot on early return (e.g. awaiting-input, dry-run)", async () => {
        const inFlight = new Set<string>();
        const [job] = reserveBatch([makeJob("a")], { inFlight, maxConcurrent: 4 });

        await runWithSlot(inFlight, job.id, async () => {
            // Simulate the awaiting-input / dry-run early-return path
            return;
        });

        expect(inFlight.has(job.id)).toBe(false);
    });

    it("releases slot on thrown error", async () => {
        const inFlight = new Set<string>();
        const [job] = reserveBatch([makeJob("a")], { inFlight, maxConcurrent: 4 });

        await runWithSlot(inFlight, job.id, async () => {
            throw new Error("boom");
        });

        expect(inFlight.has(job.id)).toBe(false);
    });

    it("releases slot on async rejection deep in the task", async () => {
        const inFlight = new Set<string>();
        const [job] = reserveBatch([makeJob("a")], { inFlight, maxConcurrent: 4 });

        await runWithSlot(inFlight, job.id, async () => {
            await Promise.resolve();
            await Promise.reject(new Error("step failed"));
        });

        expect(inFlight.has(job.id)).toBe(false);
    });

    it("respects MAX even when many jobs complete out of order", async () => {
        const MAX = 4;
        const inFlight = new Set<string>();
        const queue = Array.from({ length: 12 }, (_, i) => makeJob(`j${i}`));
        let observedMax = 0;

        // Reserve initial batch and start fire-and-forget tasks
        const startBatch = (jobs: QueuedJobLike[]) => {
            const batch = reserveBatch(jobs, { inFlight, maxConcurrent: MAX });
            observedMax = Math.max(observedMax, inFlight.size);
            return Promise.all(
                batch.map((j, idx) =>
                    runWithSlot(inFlight, j.id, async () => {
                        // Stagger completion times to force out-of-order finish
                        await new Promise((r) => setTimeout(r, (idx % 3) + 1));
                        if (idx === 1) throw new Error("simulated failure");
                    }),
                ),
            );
        };

        // Drain the queue in waves — every wave must respect MAX
        let pending = [...queue];
        while (pending.length > 0) {
            const slice = pending.slice(0, MAX);
            pending = pending.slice(slice.length);
            await startBatch(slice);
        }

        expect(observedMax).toBeLessThanOrEqual(MAX);
        expect(inFlight.size).toBe(0); // all slots released
    });

    it("does not leak slot if outer task is cancelled by throwing synchronously inside try", async () => {
        const inFlight = new Set<string>();
        const [job] = reserveBatch([makeJob("a")], { inFlight, maxConcurrent: 4 });

        await runWithSlot(inFlight, job.id, async () => {
            // Synchronous throw inside the async fn — still caught
            throw new Error("sync throw");
        });

        expect(inFlight.has(job.id)).toBe(false);
    });
});
