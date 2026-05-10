/**
 * Architect Toolkit — UI registration (side-effect module).
 *
 * Registers the ArchitectPopup as a global overlay.
 * The Architect does not need its own provider or primary view
 * (it uses the popup overlay triggered from AuthenticatedApp).
 */

import { registerToolkitGlobal } from "@/services/toolkits/uiRegistry";

// Note: ArchitectPopup requires props (isOpen, onClose, architect state),
// so it cannot be registered as a simple global. The popup rendering stays
// in AuthenticatedApp for now, but we register it for discoverability.
// Future: refactor to receive state from a toolkit-owned context.
