import { describe, it, expect, beforeEach } from "vitest";
import {
    registerChatDelegation,
    getChatDelegation,
    getAllDelegations,
    type ChatDelegation,
} from "@/services/ai/delegation";

/**
 * The delegation registry is a module-level singleton — tests must dispose
 * every registration they create so subsequent tests start clean.
 */
function makeDelegation(overrides: Partial<ChatDelegation> = {}): ChatDelegation {
    return {
        id: "test",
        check: () => true,
        enhance: (sp) => sp + "\n[enhanced]",
        ...overrides,
    };
}

describe("ai/delegation: registry", () => {
    let disposers: Array<() => void> = [];

    beforeEach(() => {
        // Dispose any leftover registrations from previous tests.
        for (const d of disposers) d();
        disposers = [];
    });

    it("registerChatDelegation returns a dispose function", () => {
        const d = makeDelegation();
        const dispose = registerChatDelegation(d);
        disposers.push(dispose);

        expect(typeof dispose).toBe("function");
        expect(getAllDelegations()).toContain(d);
    });

    it("dispose removes the delegation", () => {
        const d = makeDelegation();
        const dispose = registerChatDelegation(d);
        expect(getAllDelegations()).toContain(d);

        dispose();
        expect(getAllDelegations()).not.toContain(d);
    });

    it("dispose is idempotent (calling twice is safe)", () => {
        const d = makeDelegation();
        const dispose = registerChatDelegation(d);
        dispose();
        // Second call should not throw nor affect other delegations
        expect(() => dispose()).not.toThrow();
    });
});

describe("ai/delegation: getChatDelegation routing", () => {
    let disposers: Array<() => void> = [];
    beforeEach(() => {
        for (const d of disposers) d();
        disposers = [];
    });

    it("returns null when no delegations are registered", () => {
        expect(getChatDelegation("any message")).toBeNull();
    });

    it("returns null when no delegation's check() matches", () => {
        disposers.push(registerChatDelegation(makeDelegation({
            id: "studio",
            check: (msg) => msg.startsWith("/studio"),
        })));
        expect(getChatDelegation("hello world")).toBeNull();
    });

    it("returns the matching delegation", () => {
        const studio = makeDelegation({
            id: "studio",
            check: (msg) => msg.startsWith("/studio"),
        });
        disposers.push(registerChatDelegation(studio));
        expect(getChatDelegation("/studio build a job")).toBe(studio);
    });

    it("returns the FIRST matching delegation when multiple match", () => {
        // Registration order is preserved; first match wins. This documents
        // the contract that toolkits registered earlier take precedence.
        const first = makeDelegation({ id: "first", check: () => true });
        const second = makeDelegation({ id: "second", check: () => true });
        disposers.push(registerChatDelegation(first));
        disposers.push(registerChatDelegation(second));

        expect(getChatDelegation("any")).toBe(first);
    });

    it("disposed delegations are not returned", () => {
        const studio = makeDelegation({
            id: "studio",
            check: (msg) => msg.startsWith("/studio"),
        });
        const dispose = registerChatDelegation(studio);
        expect(getChatDelegation("/studio x")).toBe(studio);
        dispose();
        expect(getChatDelegation("/studio x")).toBeNull();
    });

    it("getAllDelegations returns a readonly view", () => {
        const d = makeDelegation();
        disposers.push(registerChatDelegation(d));
        const all = getAllDelegations();
        expect(all).toContain(d);
        // TS marks it readonly; at runtime it's just an array snapshot —
        // confirm length matches expectation.
        expect(all.length).toBeGreaterThanOrEqual(1);
    });
});
