import { describe, it, expect, beforeEach } from "vitest";
import {
    rememberCollectiveMemory,
    recallCollectiveMemory,
    listAllCollectiveMemory,
    setCollectiveMemoryDisabled,
    forgetCollectiveMemory,
    clearCollectiveMemory,
} from "@/services/collectiveMemory";

beforeEach(() => {
    clearCollectiveMemory();
    if (typeof globalThis.localStorage !== "undefined") {
        globalThis.localStorage.clear();
    }
});

describe("collectiveMemory — disabled + listAll", () => {
    it("listAllCollectiveMemory returns every entry, newest first", () => {
        const a = rememberCollectiveMemory({ content: "first" });
        const b = rememberCollectiveMemory({ content: "second" });
        const all = listAllCollectiveMemory();
        expect(all).toHaveLength(2);
        expect(all[0].id).toBe(b.id);
        expect(all[1].id).toBe(a.id);
    });

    it("setCollectiveMemoryDisabled flips the disabled flag and persists it", () => {
        const e = rememberCollectiveMemory({ content: "hello world" });
        const updated = setCollectiveMemoryDisabled(e.id, true);
        expect(updated?.disabled).toBe(true);
        const fromList = listAllCollectiveMemory().find(x => x.id === e.id);
        expect(fromList?.disabled).toBe(true);
    });

    it("recallCollectiveMemory excludes disabled entries", () => {
        const enabled = rememberCollectiveMemory({ content: "polygon ledger preference" });
        const disabled = rememberCollectiveMemory({ content: "polygon something old" });
        setCollectiveMemoryDisabled(disabled.id, true);
        const recalled = recallCollectiveMemory({ query: "polygon", limit: 10 });
        expect(recalled.map(r => r.id)).toEqual([enabled.id]);
    });

    it("re-enabling makes the entry recallable again", () => {
        const e = rememberCollectiveMemory({ content: "bridge naming convention" });
        setCollectiveMemoryDisabled(e.id, true);
        expect(recallCollectiveMemory({ query: "bridge" })).toHaveLength(0);
        setCollectiveMemoryDisabled(e.id, false);
        expect(recallCollectiveMemory({ query: "bridge" })).toHaveLength(1);
    });

    it("setCollectiveMemoryDisabled on a missing id returns null", () => {
        expect(setCollectiveMemoryDisabled("does-not-exist", true)).toBeNull();
    });

    it("forgetCollectiveMemory removes the entry from listAll", () => {
        const e = rememberCollectiveMemory({ content: "temporary" });
        expect(forgetCollectiveMemory(e.id)).toBe(true);
        expect(listAllCollectiveMemory().find(x => x.id === e.id)).toBeUndefined();
    });
});
