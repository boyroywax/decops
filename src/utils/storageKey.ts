/**
 * Storage-key helpers for cross-step references in job pipelines.
 *
 * The job runtime ($storage.X interpolation in {@link ./jobRuntime.ts}) only
 * accepts keys composed of `[A-Za-z0-9_]`. Network / agent / group names from
 * the AI Architect routinely contain spaces, hyphens, dots, etc., which would
 * silently leave references unresolved (e.g. `$storage.network_My Network`).
 *
 * Use {@link slugifyStorageKey} when generating references in command
 * pipelines, and mirror the same slug when *writing* values into storage.
 */

/**
 * Convert an arbitrary user-supplied label into a safe storage-key suffix.
 *
 * - lowercases
 * - replaces any run of non-`[a-z0-9_]` chars with a single `_`
 * - trims leading/trailing underscores
 * - collapses repeated underscores
 */
export function slugifyStorageKey(input: string): string {
    if (!input) return "";
    return String(input)
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");
}

/** True iff `value` is the literal string form of an unresolved ref. */
export function isUnresolvedRef(value: unknown): boolean {
    return typeof value === "string" && /^\$(storage|deliverable|input)\./.test(value);
}
