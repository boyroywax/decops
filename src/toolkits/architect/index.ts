/**
 * Architect Toolkit — barrel export.
 *
 * Public API for the Mesh Architect (network designer).
 * All consumers should import from `@/toolkits/architect`.
 */

// Hook
export { useArchitect } from "./hooks/useArchitect";

// Views
export { ArchitectView } from "./views/ArchitectView";

// Components
export { ArchitectPopup } from "./components/ArchitectPopup";
export { ArchitectBotPanel } from "./components/ArchitectBotPanel";

// Commands
export { promptArchitectCommand, deployNetworkCommand } from "./commands/architect";
