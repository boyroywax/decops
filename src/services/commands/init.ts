import { initializeToolkits } from "@/services/toolkits";
import { builtinModules } from "@/services/toolkits/builtins";

/**
 * Legacy initializer — delegates to the modular ToolkitRegistry system.
 *
 * Prefer calling `initializeToolkits()` from `@/services/toolkits` directly.
 * This wrapper exists for backward compatibility with existing call-sites
 * and tests.
 */
export function initializeRegistry() {
    initializeToolkits(builtinModules);
}

