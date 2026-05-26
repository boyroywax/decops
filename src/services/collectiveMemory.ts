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
