import { describe, it, expect, beforeEach, vi } from "vitest";
import { logAudit, getLogAggregator, resetLogAggregator } from "@/services/logging";
import type { ToolkitLogEntry } from "@/services/toolkits/types";

describe("logAudit", () => {
    beforeEach(() => {
        resetLogAggregator();
    });

    it("publishes a warn-level entry on the audit channel", () => {
        const received: ToolkitLogEntry[] = [];
        getLogAggregator().subscribeAll((e) => received.push(e));

        logAudit("libp2p.identity.export", { peerId: "12D3KooWAbc" });

        expect(received).toHaveLength(1);
        const e = received[0];
        expect(e.level).toBe("warn");
        expect(e.channel).toBe("audit");
        expect(e.message).toBe("[audit:libp2p.identity.export]");
        expect(e.sourceKit).toBe("libp2p");
        expect(e.data?.event).toBe("libp2p.identity.export");
        expect(e.data?.peerId).toBe("12D3KooWAbc");
        expect(e.tags).toContain("audit");
    });

    it("merges caller-supplied data", () => {
        const received: ToolkitLogEntry[] = [];
        getLogAggregator().subscribeAll((e) => received.push(e));

        logAudit("a.b.c", { foo: 1, bar: "x" });

        expect(received[0].data).toMatchObject({ event: "a.b.c", foo: 1, bar: "x" });
    });

    it("prepends the audit tag to caller-supplied tags", () => {
        const received: ToolkitLogEntry[] = [];
        getLogAggregator().subscribeAll((e) => received.push(e));

        logAudit("x.y", undefined, { tags: ["security", "export"] });

        expect(received[0].tags).toEqual(["audit", "security", "export"]);
    });

    it("never throws even if the aggregator publish fails", () => {
        const agg = getLogAggregator();
        const spy = vi.spyOn(agg, "log").mockImplementation(() => {
            throw new Error("sink exploded");
        });
        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        expect(() => logAudit("ctx.event", { x: 1 })).not.toThrow();
        expect(consoleSpy).toHaveBeenCalled();

        spy.mockRestore();
        consoleSpy.mockRestore();
    });
});
