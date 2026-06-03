import type { CollectiveMemoryEntry } from "@/services/collectiveMemory";

export const MEMORY_ARCHIVE_KIND = "v0" as const;
export const MEMORY_ARCHIVE_SCHEMA = "collective-memory" as const;

interface CollectiveMemoryArchiveMetadata {
  annotations?: Record<string, string>;
  labels?: Record<string, string>;
  name: string;
  workspace?: string;
  identity?: Record<string, unknown>;
  timestamps: {
    createdAt: string;
    updatedAt: string;
    exportedAt: string;
  };
}

export interface CollectiveMemoryArchiveManifest {
  kind: typeof MEMORY_ARCHIVE_KIND;
  schema: typeof MEMORY_ARCHIVE_SCHEMA;
  metadata: CollectiveMemoryArchiveMetadata;
  spec: {
    memory: CollectiveMemoryEntry;
  };
}

export const collectiveMemoryArchiveJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://decops.io/schemas/collective-memory-archive-v0.schema.json",
  title: "CollectiveMemoryArchiveManifest",
  type: "object",
  required: ["kind", "schema", "metadata", "spec"],
  additionalProperties: false,
  properties: {
    kind: { const: MEMORY_ARCHIVE_KIND },
    schema: { const: MEMORY_ARCHIVE_SCHEMA },
    metadata: {
      type: "object",
      required: ["name", "timestamps"],
      additionalProperties: false,
      properties: {
        annotations: { type: "object", additionalProperties: { type: "string" } },
        labels: { type: "object", additionalProperties: { type: "string" } },
        name: { type: "string" },
        workspace: { type: "string" },
        identity: { type: "object", additionalProperties: true },
        timestamps: {
          type: "object",
          required: ["createdAt", "updatedAt", "exportedAt"],
          additionalProperties: false,
          properties: {
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
            exportedAt: { type: "string", format: "date-time" },
          },
        },
      },
    },
    spec: {
      type: "object",
      required: ["memory"],
      additionalProperties: false,
      properties: {
        memory: {
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

function parseV0Manifest(raw: Record<string, unknown>): CollectiveMemoryArchiveManifest | null {
  const spec = raw.spec && typeof raw.spec === "object" ? (raw.spec as Record<string, unknown>) : null;
  const memory = spec ? asEntry(spec.memory) : null;
  if (!memory) return null;

  const metadata = raw.metadata && typeof raw.metadata === "object"
    ? (raw.metadata as Record<string, unknown>)
    : {};
  const timestamps = metadata.timestamps && typeof metadata.timestamps === "object"
    ? (metadata.timestamps as Record<string, unknown>)
    : {};

  return {
    kind: MEMORY_ARCHIVE_KIND,
    schema: MEMORY_ARCHIVE_SCHEMA,
    metadata: {
      annotations: metadata.annotations && typeof metadata.annotations === "object"
        ? Object.fromEntries(
            Object.entries(metadata.annotations as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
          )
        : undefined,
      labels: metadata.labels && typeof metadata.labels === "object"
        ? Object.fromEntries(
            Object.entries(metadata.labels as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
          )
        : undefined,
      name: String(metadata.name || `memory-${memory.id.slice(0, 8)}-archive`),
      workspace: metadata.workspace ? String(metadata.workspace) : undefined,
      identity: metadata.identity && typeof metadata.identity === "object"
        ? (metadata.identity as Record<string, unknown>)
        : undefined,
      timestamps: {
        createdAt: String(timestamps.createdAt || memory.createdAt || new Date().toISOString()),
        updatedAt: String(timestamps.updatedAt || memory.updatedAt || memory.createdAt || new Date().toISOString()),
        exportedAt: String(timestamps.exportedAt || new Date().toISOString()),
      },
    },
    spec: { memory },
  };
}

function parseLegacyV1Manifest(raw: Record<string, unknown>): { manifest: CollectiveMemoryArchiveManifest | null; warnings: string[] } {
  const entries = Array.isArray(raw.entries)
    ? raw.entries.map(asEntry).filter((e): e is CollectiveMemoryEntry => !!e)
    : [];
  const warnings: string[] = [];
  const memory = entries[0];
  if (!memory) return { manifest: null, warnings };
  if (entries.length > 1) {
    warnings.push(`legacy_multi_entry_truncated: received ${entries.length} entries; only first entry was converted to v0 spec.memory`);
  }

  const filters = raw.filters && typeof raw.filters === "object"
    ? (raw.filters as Record<string, unknown>)
    : null;

  return {
    warnings,
    manifest: {
    kind: MEMORY_ARCHIVE_KIND,
    schema: MEMORY_ARCHIVE_SCHEMA,
    metadata: {
      annotations: {
        migrated_from: "collective-memory-archive@1.0",
        query: filters?.query ? String(filters.query) : "",
      },
      labels: {
        scope: memory.scope,
      },
      name: `memory-${memory.id.slice(0, 8)}-archive`,
      workspace: raw.workspaceId ? String(raw.workspaceId) : memory.workspaceId,
      identity: {
        sourceAgentId: memory.sourceAgentId,
        sourceAgentName: memory.sourceAgentName,
      },
      timestamps: {
        createdAt: memory.createdAt,
        updatedAt: memory.updatedAt,
        exportedAt: String(raw.exportedAt || new Date().toISOString()),
      },
    },
    spec: { memory },
    },
  };
}

export function isCollectiveMemoryArchiveManifest(value: unknown): value is CollectiveMemoryArchiveManifest {
  if (!value || typeof value !== "object") return false;
  const raw = value as Record<string, unknown>;
  return raw.kind === MEMORY_ARCHIVE_KIND && raw.schema === MEMORY_ARCHIVE_SCHEMA;
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
  if (raw.kind === MEMORY_ARCHIVE_KIND && raw.schema === MEMORY_ARCHIVE_SCHEMA) {
    const manifest = parseV0Manifest(raw);
    if (!manifest) return { manifest: null, errors: ["spec.memory is required and must be a valid memory entry"] };
    return { manifest, errors: [] };
  }

  // Backward compatibility for v1 payloads that used entries[]/summary/filters.
  if (raw.kind === "collective-memory-archive" && raw.version === "1.0") {
    const legacy = parseLegacyV1Manifest(raw);
    if (!legacy.manifest) return { manifest: null, errors: ["legacy entries[] must include at least one valid memory entry"] };
    return { manifest: legacy.manifest, errors: legacy.warnings };
  }

  return { manifest: null, errors: ["unsupported archive kind/schema"] };
}

export function buildCollectiveMemoryArchiveManifest(input: {
  name?: string;
  workspaceId?: string;
  annotations?: Record<string, string>;
  labels?: Record<string, string>;
  identity?: Record<string, unknown>;
  memory: CollectiveMemoryEntry;
}): CollectiveMemoryArchiveManifest {
  const memory = input.memory;
  const exportedAt = new Date().toISOString();

  return {
    kind: MEMORY_ARCHIVE_KIND,
    schema: MEMORY_ARCHIVE_SCHEMA,
    metadata: {
      annotations: input.annotations,
      labels: input.labels,
      name: input.name || `memory-${memory.id.slice(0, 8)}-archive`,
      workspace: input.workspaceId || memory.workspaceId,
      identity: input.identity,
      timestamps: {
        createdAt: memory.createdAt,
        updatedAt: memory.updatedAt,
        exportedAt,
      },
    },
    spec: { memory },
  };
}
