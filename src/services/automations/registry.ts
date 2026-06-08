
import { AutomationDefinition } from "./types";
import { logAggregator } from "@/services/logging";

const registry = new Map<string, AutomationDefinition>();

export function registerAutomation(def: AutomationDefinition) {
    if (registry.has(def.id)) {
        logAggregator.log("warn", `Overwriting automation definition: ${def.id}`, { sourceKit: "automations.registry" });
    }
    registry.set(def.id, def);
}

export function unregisterAutomation(id: string) {
    if (registry.has(id)) {
        registry.delete(id);
    }
}

export function getAutomation(id: string): AutomationDefinition | undefined {
    return registry.get(id);
}

export function getAllAutomations(): AutomationDefinition[] {
    return Array.from(registry.values());
}
