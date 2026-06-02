import type { CollectiveMemoryEntry } from "@/services/collectiveMemory";

export const MEMORY_ARCHIVE_KIND = "collective-memory-archive" as const;
export const MEMORY_ARCHIVE_VERSION = "1.0" as const;

export interface CollectiveMemoryArchiveManifest {
  kind: typeof MEMORY_ARCHIVE_KIND;
  version: typeof MEMORY_ARCHIVE_VERSION;
  exportedAt: string;
  workspaceId?: string;
  filters?: {
    query?: string;
    tags?: string[];
    scope?: "workspace" | "global" | "all";
    includeDisabled?: boolean;
    limit?: number;
  };
  summary: {
    count: number;
    activeCount: number;
    disabledCount: number;
  };
  entries: CollectiveMemoryEntry[];
}

export const collectiveMemoryArchiveJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://decops.io/schemas/collective-memory-archive-v1.schema.json",
  title: "CollectiveMemoryArchiveManifest",
  type: "object",
  required: ["kind", "version", "exportedAt", "summary", "entries"],
  additionalProperties: false,
  properties: {
    kind: { const: MEMORY_ARCHIVE_KIND },
    version: { const: MEMORY_ARCHIVE_VERSION },
    exportedAt: { type: "string", format: "date-time" },
    workspaceId: { type: "string" },
    filters: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        scope: { enum: ["workspace", "global", "all"] },
        includeDisabled: { type: "boolean" },
        limit: { type: "number" },
      },
    },
    summary: {
      type: "object",
      required: ["count", "activeCount", "disabledCount"],
      additionalProperties: false,
      properties: {
        count: { type: "number" },
        activeCount: { type: "number" },
        disabledCount: { type: "number" },
      },
    },
    entries: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "content", "tags", "createdAt", "updatedAt", "scope", "importance"],
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          content: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          sourceAgentId: { type: "string" },
          sourceAgentName: { type: "string" },
          workspaceId: { type: "string" },
          conversationId: { type: "string" },
          scope: { enum: ["workspace", "global"] },
          importance: { type: "number" },
          disabled: { type: "boolean" },
          metadata: { type: "object" },
        },
      },
    },
  },
} as const;

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(v => String(v));
}

function asEntry(value: unknown): CollectiveMemoryEntry | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Record<string, unknown>;
  const content = String(entry.content || "").trim();
  if (!content) return null;
  return {
    id: String(entry.id || crypto.randomUUID()),
    content,
    tags: asStringArray(entry.tags),
    createdAt: String(entry.createdAt || new Date().toISOString()),
    updatedAt: String(entry.updatedAt || entry.createdAt || new Date().toISOString()),
    sourceAgentId: entry.sourceAgentId ? String(entry.sourceAgentId) : undefined,
    sourceAgentName: entry.sourceAgentName ? String(entry.sourceAgentName) : undefined,
    workspaceId: entry.workspaceId ? String(entry.workspaceId) : undefined,
    conversationId: entry.conversationId ? String(entry.conversationId) : undefined,
    scope: entry.scope === "global" ? "global" : "workspace",
    importance: typeof entry.importance === "number" ? entry.importance : 3,
    disabled: !!entry.disabled,
    metadata: entry.metadata && typeof entry.metadata === "object"
      ? (entry.metadata as Record<string, unknown>)
      : undefined,
  };
}

function parseArchiveManifest(raw: Record<string, unknown>): CollectiveMemoryArchiveManifest {
  const entries = Array.isArray(raw.entries)
    ? raw.entries.map(asEntry).filter((e): e is CollectiveMemoryEntry => !!e)
    : [];

  const activeCount = entries.filter(e => !e.disabled).length;
  const disabledCount = entries.length - activeCount;

  return {
    kind: MEMORY_ARCHIVE_KIND,
    version: MEMORY_ARCHIVE_VERSION,
    exportedAt: String(raw.exportedAt || new Date().toISOString()),
    workspaceId: raw.workspaceId ? String(raw.workspaceId) : undefined,
    filters: raw.filters && typeof raw.filters === "object"
      ? {
          query: (raw.filters as Record<string, unknown>).query
            ? String((raw.filters as Record<string, unknown>).query)
            : undefined,
          tags: asStringArray((raw.filters as Record<string, unknown>).tags),
          scope: (raw.filters as Record<string, unknown>).scope === "workspace"
            ? "workspace"
            : (raw.filters as Record<string, unknown>).scope === "global"
              ? "global"
              : "all",
          includeDisabled: !!(raw.filters as Record<string, unknown>).includeDisabled,
          limit: typeof (raw.filters as Record<string, unknown>).limit === "number"
            ? Number((raw.filters as Record<string, unknown>).limit)
            : undefined,
        }
      : undefined,
    summary: {
      count: entries.length,
      activeCount,
      disabledCount,
    },
    entries,
  };
}

export function isCollectiveMemoryArchiveManifest(value: unknown): value is CollectiveMemoryArchiveManifest {
  if (!value || typeof value !== "object") return false;
  const raw = value as Record<string, unknown>;
  if (raw.kind !== MEMORY_ARCHIVE_KIND) return false;
  if (raw.version !== MEMORY_ARCHIVE_VERSION) return false;
  if (!Array.isArray(raw.entries)) return false;
  return true;
}

export function parseCollectiveMemoryArchive(
  payload: string | Record<string, unknown>,
): { manifest: CollectiveMemoryArchiveManifest | null; errors: string[] } {
  let parsed: unknown = payload;
  if (typeof payload === "string") {
    try {
      parsed = JSON.parse(payload);
    } catch (err) {
      return { manifest: null, errors: [`invalid_json: ${err instanceof Error ? err.message : String(err)}`] };
    }
  }

  if (!parsed || typeof parsed !== "object") {
    return { manifest: null, errors: ["payload must be a JSON object"] };
  }

  const raw = parsed as Record<string, unknown>;
  if (raw.kind !== MEMORY_ARCHIVE_KIND) {
    return { manifest: null, errors: [`kind must be '${MEMORY_ARCHIVE_KIND}'`] };
  }
  if (raw.version !== MEMORY_ARCHIVE_VERSION) {
    return { manifest: null, errors: [`version must be '${MEMORY_ARCHIVE_VERSION}'`] };
  }
  if (!Array.isArray(raw.entries)) {
    return { manifest: null, errors: ["entries must be an array"] };
  }

  const manifest = parseArchiveManifest(raw);
  return { manifest, errors: [] };
}

export function buildCollectiveMemoryArchiveManifest(input: {
  workspaceId?: string;
  filters?: CollectiveMemoryArchiveManifest["filters"];
  entries: CollectiveMemoryEntry[];
}): CollectiveMemoryArchiveManifest {
  const entries = input.entries;
  const activeCount = entries.filter(e => !e.disabled).length;
  const disabledCount = entries.length - activeCount;

  return {
    kind: MEMORY_ARCHIVE_KIND,
    version: MEMORY_ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    workspaceId: input.workspaceId,
    filters: input.filters,
    summary: {
      count: entries.length,
      activeCount,
      disabledCount,
    },
    entries,
  };
}
