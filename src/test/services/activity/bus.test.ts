import { describe, it, expect, beforeEach } from "vitest";
import { ActivityBus, matchesFilter } from "@/services/activity/bus";
import type { ActivityEvent } from "@/services/activity";

describe("ActivityBus", () => {
  let bus: ActivityBus;

  beforeEach(() => {
    bus = new ActivityBus(50);
  });

  it("publishes and queries events", () => {
    bus.publish({ source: "jobs", channel: "lifecycle.queued", kind: "jobLifecycle", severity: "info", title: "Job queued" });
    bus.publish({ source: "jobs", channel: "lifecycle.running", kind: "jobLifecycle", severity: "info", title: "Job started" });

    const all = bus.query();
    expect(all).toHaveLength(2);
    expect(all[0].title).toBe("Job queued");
  });

  it("notifies subscribers in order", () => {
    const received: string[] = [];
    bus.subscribe((e) => received.push(e.title));
    bus.publish({ source: "system", channel: "boot", kind: "event", severity: "info", title: "A" });
    bus.publish({ source: "system", channel: "boot", kind: "event", severity: "info", title: "B" });
    expect(received).toEqual(["A", "B"]);
  });

  it("respects per-listener filters", () => {
    const errors: ActivityEvent[] = [];
    bus.subscribe((e) => errors.push(e), { severities: ["error"] });
    bus.publish({ source: "jobs",  channel: "x", kind: "event", severity: "info",  title: "ok" });
    bus.publish({ source: "kubo",  channel: "x", kind: "event", severity: "error", title: "boom" });
    expect(errors).toHaveLength(1);
    expect(errors[0].title).toBe("boom");
  });

  it("unsubscribe stops delivery", () => {
    let n = 0;
    const off = bus.subscribe(() => { n++; });
    bus.publish({ source: "system", channel: "x", kind: "event", severity: "info", title: "1" });
    off();
    bus.publish({ source: "system", channel: "x", kind: "event", severity: "info", title: "2" });
    expect(n).toBe(1);
  });

  it("enforces retention (ring buffer)", () => {
    const small = new ActivityBus(3);
    for (let i = 0; i < 10; i++) {
      small.publish({ source: "system", channel: "x", kind: "event", severity: "info", title: `evt-${i}` });
    }
    const events = small.query();
    expect(events).toHaveLength(3);
    expect(events[0].title).toBe("evt-7");
    expect(events[2].title).toBe("evt-9");
  });

  it("query applies source, severity, and search filters", () => {
    bus.publish({ source: "jobs", channel: "c", kind: "event", severity: "info",  title: "Job alpha" });
    bus.publish({ source: "kubo", channel: "c", kind: "event", severity: "warn",  title: "Kubo beta" });
    bus.publish({ source: "kubo", channel: "c", kind: "event", severity: "error", title: "Kubo gamma" });

    expect(bus.query({ sources: ["kubo"] })).toHaveLength(2);
    expect(bus.query({ severities: ["error"] })).toHaveLength(1);
    expect(bus.query({ search: "beta" })).toHaveLength(1);
  });

  it("clear() with filter removes only matching events", () => {
    bus.publish({ source: "jobs", channel: "c", kind: "event", severity: "info", title: "keep" });
    bus.publish({ source: "kubo", channel: "c", kind: "event", severity: "info", title: "drop" });
    bus.clear({ sources: ["kubo"] });
    const all = bus.query();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe("keep");
  });

  it("matchesFilter handles time bounds", () => {
    const evt: ActivityEvent = {
      id: "x", timestamp: 1_000, source: "system", channel: "c",
      kind: "event", severity: "info", title: "t",
    };
    expect(matchesFilter(evt, { since: 500 })).toBe(true);
    expect(matchesFilter(evt, { since: 1500 })).toBe(false);
    expect(matchesFilter(evt, { until: 1500 })).toBe(true);
    expect(matchesFilter(evt, { until: 500 })).toBe(false);
  });
});
