import type {
  CollectiveMemoryEntry,
  ImportCollectiveMemoryOptions,
  ImportCollectiveMemoryResult,
} from "@/services/collectiveMemory";
import { importCollectiveMemoryEntries } from "@/services/collectiveMemory";
import {
  buildCollectiveMemoryArchiveManifest,
  parseCollectiveMemoryArchive,
  type CollectiveMemoryArchiveManifest,
} from "@/services/collectiveMemoryArchive";
import type { JobArtifact } from "@/types";

interface BuildArchiveArtifactFromManifestInput {
  manifest: CollectiveMemoryArchiveManifest;
  name?: string;
  tags?: string[];
  description?: string;
  source?: JobArtifact["source"];
}

interface BuildArchiveArtifactFromMemoryInput {
  memory: CollectiveMemoryEntry;
  workspaceId?: string;
  name?: string;
  annotations?: Record<string, string>;
  labels?: Record<string, string>;
  identity?: Record<string, unknown>;
  tags?: string[];
  description?: string;
  source?: JobArtifact["source"];
}

interface ImportArchivePayloadInput {
  payload: string | Record<string, unknown> | CollectiveMemoryArchiveManifest;
  mode?: ImportCollectiveMemoryOptions["mode"];
}

interface ImportArchivePayloadSuccess {
  success: true;
  manifest: CollectiveMemoryArchiveManifest;
  warnings: string[];
  result: ImportCollectiveMemoryResult;
}

interface ImportArchivePayloadFailure {
  success: false;
  errors: string[];
}

function normalizeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.filter(Boolean)));
}

export function buildCollectiveMemoryArchiveArtifactFromManifest(
  input: BuildArchiveArtifactFromManifestInput,
): { manifest: CollectiveMemoryArchiveManifest; artifact: JobArtifact } {
  const memory = input.manifest.spec.memory;
  const artifactName = input.name || `${input.manifest.metadata.name}.json`;
  const artifact: JobArtifact = {
    id: crypto.randomUUID(),
    name: artifactName,
    type: "json",
    content: JSON.stringify(input.manifest, null, 2),
    tags: normalizeTags([
      "type:json",
      "memory:archive",
      "memory:collective",
      `memory:id:${memory.id}`,
      `scope:${memory.scope}`,
      ...(input.tags || []),
    ]),
    createdAt: Date.now(),
    description: input.description || `Collective memory archive for ${memory.id.slice(0, 8)}…`,
    source: input.source || "command",
  };
  return { manifest: input.manifest, artifact };
}

export function buildCollectiveMemoryArchiveArtifactFromMemory(
  input: BuildArchiveArtifactFromMemoryInput,
): { manifest: CollectiveMemoryArchiveManifest; artifact: JobArtifact } {
  const artifactName = input.name || `memory-${input.memory.id.slice(0, 8)}-archive.json`;
  const manifest = buildCollectiveMemoryArchiveManifest({
    name: artifactName.replace(/\.json$/i, ""),
    workspaceId: input.workspaceId,
    annotations: input.annotations,
    labels: {
      ...(input.labels || {}),
      scope: input.memory.scope,
    },
    identity: input.identity,
    memory: input.memory,
  });

  return buildCollectiveMemoryArchiveArtifactFromManifest({
    manifest,
    name: artifactName,
    tags: input.tags,
    description: input.description,
    source: input.source,
  });
}

export function importCollectiveMemoryArchivePayload(
  input: ImportArchivePayloadInput,
): ImportArchivePayloadSuccess | ImportArchivePayloadFailure {
  const payload = typeof input.payload === "string"
    ? input.payload
    : (input.payload as Record<string, unknown>);
  const parsed = parseCollectiveMemoryArchive(payload);
  if (!parsed.manifest) {
    return { success: false, errors: parsed.errors };
  }

  const result = importCollectiveMemoryEntries([parsed.manifest.spec.memory], { mode: input.mode });
  return {
    success: true,
    manifest: parsed.manifest,
    warnings: parsed.errors,
    result,
  };
}
