/**
 * Job scheduling primitives — pure, side-effect-free helpers extracted
 * from `useJobExecutor` so they can be unit-tested in isolation.
 *
 * The scheduler is responsible for the single critical concurrency
 * invariant of the job queue: **no more than `maxConcurrent` jobs may
 * be in-flight at any moment**.
 *
 * Atomicity is guaranteed by the synchronous nature of these helpers
 * combined with JavaScript's single-threaded execution model: the
 * caller reads the in-flight set, computes a batch, and adds every
 * selected id to the set — all without yielding to the event loop.
 */

export interface QueuedJobLike {
    id: string;
    status: string;
}

export interface SelectBatchOptions {
    /** Current set of in-flight job ids. Mutated in place by `reserveBatch`. */
    inFlight: Set<string>;
    /** Maximum number of concurrently-executing jobs (>= 1). */
    maxConcurrent: number;
    /** True when the queue is paused — selection returns []. */
    paused?: boolean;
}

/**
 * Pure selector: returns the list of jobs that should be started next,
 * given the current queue and the set of already-running ids.
 *
 * Does NOT mutate any inputs.
 */
export function selectBatch<J extends QueuedJobLike>(
    jobs: J[],
    options: SelectBatchOptions,
): J[] {
    const { inFlight, maxConcurrent, paused } = options;
    if (paused) return [];

    const slotsAvailable = Math.max(0, maxConcurrent - inFlight.size);
    if (slotsAvailable === 0) return [];

    const candidates: J[] = [];
    for (const job of jobs) {
        if (job.status !== "queued") continue;
        if (inFlight.has(job.id)) continue;
        candidates.push(job);
        if (candidates.length >= slotsAvailable) break;
    }
    return candidates;
}

/**
 * Atomically reserves slots for a batch by mutating `inFlight` in place,
 * then returns the batch. Combines `selectBatch` + reservation in one
 * synchronous step so callers cannot accidentally interleave a read with
 * the reservation.
 *
 * MUST be called synchronously (no `await` between read and reserve).
 */
export function reserveBatch<J extends QueuedJobLike>(
    jobs: J[],
    options: SelectBatchOptions,
): J[] {
    const batch = selectBatch(jobs, options);
    for (const job of batch) options.inFlight.add(job.id);
    return batch;
}
