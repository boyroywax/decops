import { describe, it, expect, beforeEach, vi } from "vitest";
import { logError, getLogAggregator, resetLogAggregator } from "@/services/logging";
import type { ToolkitLogEntry } from "@/services/toolkits/types";

describe("logError", () => {
  beforeEach(() => {
    resetLogAggregator();
  });

  it("publishes an Error to the aggregator at level=error", () => {
    const received: ToolkitLogEntry[] = [];
    getLogAggregator().subscribeAll((e) => received.push(e));

    logError("libp2p.service.start", new Error("boom"));

    expect(received).toHaveLength(1);
    const entry = received[0];
    expect(entry.level).toBe("error");
    expect(entry.message).toBe("[libp2p.service.start] boom");
    expect(entry.sourceKit).toBe("libp2p");
    expect(entry.channel).toBe("errors");
    expect(entry.data?.context).toBe("libp2p.service.start");
    expect(entry.data?.errorName).toBe("Error");
    expect(typeof entry.data?.stack).toBe("string");
  });

  it("normalises string errors", () => {
    const received: ToolkitLogEntry[] = [];
    getLogAggregator().subscribeAll((e) => received.push(e));

    logError("studio.x", "not-an-error-object");

    expect(received[0].message).toBe("[studio.x] not-an-error-object");
    expect(received[0].data?.errorName).toBeUndefined();
  });

  it("normalises non-Error objects via JSON.stringify", () => {
    const received: ToolkitLogEntry[] = [];
    getLogAggregator().subscribeAll((e) => received.push(e));

    logError("ctx", { code: 42, reason: "x" });

    expect(received[0].message).toBe('[ctx] {"code":42,"reason":"x"}');
  });

  it("merges caller-supplied data without dropping context fields", () => {
    const received: ToolkitLogEntry[] = [];
    getLogAggregator().subscribeAll((e) => received.push(e));

    logError("a.b", new Error("e"), { jobId: "j-1", extra: 7 });

    expect(received[0].data).toMatchObject({
      context: "a.b",
      errorName: "Error",
      jobId: "j-1",
      extra: 7,
    });
  });

  it("downgrades to warn level when opts.warn is set", () => {
    const received: ToolkitLogEntry[] = [];
    getLogAggregator().subscribeAll((e) => received.push(e));

    logError("ctx", new Error("soft"), undefined, { warn: true });

    expect(received[0].level).toBe("warn");
  });

  it("never throws even if the aggregator publish fails", () => {
    const agg = getLogAggregator();
    const spy = vi.spyOn(agg, "log").mockImplementation(() => {
      throw new Error("sink exploded");
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => logError("ctx", new Error("inner"))).not.toThrow();
    expect(consoleSpy).toHaveBeenCalled();

    spy.mockRestore();
    consoleSpy.mockRestore();
  });
});
