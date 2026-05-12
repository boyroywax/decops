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
