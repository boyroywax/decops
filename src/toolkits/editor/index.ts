/**
 * Editor Toolkit — barrel export.
 *
 * This is the public API surface for the Editor toolkit.
 * All consumers should import from `@/toolkits/editor` instead of
 * reaching into internal files.
 */

export { EditorProvider, useEditorContext } from "./EditorContext";
export type { EditorAPI, EditorState, PersistedEditorState } from "./EditorContext";
export { EditorView } from "./EditorView";
export type { EditorViewProps } from "./EditorView";
