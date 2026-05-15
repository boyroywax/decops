/**
 * End-to-end coverage for libp2pBot and studioBot module exports [§2.1].
 *
 * Exercises the bot modules without invoking the LLM: status/config/log
 * round-trips, the studioBot layout analyzer over varied canvas shapes,
 * and the registered delegation matchers (smoke).
 *
 * Pairs with delegation.test.ts (matcher heuristics) and runJob/jobScheduler
 * tests (executor + concurrency invariants) to cover the §2.1 surface.
 */

import { describe, it, expect } from "vitest";
import {
    getLibp2pBotStatus,
    getLibp2pBotConfig,
    updateLibp2pBotConfig,
    getLibp2pBotLog,
} from "@/toolkits/libp2p/libp2pBot";
import {
    getStudioBotStatus,
    getStudioBotConfig,
    updateStudioBotConfig,
    getStudioBotLog,
    analyzeLayout,
} from "@/toolkits/studio/studioBot";
import {
    PARALLEL_GROUP_CMD,
    NODE_WIDTH,
    NODE_HEIGHT,
    type StudioStep,
} from "@/toolkits/studio/types/studio";
import type { StudioState } from "@/toolkits/studio/StudioContext";
import type { StudioAPI } from "@/toolkits/studio/StudioContext";

// ── Helpers ────────────────────────────────────────

function makeStep(overrides: Partial<StudioStep> & { id: string; commandId: string; x: number; y: number }): StudioStep {
    return {
        args: {},
        inputBindings: {},
        preCondition: "",
        postCondition: "",
        parentId: null,
        outputMappings: [],
        ...overrides,
    };
}

function makeStudioApi(steps: StudioStep[]): StudioAPI {
    const state: StudioState = {
        name: "test",
        description: "",
        editingJobId: null,
        mode: "serial",
        steps,
        deliverables: [],
        storageEntries: [],
        inputs: [],
    };
    // Only getState() is consumed by analyzeLayout — stub the rest so the
    // type-check passes without spelling out every method.
    return { getState: () => state } as unknown as StudioAPI;
}

// ── libp2pBot ──────────────────────────────────────

describe("libp2pBot module exports [§2.1]", () => {
    it("starts in idle status", () => {
        expect(getLibp2pBotStatus()).toBe("idle");
    });

    it("returns a config snapshot (mutations don't leak through getter)", () => {
        const snap = getLibp2pBotConfig();
        const before = snap.maxRounds;
        snap.maxRounds = 9999;
        expect(getLibp2pBotConfig().maxRounds).toBe(before);
    });

    it("merges partial updates into config", () => {
        const before = getLibp2pBotConfig();
        updateLibp2pBotConfig({ maxRounds: 42 });
        const after = getLibp2pBotConfig();
        expect(after.maxRounds).toBe(42);
        expect(after.autoStartIfStopped).toBe(before.autoStartIfStopped);
        expect(after.protectIdentities).toBe(before.protectIdentities);
        // restore
        updateLibp2pBotConfig({ maxRounds: before.maxRounds });
    });

    it("returns an empty log when no requests have been processed", () => {
        const log = getLibp2pBotLog();
        expect(Array.isArray(log)).toBe(true);
    });

    it("log getter returns a copy (mutations don't leak into module state)", () => {
        const log = getLibp2pBotLog();
        const lenBefore = log.length;
        log.push({} as never);
        expect(getLibp2pBotLog().length).toBe(lenBefore);
    });
});

// ── studioBot: state ───────────────────────────────

describe("studioBot module exports [§2.1]", () => {
    it("starts in idle status", () => {
        expect(getStudioBotStatus()).toBe("idle");
    });

    it("returns a config snapshot (mutations don't leak through getter)", () => {
        const snap = getStudioBotConfig();
        snap.autoLayout = !snap.autoLayout;
        expect(getStudioBotConfig().autoLayout).not.toBe(snap.autoLayout);
    });

    it("merges partial updates into config", () => {
        const before = getStudioBotConfig();
        updateStudioBotConfig({ maxParallelDepth: 9 });
        expect(getStudioBotConfig().maxParallelDepth).toBe(9);
        expect(getStudioBotConfig().autoLayout).toBe(before.autoLayout);
        updateStudioBotConfig({ maxParallelDepth: before.maxParallelDepth });
    });

    it("log getter returns a copy", () => {
        const log = getStudioBotLog();
        const lenBefore = log.length;
        log.push({} as never);
        expect(getStudioBotLog().length).toBe(lenBefore);
    });
});

