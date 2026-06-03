import { beforeEach, describe, expect, it } from "vitest";
import { clearCollectiveMemory, listAllCollectiveMemory } from "@/services/collectiveMemory";
import {
  buildCollectiveMemoryArchiveArtifactFromManifest,
  buildCollectiveMemoryArchiveArtifactFromMemory,
  importCollectiveMemoryArchivePayload,
} from "@/services/collectiveMemoryArchiveWorkflow";
import { buildCollectiveMemoryArchiveManifest } from "@/services/collectiveMemoryArchive";

beforeEach(() => {
  clearCollectiveMemory();
  if (typeof globalThis.localStorage !== "undefined") {
    globalThis.localStorage.clear();
  }
});

describe("collectiveMemoryArchiveWorkflow", () => {
  it("buildCollectiveMemoryArchiveArtifactFromMemory enforces memory scope in labels and tags", () => {
    const createdAt = new Date().toISOString();
    const { manifest, artifact } = buildCollectiveMemoryArchiveArtifactFromMemory({
      name: "memory-test.json",
      workspaceId: "ws-1",
      labels: { scope: "all", source: "test" },
      tags: ["scope:all", "custom:tag", "custom:tag"],
      memory: {
        id: "mem-1",
        content: "Scope consistency test",
        tags: ["qa"],
        createdAt,
        updatedAt: createdAt,
        scope: "workspace",
        workspaceId: "ws-1",
        importance: 3,
        disabled: false,
      },
    });

    expect(manifest.metadata.labels?.scope).toBe("workspace");
    expect(artifact.tags).toContain("scope:workspace");
    expect(artifact.tags).toContain("scope:all");
    expect(artifact.tags?.filter((t) => t === "custom:tag")).toHaveLength(1);
  });

  it("buildCollectiveMemoryArchiveArtifactFromManifest applies default tag set", () => {
    const createdAt = new Date().toISOString();
    const manifest = buildCollectiveMemoryArchiveManifest({
      name: "manifest-defaults",
      memory: {
        id: "mem-2",
        content: "Default tags test",
        tags: ["defaults"],
        createdAt,
        updatedAt: createdAt,
        scope: "global",
        importance: 4,
      },
    });

    const { artifact } = buildCollectiveMemoryArchiveArtifactFromManifest({ manifest });

    expect(artifact.name).toBe("manifest-defaults.json");
    expect(artifact.tags).toContain("type:json");
    expect(artifact.tags).toContain("memory:archive");
    expect(artifact.tags).toContain("memory:collective");
    expect(artifact.tags).toContain("memory:id:mem-2");
    expect(artifact.tags).toContain("scope:global");
  });

  it("importCollectiveMemoryArchivePayload returns legacy truncation warnings", () => {
    const createdAt = new Date().toISOString();
    const legacyPayload = {
      kind: "collective-memory-archive",
      version: "1.0",
      workspaceId: "ws-1",
      entries: [
        {
          id: "legacy-1",
          content: "first memory",
          tags: ["legacy"],
          createdAt,
          updatedAt: createdAt,
          scope: "workspace",
          workspaceId: "ws-1",
          importance: 2,
        },
        {
          id: "legacy-2",
          content: "second memory",
          tags: ["legacy"],
          createdAt,
          updatedAt: createdAt,
          scope: "workspace",
          workspaceId: "ws-1",
          importance: 3,
        },
      ],
    };

    const result = importCollectiveMemoryArchivePayload({ payload: legacyPayload, mode: "upsert" });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.result.imported).toBe(1);
    expect(result.warnings.some((w) => w.includes("legacy_multi_entry_truncated"))).toBe(true);

    const entries = listAllCollectiveMemory("ws-1");
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe("legacy-1");
  });
});
