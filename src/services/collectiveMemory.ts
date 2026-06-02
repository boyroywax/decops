export interface CollectiveMemoryEntry {
  id: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  sourceAgentId?: string;
  sourceAgentName?: string;
  workspaceId?: string;
  conversationId?: string;
  scope: "workspace" | "global";
  importance: number;
  /** When true, the entry is excluded from recall/auto-injection but kept in the store. */
  disabled?: boolean;
  metadata?: Record<string, unknown>;
}

interface CollectiveMemoryState {
  version: 1;
  entries: CollectiveMemoryEntry[];
}

interface RememberInput {
  content: string;
  tags?: string[];
  sourceAgentId?: string;
  sourceAgentName?: string;
  workspaceId?: string;
  conversationId?: string;
  scope?: "workspace" | "global";
  importance?: number;
  metadata?: Record<string, unknown>;
}

interface RecallInput {
  query?: string;
  tags?: string[];
  limit?: number;
  workspaceId?: string;
  includeGlobal?: boolean;
}

const STORAGE_KEY = "decops_collective_memory_v1";
const MAX_ENTRIES = 5000;
const FALLBACK_STATE: CollectiveMemoryState = { version: 1, entries: [] };

let inMemoryState: CollectiveMemoryState = { ...FALLBACK_STATE };

function clampImportance(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 3;
  return Math.max(1, Math.min(5, Math.round(value)));
}

function normalizeTags(tags: string[] | undefined): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const t = String(tag || "").trim().toLowerCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function nowIso(): string {
  return new Date().toISOString();
}

function canUseLocalStorage(): boolean {
  return typeof globalThis !== "undefined" && !!globalThis.localStorage;
}

function loadState(): CollectiveMemoryState {
  if (!canUseLocalStorage()) return inMemoryState;
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (!raw) return FALLBACK_STATE;
    const parsed = JSON.parse(raw) as Partial<CollectiveMemoryState>;
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return FALLBACK_STATE;
    return { version: 1, entries: parsed.entries };
  } catch {
    return FALLBACK_STATE;
  }
}

function saveState(state: CollectiveMemoryState): void {
  inMemoryState = state;
  if (!canUseLocalStorage()) return;
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota/errors — keep in-memory fallback alive.
  }
}

function scoreQuery(entry: CollectiveMemoryEntry, queryTerms: string[]): number {
  if (queryTerms.length === 0) return 1;
  const haystack = `${entry.content} ${(entry.tags || []).join(" ")}`.toLowerCase();
  let score = 0;
  for (const term of queryTerms) {
    if (haystack.includes(term)) score += 2;
  }
  score += entry.importance * 0.2;
  return score;
}

function trimState(state: CollectiveMemoryState): CollectiveMemoryState {
  if (state.entries.length <= MAX_ENTRIES) return state;
  const sorted = [...state.entries].sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  return { version: 1, entries: sorted.slice(0, MAX_ENTRIES) };
}

export function rememberCollectiveMemory(input: RememberInput): CollectiveMemoryEntry {
  const content = String(input.content || "").trim();
  if (!content) throw new Error("Memory content is required");

  const state = loadState();
  const ts = nowIso();
  const tags = normalizeTags(input.tags);

  const entry: CollectiveMemoryEntry = {
    id: crypto.randomUUID(),
    content,
    tags,
    createdAt: ts,
    updatedAt: ts,
    sourceAgentId: input.sourceAgentId,
    sourceAgentName: input.sourceAgentName,
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    scope: input.scope || "workspace",
    importance: clampImportance(input.importance),
    metadata: input.metadata,
  };

  const next = trimState({ version: 1, entries: [...state.entries, entry] });
  saveState(next);
  return entry;
}

export function recallCollectiveMemory(input: RecallInput = {}): CollectiveMemoryEntry[] {
  const state = loadState();
  const queryTerms = String(input.query || "")
    .toLowerCase()
    .split(/\s+/)
    .map(s => s.trim())
    .filter(Boolean);
  const tags = normalizeTags(input.tags);
  const workspaceId = input.workspaceId;
  const includeGlobal = input.includeGlobal !== false;
  const limit = Math.max(1, Math.min(50, input.limit ?? 10));

  const filtered = state.entries.filter((entry) => {
    const scopeOk = workspaceId
      ? (entry.scope === "workspace" ? entry.workspaceId === workspaceId : includeGlobal)
      : true;
    if (!scopeOk) return false;

    if (tags.length > 0) {
      const entryTags = new Set(entry.tags || []);
      for (const tag of tags) {
        if (!entryTags.has(tag)) return false;
      }
    }

    if (entry.disabled) return false;

    if (queryTerms.length === 0) return true;
    const haystack = `${entry.content} ${(entry.tags || []).join(" ")}`.toLowerCase();
    return queryTerms.some(t => haystack.includes(t));
  });

  return filtered
    .sort((a, b) => {
      const scoreDelta = scoreQuery(b, queryTerms) - scoreQuery(a, queryTerms);
      if (scoreDelta !== 0) return scoreDelta;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    })
    .slice(0, limit);
}

export function listCollectiveMemory(limit = 20, workspaceId?: string): CollectiveMemoryEntry[] {
  return recallCollectiveMemory({ limit, workspaceId, includeGlobal: true });
}

