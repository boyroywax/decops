/**
 * Editor Toolkit — UI registration (side-effect module).
 *
 * Registers the EditorProvider and EditorView with the toolkit UI registry.
 */

import { registerToolkitProvider, registerToolkitView } from "@/services/toolkits/uiRegistry";
import { EditorProvider } from "./EditorContext";
import { EditorView } from "./EditorView";

registerToolkitProvider({
  toolkitId: "editor",
  Provider: EditorProvider,
  order: 70,
});

registerToolkitView({
  toolkitId: "editor",
  viewIds: ["editor"],
  Component: EditorView,
});
