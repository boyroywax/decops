/**
 * Architect Toolkit — barrel export.
 *
 * Public API for the Mesh Architect (network designer).
 * All consumers should import from `@/toolkits/architect`.
 */

// Hook
export { useArchitect } from "./hooks/useArchitect";
export { ArchitectProvider, useArchitectContext } from "./hooks/ArchitectContext";

// Views
export { ArchitectView } from "./views/ArchitectView";

// Components
export { ArchitectPopup } from "./components/ArchitectPopup";
export { ArchitectInlinePanel } from "./components/ArchitectInlinePanel";
export { ArchitectBanner } from "./components/ArchitectBanner";
export { ArchitectWelcome } from "./components/ArchitectWelcome";
export { ArchitectBotPanel } from "./components/ArchitectBotPanel";

// Commands
export { promptArchitectCommand, deployNetworkCommand } from "./commands/architect";
