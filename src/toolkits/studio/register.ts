/**
 * Studio Toolkit — UI registration (side-effect module).
 *
 * Registers the StudioProvider, StudioView, and JobInputPromptModal
 * with the toolkit UI registry so Main.tsx and ViewSwitcher discover
 * them dynamically.
 */

import { registerToolkitProvider, registerToolkitView, registerToolkitGlobal } from "@/services/toolkits/uiRegistry";
import { StudioProvider } from "./StudioContext";
import { StudioView } from "./components/StudioView";
import { JobInputPromptModal } from "./components/JobInputPromptModal";

registerToolkitProvider({
  toolkitId: "studio",
  Provider: StudioProvider,
  order: 60,
});

registerToolkitView({
  toolkitId: "studio",
  viewIds: ["studio"],
  Component: StudioView,
});

registerToolkitGlobal({
  toolkitId: "studio",
  key: "studio-job-input-prompt",
  Component: JobInputPromptModal,
});