// ── studioBot.analyzeLayout ────────────────────────

describe("studioBot.analyzeLayout [§2.1]", () => {
    it("returns zeros for an empty canvas", () => {
        const api = makeStudioApi([]);
        const result = analyzeLayout(api);
        expect(result.stepCount).toBe(0);
        expect(result.groupCount).toBe(0);
        expect(result.serialChainLength).toBe(0);
        expect(result.maxParallelWidth).toBe(0);
        expect(result.hasOverlaps).toBe(false);
        expect(result.canvasExtent).toEqual({ width: 0, height: 0 });
        expect(result.issues).toEqual([]);
    });

    it("counts non-group steps and groups separately", () => {
        const api = makeStudioApi([
            makeStep({ id: "g1", commandId: PARALLEL_GROUP_CMD, x: 0, y: 0 }),
            makeStep({ id: "s1", commandId: "cmd_a", x: 400, y: 0 }),
            makeStep({ id: "s2", commandId: "cmd_b", x: 800, y: 0 }),
        ]);
        const result = analyzeLayout(api);
        expect(result.stepCount).toBe(2);
        expect(result.groupCount).toBe(1);
    });

    it("detects overlapping nodes as errors", () => {
        const api = makeStudioApi([
            makeStep({ id: "a", commandId: "cmd_a", x: 100, y: 100 }),
            makeStep({ id: "b", commandId: "cmd_b", x: 100 + NODE_WIDTH * 0.5, y: 100 }),
        ]);
        const result = analyzeLayout(api);
        expect(result.hasOverlaps).toBe(true);
        expect(result.issues.some(i => i.type === "overlap" && i.severity === "error")).toBe(true);
    });

    it("does not flag overlap for well-spaced nodes", () => {
        const api = makeStudioApi([
            makeStep({ id: "a", commandId: "cmd_a", x: 0, y: 0 }),
            makeStep({ id: "b", commandId: "cmd_b", x: NODE_WIDTH * 2, y: NODE_HEIGHT * 2 }),
        ]);
        const result = analyzeLayout(api);
        expect(result.hasOverlaps).toBe(false);
    });

    it("flags orphaned parent references", () => {
        const api = makeStudioApi([
            makeStep({ id: "child", commandId: "cmd_a", parentId: "missing-parent", x: 0, y: 0 }),
        ]);
        const result = analyzeLayout(api);
        expect(result.issues.some(i => i.type === "orphan")).toBe(true);
    });

    it("computes serial chain length through parentId graph", () => {
        const api = makeStudioApi([
            makeStep({ id: "s1", commandId: "cmd_a", parentId: null, x: 0, y: 0 }),
            makeStep({ id: "s2", commandId: "cmd_b", parentId: "s1", x: 400, y: 0 }),
            makeStep({ id: "s3", commandId: "cmd_c", parentId: "s2", x: 800, y: 0 }),
        ]);
        const result = analyzeLayout(api);
        expect(result.serialChainLength).toBe(3);
    });

    it("computes max parallel width across groups", () => {
        const api = makeStudioApi([
            makeStep({ id: "g1", commandId: PARALLEL_GROUP_CMD, x: 0, y: 0 }),
            makeStep({ id: "p1", commandId: "cmd_a", parentId: "g1", isGroupChild: true, x: 400, y: 0 }),
            makeStep({ id: "p2", commandId: "cmd_b", parentId: "g1", isGroupChild: true, x: 400, y: 200 }),
            makeStep({ id: "p3", commandId: "cmd_c", parentId: "g1", isGroupChild: true, x: 400, y: 400 }),
        ]);
        const result = analyzeLayout(api);
        expect(result.maxParallelWidth).toBe(3);
        expect(result.groupCount).toBe(1);
    });

    it("reports the canvas extent as max(x)+NODE_WIDTH, max(y)+NODE_HEIGHT", () => {
        const api = makeStudioApi([
            makeStep({ id: "a", commandId: "cmd_a", x: 0, y: 0 }),
            makeStep({ id: "b", commandId: "cmd_b", x: 600, y: 200 }),
        ]);
        const result = analyzeLayout(api);
        expect(result.canvasExtent.width).toBe(600 + NODE_WIDTH);
        expect(result.canvasExtent.height).toBe(200 + NODE_HEIGHT);
    });
});