/**
 * List every entry (including disabled ones) for UI display.
 * Sorted by most-recently-updated first.
 */
export function listAllCollectiveMemory(workspaceId?: string): CollectiveMemoryEntry[] {
  const state = loadState();
  const filtered = state.entries
    .map((entry, idx) => ({ entry, idx }))
    .filter(({ entry }) => {
      if (!workspaceId) return true;
      if (entry.scope === "global") return true;
      return entry.workspaceId === workspaceId;
    });
  // Sort newest-first by updatedAt; on tie (same-ms insertion), the later-
  // inserted entry wins so test ordering and UI insertion order match.
  return filtered
    .sort((a, b) => {
      const delta =
        new Date(b.entry.updatedAt).getTime() - new Date(a.entry.updatedAt).getTime();
      if (delta !== 0) return delta;
      return b.idx - a.idx;
    })
    .map(({ entry }) => entry);
}

/** Enable or disable a memory entry without deleting it. */
interface UpdateCollectiveMemoryInput {
  content?: string;
  tags?: string[];
  importance?: number;
  scope?: "workspace" | "global";
  workspaceId?: string;
  disabled?: boolean;
}

export interface ImportCollectiveMemoryOptions {
  mode?: "upsert" | "skip-existing";
}

export interface ImportCollectiveMemoryResult {
  imported: number;
  updated: number;
  skipped: number;
  total: number;
}

function normalizeImportedEntry(entry: CollectiveMemoryEntry): CollectiveMemoryEntry | null {
  const content = String(entry.content || "").trim();
  if (!content) return null;
  const scope = entry.scope === "global" ? "global" : "workspace";
  const createdAt = Number.isNaN(new Date(entry.createdAt).getTime()) ? nowIso() : entry.createdAt;
  const updatedAt = Number.isNaN(new Date(entry.updatedAt).getTime()) ? createdAt : entry.updatedAt;

  return {
    id: String(entry.id || crypto.randomUUID()),
    content,
    tags: normalizeTags(entry.tags),
    createdAt,
    updatedAt,
    sourceAgentId: entry.sourceAgentId,
    sourceAgentName: entry.sourceAgentName,
    workspaceId: entry.workspaceId,
    conversationId: entry.conversationId,
    scope,
    importance: clampImportance(entry.importance),
    disabled: !!entry.disabled,
    metadata: entry.metadata,
  };
}

export function updateCollectiveMemory(
  id: string,
  patch: UpdateCollectiveMemoryInput,
): CollectiveMemoryEntry | null {
  const state = loadState();
  let updated: CollectiveMemoryEntry | null = null;
  const nextEntries = state.entries.map(e => {
    if (e.id !== id) return e;
    const next: CollectiveMemoryEntry = { ...e, updatedAt: nowIso() };
    if (patch.content !== undefined) next.content = patch.content;
    if (patch.tags !== undefined) next.tags = normalizeTags(patch.tags);
    if (patch.importance !== undefined) next.importance = clampImportance(patch.importance);
    if (patch.scope !== undefined) next.scope = patch.scope;
    if (patch.workspaceId !== undefined) next.workspaceId = patch.workspaceId || undefined;
    if (patch.disabled !== undefined) next.disabled = patch.disabled;
    updated = next;
    return next;
  });
  if (!updated) return null;
  saveState({ version: 1, entries: nextEntries });
  return updated;
}

export function importCollectiveMemoryEntries(
  entries: CollectiveMemoryEntry[],
  options: ImportCollectiveMemoryOptions = {},
): ImportCollectiveMemoryResult {
  const mode = options.mode === "skip-existing" ? "skip-existing" : "upsert";
  const state = loadState();
  const byId = new Map<string, CollectiveMemoryEntry>(state.entries.map(e => [e.id, e]));
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const candidate of entries) {
    const normalized = normalizeImportedEntry(candidate);
    if (!normalized) {
      skipped += 1;
      continue;
    }

    const exists = byId.has(normalized.id);
    if (exists && mode === "skip-existing") {
      skipped += 1;
      continue;
    }

    byId.set(normalized.id, normalized);
    if (exists) updated += 1;
    else imported += 1;
  }

  saveState(trimState({ version: 1, entries: Array.from(byId.values()) }));

  return {
    imported,
    updated,
    skipped,
    total: imported + updated + skipped,
  };
}

export function setCollectiveMemoryDisabled(id: string, disabled: boolean): CollectiveMemoryEntry | null {
  const state = loadState();
  let updated: CollectiveMemoryEntry | null = null;
  const nextEntries = state.entries.map(e => {
    if (e.id !== id) return e;
    updated = { ...e, disabled, updatedAt: nowIso() };
    return updated;
  });
  if (!updated) return null;
  saveState({ version: 1, entries: nextEntries });
  return updated;
}

export function forgetCollectiveMemory(id: string): boolean {
  const state = loadState();
  const nextEntries = state.entries.filter(e => e.id !== id);
  if (nextEntries.length === state.entries.length) return false;
  saveState({ version: 1, entries: nextEntries });
  return true;
}

export function clearCollectiveMemory(): void {
  saveState(FALLBACK_STATE);
}
