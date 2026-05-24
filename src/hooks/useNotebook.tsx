import { useState, useCallback, useEffect } from "react";
import { Settings } from "lucide-react";
import type { NotebookEntry, NotebookCategory } from "@/types";

const STORAGE_KEY = "decops_notebook";
const MAX_ENTRIES = 500;

function loadEntries(): NotebookEntry[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

export function useNotebook() {
    const [entries, setEntries] = useState<NotebookEntry[]>(loadEntries);

    // Persist to localStorage on change (exclude icon as it can't be serialized if it's a ReactNode).
    // setItem can throw QuotaExceededError if the notebook grows large; we catch it
    // here so the React tree does not unmount (which previously caused a black screen).
    useEffect(() => {
        try {
            const serializableEntries = entries.map(({ icon, ...rest }) => rest);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(serializableEntries));
        } catch (err) {
            console.warn(`useNotebook: failed to persist ${entries.length} entries — clearing oldest and retrying.`, err);
            try {
                // Drop to half size and retry once; if it still fails, give up
                // silently — in-memory state remains usable until reload.
                const trimmed = entries.slice(0, Math.max(1, Math.floor(entries.length / 2)));
                const serializableTrimmed = trimmed.map(({ icon, ...rest }) => rest);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(serializableTrimmed));
            } catch (err2) {
                console.warn("useNotebook: trim+retry also failed; persistence disabled for this session.", err2);
            }
        }
    }, [entries]);

    const addEntry = useCallback((entry: Omit<NotebookEntry, "id" | "timestamp">) => {
        setEntries(prev => {
            const newEntry: NotebookEntry = {
                ...entry,
                id: `nb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                timestamp: Date.now(),
            };
            return [newEntry, ...prev].slice(0, MAX_ENTRIES);
        });
    }, []);

    const clearNotebook = useCallback(() => {
        setEntries([]);
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    const exportNotebook = useCallback(() => {
        const data = {
            version: "1.0",
            type: "activity",
            exportedAt: new Date().toISOString(),
            entries,
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `decops-activity-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [entries]);

    // Unified addLog — replaces the old useActivityLog hook
    const addLog = useCallback((msg: string) => {
        addEntry({
            category: "system",
            icon: <Settings size={14} color="#71717a" />,
            title: msg,
            description: "",
            tags: ["system", "auto"],
        });
    }, [addEntry]);

    return { entries, addEntry, addLog, clearNotebook, exportNotebook };
}

/** Inferred return type of {@link useNotebook}. Prefer this over `any`
 *  when injecting the notebook API into other hooks/components. */
export type UseNotebookReturn = ReturnType<typeof useNotebook>;
