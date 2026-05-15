import { describe, it, expect, vi } from "vitest";
import { CommandRegistry } from "@/services/commands/registry";
import { RBACDenied, assertRBAC, getActorRole, DEFAULT_ACTOR_ROLE } from "@/services/commands/rbac";
import type { CommandDefinition, CommandContext } from "@/services/commands/types";

/** Build a minimal command stub with the supplied rbac list. */
function makeCommand(overrides: Partial<CommandDefinition> = {}): CommandDefinition {
    return {
        id: "test_cmd",
        description: "Test command",
        args: {},
        rbac: ["orchestrator"],
        tags: [],
        output: "void",
        execute: vi.fn().mockResolvedValue("ok"),
        ...overrides,
    };
}

/** Build a minimal CommandContext with only the auth slice populated. */
function makeContext(role?: string): CommandContext {
    const user = role ? { id: "u1", role } : null;
    // Only the auth slice is needed for RBAC; cast for the rest.
    return { auth: { user } } as unknown as CommandContext;
}

describe("RBAC: getActorRole", () => {
    it("returns the user's role when present", () => {
        expect(getActorRole(makeContext("builder"))).toBe("builder");
    });

    it("falls back to DEFAULT_ACTOR_ROLE when user is null", () => {
        expect(getActorRole(makeContext())).toBe(DEFAULT_ACTOR_ROLE);
    });

    it("falls back to DEFAULT_ACTOR_ROLE when context is undefined", () => {
        expect(getActorRole(undefined)).toBe(DEFAULT_ACTOR_ROLE);
    });

    it("DEFAULT_ACTOR_ROLE is 'orchestrator' (preserves single-user-app behaviour)", () => {
        expect(DEFAULT_ACTOR_ROLE).toBe("orchestrator");
    });
});

describe("RBAC: assertRBAC", () => {
    it("allows execution when the actor's role is in command.rbac", () => {
        const cmd = makeCommand({ rbac: ["builder", "orchestrator"] });
        expect(() => assertRBAC(cmd, makeContext("builder"))).not.toThrow();
    });

    it("throws RBACDenied when the actor's role is NOT in command.rbac", () => {
        const cmd = makeCommand({ id: "deploy_network", rbac: ["builder", "orchestrator"] });
        expect(() => assertRBAC(cmd, makeContext("researcher"))).toThrow(RBACDenied);
    });

    it("treats empty rbac array as 'no restrictions'", () => {
        const cmd = makeCommand({ rbac: [] });
        expect(() => assertRBAC(cmd, makeContext("researcher"))).not.toThrow();
    });

    it("uses default role (orchestrator) when no user is present", () => {
        // Most built-in commands include 'orchestrator' in their rbac list,
        // so the headless / null-user path should still execute them.
        const cmd = makeCommand({ rbac: ["orchestrator"] });
        expect(() => assertRBAC(cmd, makeContext())).not.toThrow();
    });

    it("denies default-role caller when 'orchestrator' is not in rbac", () => {
        const cmd = makeCommand({ rbac: ["builder"] });
        expect(() => assertRBAC(cmd, makeContext())).toThrow(RBACDenied);
    });

    it("RBACDenied carries commandId, actorRole, and allowedRoles", () => {
        const cmd = makeCommand({ id: "deploy_network", rbac: ["builder", "orchestrator"] });
        try {
            assertRBAC(cmd, makeContext("researcher"));
            throw new Error("expected RBACDenied to be thrown");
        } catch (err) {
            expect(err).toBeInstanceOf(RBACDenied);
            const denied = err as RBACDenied;
            expect(denied.commandId).toBe("deploy_network");
            expect(denied.actorRole).toBe("researcher");
            expect(denied.allowedRoles).toEqual(["builder", "orchestrator"]);
            expect(denied.message).toContain("deploy_network");
            expect(denied.message).toContain("researcher");
        }
    });
});

describe("CommandRegistry.execute: RBAC integration", () => {
    it("a non-builder user attempting deploy_network is denied", async () => {
        const registry = new CommandRegistry();
        const execSpy = vi.fn().mockResolvedValue("deployed");
        registry.register(makeCommand({
            id: "deploy_network",
            rbac: ["builder", "orchestrator"],
            execute: execSpy,
            args: {},
        }));

        await expect(
            registry.execute("deploy_network", {}, makeContext("researcher")),
        ).rejects.toBeInstanceOf(RBACDenied);

        // Critical: command body must NOT have run
        expect(execSpy).not.toHaveBeenCalled();
    });

    it("a builder user can execute deploy_network", async () => {
        const registry = new CommandRegistry();
        const execSpy = vi.fn().mockResolvedValue("deployed");
        registry.register(makeCommand({
            id: "deploy_network",
            rbac: ["builder", "orchestrator"],
            execute: execSpy,
            args: {},
        }));

        const result = await registry.execute("deploy_network", {}, makeContext("builder"));
        expect(result).toBe("deployed");
        expect(execSpy).toHaveBeenCalledTimes(1);
    });

    it("RBAC is checked BEFORE arg validation (denial short-circuits)", async () => {
        // Command requires a 'name' arg but caller is unauthorised.
        // Should throw RBACDenied — NOT 'Missing required argument: name'.
        const registry = new CommandRegistry();
        registry.register(makeCommand({
            id: "privileged_cmd",
            rbac: ["orchestrator"],
            args: { name: { name: "name", type: "string", description: "x", required: true } },
        }));

        await expect(
            registry.execute("privileged_cmd", {}, makeContext("researcher")),
        ).rejects.toBeInstanceOf(RBACDenied);
    });
});
