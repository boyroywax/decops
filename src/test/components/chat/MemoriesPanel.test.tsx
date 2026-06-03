import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoriesPanel } from "@/components/chat/MemoriesPanel";
import { clearCollectiveMemory } from "@/services/collectiveMemory";
import { buildCollectiveMemoryArchiveManifest } from "@/services/collectiveMemoryArchive";
import type { JobArtifact } from "@/types";

const importArtifactMock = vi.fn();
let mockArtifacts: JobArtifact[] = [];

vi.mock("@/context/JobsContext", () => ({
  useJobsContext: () => ({
    importArtifact: importArtifactMock,
    allArtifacts: mockArtifacts,
  }),
}));

beforeEach(() => {
  importArtifactMock.mockReset();
  clearCollectiveMemory();
  if (typeof globalThis.localStorage !== "undefined") {
    globalThis.localStorage.clear();
  }

  const now = new Date().toISOString();
  const manifest = buildCollectiveMemoryArchiveManifest({
    name: "memory-import-test",
    workspaceId: "ws-test",
    memory: {
      id: "mem-ui-import-1",
      content: "Imported from artifact modal flow",
      tags: ["ui", "import"],
      createdAt: now,
      updatedAt: now,
      scope: "workspace",
      workspaceId: "ws-test",
      importance: 3,
      disabled: false,
    },
  });

  mockArtifacts = [
    {
      id: "artifact-ui-1",
      name: "memory-import-test.json",
      type: "json",
      content: JSON.stringify(manifest),
      tags: ["type:json", "memory:archive"],
      createdAt: Date.now(),
      source: "command",
    },
  ];
});

describe("MemoriesPanel import UX", () => {
  it("keeps add modal open and shows import summary after artifact import", async () => {
    render(<MemoriesPanel workspaceId="ws-test" />);

    fireEvent.click(screen.getByTestId("memory-add-card"));
    fireEvent.click(screen.getByRole("button", { name: "Import Artifact" }));

    const select = screen.getAllByRole("combobox")[0];
    fireEvent.change(select, { target: { value: "artifact-ui-1" } });

    fireEvent.click(screen.getByRole("button", { name: "Import Archive" }));

    await waitFor(() => {
      expect(screen.getByText(/Imported 1, updated 0, skipped 0\./)).toBeInTheDocument();
    });

    expect(screen.getByText("Add Memory")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(importArtifactMock).toHaveBeenCalledTimes(1);
  });
});
