import { describe, it, expect } from "vitest";
import { builtinModules } from "@/services/toolkits/builtins";

describe("outputSchema coverage [§9.1]", () => {
    it("every built-in command has an outputSchema declared", () => {
        const missing: string[] = [];
        for (const mod of builtinModules) {
            for (const cmd of mod.commands ?? []) {
                if (!cmd.outputSchema) {
                    missing.push(`${mod.manifest.id}/${cmd.id}`);
                }
            }
        }
        expect(missing, `missing outputSchema on:\n${missing.join("\n")}`).toEqual([]);
    });

    it("every outputSchema is a JSON-Schema object form", () => {
        const bad: string[] = [];
        for (const mod of builtinModules) {
            for (const cmd of mod.commands ?? []) {
                const s = cmd.outputSchema;
                if (s && (typeof s !== "object" || (s as { type?: string }).type !== "object")) {
                    bad.push(`${mod.manifest.id}/${cmd.id}`);
                }
            }
        }
        expect(bad, `non-object outputSchema on:\n${bad.join("\n")}`).toEqual([]);
    });
});
