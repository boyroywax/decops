/**
 * artifactRefs — Detect and parse artifact references in text.
 *
 * Supports two patterns:
 *   1. Explicit: [[artifact:UUID]] or [[artifact:UUID|Display Name]]
 *   2. Implicit: Any UUID substring that matches a known artifact ID
 *
 * Returns structured refs that can be rendered as clickable chips.
 */

import type { JobArtifact } from "@/types";

export interface ArtifactRef {
  /** The artifact's UUID */
  id: string;
  /** Human-readable label (artifact name or inline label override) */
  label: string;
  /** The artifact type (markdown, json, etc.) */
  type: string;
  /** Start index in the original text */
  start: number;
  /** End index in the original text (exclusive) */
  end: number;
}

// Standard UUID v4 pattern
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

// Explicit reference: [[artifact:UUID]] or [[artifact:UUID|label]]
const EXPLICIT_RE = /\[\[artifact:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\|([^\]]+))?\]\]/gi;

/**
 * Extract artifact references from a text string.
 *
 * @param text — message content or response text
 * @param knownArtifacts — map of artifact ID → artifact (for implicit matching)
 * @returns deduplicated, sorted list of ArtifactRef objects
 */
export function extractArtifactRefs(
  text: string,
  knownArtifacts: Map<string, JobArtifact>,
): ArtifactRef[] {
  const refs: ArtifactRef[] = [];
  const seenRanges = new Set<string>();

  // 1. Explicit references first (higher priority)
  let match: RegExpExecArray | null;
  const explicitRe = new RegExp(EXPLICIT_RE.source, "gi");
  while ((match = explicitRe.exec(text)) !== null) {
    const id = match[1].toLowerCase();
    const art = knownArtifacts.get(id);
    const label = match[2] || art?.name || id.slice(0, 8);
    const rangeKey = `${match.index}:${match.index + match[0].length}`;
    if (!seenRanges.has(rangeKey)) {
      seenRanges.add(rangeKey);
      refs.push({
        id,
        label,
        type: art?.type || "unknown",
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  // 2. Implicit: bare UUIDs that match known artifacts
  const implicitRe = new RegExp(UUID_RE.source, "gi");
  while ((match = implicitRe.exec(text)) !== null) {
    const id = match[0].toLowerCase();
    const art = knownArtifacts.get(id);
    if (!art) continue; // Only match known artifacts

    // Skip if this range overlaps an explicit ref
    const rangeKey = `${match.index}:${match.index + match[0].length}`;
    const overlaps = refs.some(
      (r) => match!.index >= r.start && match!.index < r.end,
    );
    if (overlaps || seenRanges.has(rangeKey)) continue;

    seenRanges.add(rangeKey);
    refs.push({
      id,
      label: art.name,
      type: art.type,
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  // Sort by position
  refs.sort((a, b) => a.start - b.start);
  return refs;
}

/**
 * Build a lookup map from an artifact array.
 */
export function buildArtifactMap(
  artifacts: JobArtifact[],
): Map<string, JobArtifact> {
  const map = new Map<string, JobArtifact>();
  for (const a of artifacts) {
    map.set(a.id.toLowerCase(), a);
  }
  return map;
}
