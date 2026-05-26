import { describe, it, expect } from "vitest";
import { buildWorkspaceSystemPrompt } from "@/services/ai/prompts";
import type { WorkspaceContext } from "@/services/ai/prompts";
import type { CollectiveMemoryEntry } from "@/services/collectiveMemory";

function emptyCtx(): WorkspaceContext {
    return {
        agents: [],
        channels: [],
        groups: [],
        messages: [],
        networks: [],
        bridges: [],
        jobs: [],
    };
}

function entry(partial: Partial<CollectiveMemoryEntry>): CollectiveMemoryEntry {
    const now = new Date().toISOString();
    return {
        id: "1111-aaaa-bbbb-cccc",
        content: "default content",
        tags: [],
        createdAt: now,
        updatedAt: now,
        scope: "workspace",
        importance: 3,
        ...partial,
    };
}

describe("buildWorkspaceSystemPrompt — memory section", () => {
    it("teaches the LLM how to use collective memory tools", () => {
        const prompt = buildWorkspaceSystemPrompt(emptyCtx());
        expect(prompt).toMatch(/COLLECTIVE MEMORY/);
        expect(prompt).toMatch(/remember_collective_memory/);
        expect(prompt).toMatch(/recall_collective_memory/);
        expect(prompt).toMatch(/list_collective_memory/);
        expect(prompt).toMatch(/forget_collective_memory/);
        expect(prompt).toMatch(/set_agent_memory_mode/);
        expect(prompt).toMatch(/When to remember/);
        expect(prompt).toMatch(/When to recall/);
    });

    it("renders an empty memory section when no entries are recalled", () => {
        const prompt = buildWorkspaceSystemPrompt(emptyCtx(), { recalledMemory: [] });
        expect(prompt).toMatch(/RELEVANT PRIOR MEMORY: \(none auto-recalled/);
    });

    it("injects recalled memory entries with id prefix, importance, tags, and content", () => {
        const entries = [
            entry({
                id: "abcdef12-3456-7890-abcd-ef0123456789",
                content: "User prefers Polygon as the default ledger.",
                tags: ["preference", "ledger"],
                importance: 5,
                sourceAgentName: "Architect",
            }),
            entry({
                id: "fedcba98-7654-3210-fedc-ba9876543210",
                content: "Bridge node label convention: bridge-<src>-<dst>.",
                tags: ["naming"],
                importance: 4,
            }),
        ];
        const prompt = buildWorkspaceSystemPrompt(emptyCtx(), { recalledMemory: entries });
        expect(prompt).toMatch(/RELEVANT PRIOR MEMORY \(auto-recalled/);
        expect(prompt).toMatch(/abcdef12…/);
        expect(prompt).toMatch(/imp:5/);
        expect(prompt).toMatch(/\[preference, ledger\]/);
        expect(prompt).toMatch(/from Architect/);
        expect(prompt).toMatch(/User prefers Polygon as the default ledger/);
        expect(prompt).toMatch(/Bridge node label convention/);
    });

    it("marks dark agents as memory-disabled and omits auto-recall", () => {
        const entries = [entry({ content: "this should not appear" })];
        const prompt = buildWorkspaceSystemPrompt(emptyCtx(), {
            recalledMemory: entries,
            isDarkAgent: true,
        });
        expect(prompt).toMatch(/COLLECTIVE MEMORY: \(DISABLED/);
        expect(prompt).toMatch(/DARK MODE/);
        expect(prompt).not.toMatch(/this should not appear/);
    });
});
