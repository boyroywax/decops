/**
 * EditorContext — bridges the Editor view's internal state/callbacks
 * to the rest of the app (ChatPanel AI, etc.).
 *
 * Pattern: EditorView registers its API on mount; ChatPanel reads it.
 * Also supports a "pending artifact" queue so external panels (e.g.
 * ArtifactsPanel) can send an artifact to the editor even before
 * it's mounted — the editor consumes & clears it on mount.
 */

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from "react";
import type { JobArtifact } from "@/types";

/** Snapshot of the editor's current state */
export interface EditorState {
    docName: string;
    fileType: string;
    content: string;
    isDirty: boolean;
    validation: { valid: boolean; error?: string };
    stats: { words: number; chars: number; lines: number };
    activeArtifactId: string | null;
}

/** Persisted editor document state — survives view switches */
export interface PersistedEditorState {
    content: string;
    docName: string;
    fileType: string;
    activeArtifactId: string | null;
    isDirty: boolean;
    mode: string;
    wordWrap: boolean;
    history: { content: string; cursorPos: number }[];
    historyIndex: number;
}

/** Imperative API that EditorView exposes */
export interface EditorAPI {
    /** Get current editor state snapshot */
    getState: () => EditorState;
    /** Replace the entire editor content */
    setContent: (text: string) => void;
    /** Extract first code block from markdown and apply to editor */
    applyCodeBlock: (markdownResponse: string) => boolean;
    /** Get just the content string */
    getContent: () => string;
    /** Get file metadata */
    getFileInfo: () => { docName: string; fileType: string };
    /** Load an artifact into the editor */
    loadArtifact: (artifact: JobArtifact) => void;
}

interface EditorContextType {
    api: EditorAPI | null;
    register: (api: EditorAPI) => void;
    unregister: () => void;
    /** Queue an artifact to be opened when the editor mounts */
    queueArtifact: (artifact: JobArtifact) => void;
    /** Consume the pending artifact (called by EditorView on mount) */
    consumePendingArtifact: () => JobArtifact | null;
    /** Persist editor state so it survives view switches */
    persistState: (state: PersistedEditorState) => void;
    /** Retrieve persisted state (non-destructive — state stays until overwritten) */
    getPersistedState: () => PersistedEditorState | null;
    /** AI-proposed content for inline diff preview */
    proposedContent: string | null;
    /** Send proposed content to the editor for diff preview */
    proposeEdit: (content: string) => void;
    /** Clear the current proposal (accept or reject) */
    clearProposal: () => void;
}

const EditorContext = createContext<EditorContextType>({
    api: null,
    register: () => {},
    unregister: () => {},
    queueArtifact: () => {},
    consumePendingArtifact: () => null,
    persistState: () => {},
    getPersistedState: () => null,
    proposedContent: null,
    proposeEdit: () => {},
    clearProposal: () => {},
});

export function EditorProvider({ children }: { children: ReactNode }) {
    const [api, setApi] = useState<EditorAPI | null>(null);
    const [pendingArtifact, setPendingArtifact] = useState<JobArtifact | null>(null);
    const [proposedContent, setProposedContent] = useState<string | null>(null);
    const persistedStateRef = useRef<PersistedEditorState | null>(null);

    const proposeEdit = useCallback((content: string) => {
        if (content.trim()) setProposedContent(content);
    }, []);
    const clearProposal = useCallback(() => setProposedContent(null), []);

    const register = useCallback((newApi: EditorAPI) => {
        setApi(newApi);
    }, []);

    const unregister = useCallback(() => {
        setApi(null);
    }, []);

    const queueArtifact = useCallback((artifact: JobArtifact) => {
        setPendingArtifact(artifact);
    }, []);

    const consumePendingArtifact = useCallback(() => {
        const art = pendingArtifact;
        if (art) setPendingArtifact(null);
        return art;
    }, [pendingArtifact]);

    const persistState = useCallback((state: PersistedEditorState) => {
        persistedStateRef.current = state;
    }, []);

    const getPersistedState = useCallback(() => {
        return persistedStateRef.current;
    }, []);

    return (
        <EditorContext.Provider value={{ api, register, unregister, queueArtifact, consumePendingArtifact, persistState, getPersistedState, proposedContent, proposeEdit, clearProposal }}>
            {children}
        </EditorContext.Provider>
    );
}

/** Access the registered Editor API (may be null if Editor isn't mounted) */
export function useEditorContext() {
    return useContext(EditorContext);
}
