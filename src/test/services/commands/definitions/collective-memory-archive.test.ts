import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommandContext } from "@/services/commands/types";
import { collectiveMemoryCommands } from "@/services/commands/definitions/collective-memory";
import {
  clearCollectiveMemory,
  listAllCollectiveMemory,
  rememberCollectiveMemory,
} from "@/services/collectiveMemory";
import {
  buildCollectiveMemoryArchiveManifest,
  MEMORY_ARCHIVE_KIND,
} from "@/services/collectiveMemoryArchive";

describe("Collective memory archive commands", () => {
  let context: CommandContext;
  let mockArtifacts: any[];

  beforeEach(() => {
    clearCollectiveMemory();
    mockArtifacts = [];

    context = {
      workspace: {
        addLog: vi.fn(),
      } as any,
      jobs: {
        importArtifact: vi.fn((artifact) => mockArtifacts.push(artifact)),
        get allArtifacts() {
          return mockArtifacts;
        },
      } as any,
      storage: {},
      addDeliverable: vi.fn(),
      workspaceManager: {
        currentId: "ws-1",
      } as any,
    } as unknown as CommandContext;
  });

  it("archives memories into a JSON artifact manifest", async () => {
    rememberCollectiveMemory({
      content: "Use schema version 2 for export jobs",
      tags: ["export", "schema"],
      scope: "workspace",
      workspaceId: "ws-1",
      importance: 4,
      sourceAgentName: "User",
    });

    const cmd = collectiveMemoryCommands.find(c => c.id === "archive_collective_memory");
    expect(cmd).toBeDefined();

    const result = await cmd!.execute({ name: "memory-archive.json", includeDisabled: true }, context);
    expect(result.success).toBe(true);
    expect(result.summary.count).toBe(1);
    expect(mockArtifacts).toHaveLength(1);

    const artifactPayload = JSON.parse(mockArtifacts[0].content);
    expect(artifactPayload.kind).toBe(MEMORY_ARCHIVE_KIND);
    expect(Array.isArray(artifactPayload.entries)).toBe(true);
    expect(artifactPayload.entries[0].content).toContain("schema version 2");
  });

  it("imports only artifacts matching memory archive manifest", async () => {
    const manifest = buildCollectiveMemoryArchiveManifest({
      workspaceId: "ws-1",
      entries: [
        {
          id: "mem-import-1",
          content: "Imported memory from artifact",
          tags: ["imported", "artifact"],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          scope: "workspace",
          workspaceId: "ws-1",
          importance: 3,
          disabled: false,
        },
      ],
    });

    mockArtifacts.push(
      {
        id: "artifact-valid",
        name: "valid-memory-archive.json",
        type: "json",
        tags: ["memory:archive"],
        content: JSON.stringify(manifest),
        createdAt: Date.now(),
      },
      {
        id: "artifact-invalid",
        name: "not-memory-archive.json",
        type: "json",
        tags: ["memory:archive"],
        content: JSON.stringify({ kind: "artifact-export", version: "1.0", entries: [] }),
        createdAt: Date.now() - 1000,
      },
    );

    const cmd = collectiveMemoryCommands.find(c => c.id === "import_collective_memory_archive");
    expect(cmd).toBeDefined();

    const result = await cmd!.execute({ tag: "memory:archive", mode: "upsert" }, context);
    expect(result.success).toBe(true);
    expect(result.artifactsScanned).toBe(2);
    expect(result.artifactsImported).toBe(1);
    expect(result.imported).toBe(1);
    expect(result.invalidArtifacts).toHaveLength(1);

    const entries = listAllCollectiveMemory("ws-1");
    expect(entries.some(e => e.id === "mem-import-1")).toBe(true);
  });
});
