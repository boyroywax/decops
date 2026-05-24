import { describe, it, expect, beforeEach, vi } from "vitest";
import { CommandRegistry } from "@/services/commands/registry";
import { resolveToolTimeout } from "@/services/commands/tools";
import type { CommandDefinition } from "@/services/commands/types";

// `resolveToolTimeout` reads from the singleton `registry` exported by
// `@/services/commands/registry`. Register stub commands directly on that
// instance for the duration of each test.
import { registry } from "@/services/commands/registry";

function makeCommand(overrides: Partial<CommandDefinition> & { id: string }): CommandDefinition {
    return {
        description: "",
        args: {},
        rbac: ["orchestrator"],
        tags: [],
        output: "",
        execute: vi.fn().mockResolvedValue(null),
        ...overrides,
    };
}

describe("resolveToolTimeout", () => {
    const DEFAULT = 12_000;
    const RUNNER = 180_000;

    const registered: string[] = [];

    beforeEach(() => {
        // Clean up anything we registered in a previous case.
        while (registered.length) {
            registry.unregister(registered.pop()!);
        }
    });

    function register(def: CommandDefinition): void {
        registry.register(def);
        registered.push(def.id);
    }

    it("returns the default timeout for unknown commands", () => {
        expect(resolveToolTimeout("not_a_real_command")).toBe(DEFAULT);
    });

    it("returns the default timeout for plain commands", () => {
        register(makeCommand({ id: "plain_cmd" }));
        expect(resolveToolTimeout("plain_cmd")).toBe(DEFAULT);
    });

    it("returns the job-runner timeout when spawnsChildJobs is true", () => {
        register(makeCommand({ id: "spawner_cmd", spawnsChildJobs: true }));
        expect(resolveToolTimeout("spawner_cmd")).toBe(RUNNER);
    });

    it("explicit timeoutMs overrides spawnsChildJobs", () => {
        register(makeCommand({ id: "override_cmd", spawnsChildJobs: true, timeoutMs: 5_000 }));
        expect(resolveToolTimeout("override_cmd")).toBe(5_000);
    });

    it("explicit timeoutMs works without spawnsChildJobs", () => {
        register(makeCommand({ id: "fast_cmd", timeoutMs: 1_500 }));
        expect(resolveToolTimeout("fast_cmd")).toBe(1_500);
    });

    it("uses the singleton CommandRegistry (not a fresh instance)", () => {
        // Sanity: the imported `registry` is an instance of CommandRegistry.
        expect(registry).toBeInstanceOf(CommandRegistry);
    });
});
