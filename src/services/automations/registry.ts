
import { AutomationDefinition } from "./types";

const registry = new Map<string, AutomationDefinition>();

export function registerAutomation(def: AutomationDefinition) {
    if (registry.has(def.id)) {
        console.warn(`Overwriting automation definition: ${def.id}`);
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
