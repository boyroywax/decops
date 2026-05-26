import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, X, Tag as TagIcon, Bot, Globe, Folder } from "lucide-react";
import {
    listAllCollectiveMemory,
    rememberCollectiveMemory,
    forgetCollectiveMemory,
    setCollectiveMemoryDisabled,
    type CollectiveMemoryEntry,
} from "@/services/collectiveMemory";

interface MemoriesPanelProps {
    workspaceId: string | null | undefined;
}

interface AddModalProps {
    workspaceId: string | null | undefined;
    onClose: () => void;
    onCreated: (entry: CollectiveMemoryEntry) => void;
}

function AddMemoryModal({ workspaceId, onClose, onCreated }: AddModalProps) {
    const [content, setContent] = useState("");
    const [tagsInput, setTagsInput] = useState("");
    const [importance, setImportance] = useState(3);
    const [scope, setScope] = useState<"workspace" | "global">("workspace");
    const [error, setError] = useState<string | null>(null);

    const save = useCallback(() => {
        const trimmed = content.trim();
        if (!trimmed) {
            setError("Memory content is required.");
            return;
        }
        try {
            const tags = tagsInput
                .split(",")
                .map(t => t.trim())
                .filter(Boolean);
            const entry = rememberCollectiveMemory({
                content: trimmed,
                tags,
                importance,
                scope,
                workspaceId: scope === "workspace" ? workspaceId || undefined : undefined,
                sourceAgentName: "User",
            });
            onCreated(entry);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, [content, tagsInput, importance, scope, workspaceId, onCreated]);

    return (
        <div className="memories-modal__backdrop" onClick={onClose}>
            <div className="memories-modal" onClick={e => e.stopPropagation()}>
                <div className="memories-modal__header">
                    <span className="memories-modal__title">Add Memory</span>
                    <button className="memories-modal__close" onClick={onClose} title="Close">
                        <X size={14} />
                    </button>
                </div>
                <div className="memories-modal__body">
                    <label className="memories-modal__label">Content</label>
                    <textarea
                        className="memories-modal__textarea"
                        placeholder="A durable fact, preference, decision, or summary the assistant should remember…"
                        value={content}
                        onChange={e => setContent(e.target.value)}
                        rows={5}
                        autoFocus
                    />

                    <label className="memories-modal__label">Tags <span className="memories-modal__hint">(comma-separated)</span></label>
                    <input
                        className="memories-modal__input"
                        placeholder="preference, ledger, naming…"
                        value={tagsInput}
                        onChange={e => setTagsInput(e.target.value)}
                    />

                    <div className="memories-modal__row">
                        <div className="memories-modal__field">
                            <label className="memories-modal__label">Importance</label>
                            <select
                                className="memories-modal__select"
                                value={importance}
                                onChange={e => setImportance(Number(e.target.value))}
                            >
                                <option value={1}>1 — trivia</option>
                                <option value={2}>2 — low</option>
                                <option value={3}>3 — normal</option>
                                <option value={4}>4 — high</option>
                                <option value={5}>5 — critical</option>
                            </select>
                        </div>
                        <div className="memories-modal__field">
                            <label className="memories-modal__label">Scope</label>
                            <select
                                className="memories-modal__select"
                                value={scope}
                                onChange={e => setScope(e.target.value as "workspace" | "global")}
                            >
                                <option value="workspace">workspace</option>
                                <option value="global">global</option>
                            </select>
                        </div>
                    </div>

                    {error && <div className="memories-modal__error">{error}</div>}
                </div>
                <div className="memories-modal__footer">
                    <button className="memories-modal__btn-secondary" onClick={onClose}>Cancel</button>
                    <button className="memories-modal__btn-primary" onClick={save}>Save Memory</button>
                </div>
            </div>
        </div>
    );
}

function MemoryCard({
    entry,
    onToggle,
    onDelete,
}: {
    entry: CollectiveMemoryEntry;
    onToggle: () => void;
    onDelete: () => void;
}) {
    const disabled = !!entry.disabled;
    return (
        <div className={`memory-card${disabled ? " memory-card--disabled" : ""}`}>
            <div className="memory-card__top">
                <div className="memory-card__meta">
                    <span className={`memory-card__importance memory-card__importance--${entry.importance}`}>
                        imp:{entry.importance}
                    </span>
                    <span className="memory-card__scope" title={`scope: ${entry.scope}`}>
                        {entry.scope === "global" ? <Globe size={10} /> : <Folder size={10} />}
                        {entry.scope}
                    </span>
                    {entry.sourceAgentName && (
                        <span className="memory-card__source" title="Source agent">
                            <Bot size={10} />
                            {entry.sourceAgentName}
                        </span>
                    )}
                </div>
                <div className="memory-card__actions">
                    <label className="memory-card__toggle" title={disabled ? "Enable" : "Disable"}>
                        <input
                            type="checkbox"
                            checked={!disabled}
                            onChange={onToggle}
                        />
                        <span className="memory-card__toggle-track">
                            <span className="memory-card__toggle-thumb" />
                        </span>
                    </label>
                    <button
                        className="memory-card__delete"
                        onClick={onDelete}
                        title="Delete memory"
                    >
                        <Trash2 size={11} />
                    </button>
                </div>
            </div>
            <div className="memory-card__content">{entry.content}</div>
            {entry.tags.length > 0 && (
                <div className="memory-card__tags">
                    <TagIcon size={9} />
                    {entry.tags.map(t => (
                        <span key={t} className="memory-card__tag">{t}</span>
                    ))}
                </div>
            )}
            <div className="memory-card__footer">
                <span className="memory-card__id" title={entry.id}>{entry.id.slice(0, 8)}…</span>
                <span className="memory-card__date">
                    {new Date(entry.updatedAt).toLocaleString()}
                </span>
            </div>
        </div>
    );
}

export function MemoriesPanel({ workspaceId }: MemoriesPanelProps) {
    const [entries, setEntries] = useState<CollectiveMemoryEntry[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [query, setQuery] = useState("");

    const refresh = useCallback(() => {
        setEntries(listAllCollectiveMemory(workspaceId || undefined));
    }, [workspaceId]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const handleToggle = useCallback((id: string, currentlyDisabled: boolean) => {
        setCollectiveMemoryDisabled(id, !currentlyDisabled);
        refresh();
    }, [refresh]);

    const handleDelete = useCallback((id: string) => {
        forgetCollectiveMemory(id);
        refresh();
    }, [refresh]);

    const handleCreated = useCallback(() => {
        setShowModal(false);
        refresh();
    }, [refresh]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return entries;
        return entries.filter(e =>
            e.content.toLowerCase().includes(q) ||
            e.tags.some(t => t.includes(q)) ||
            (e.sourceAgentName || "").toLowerCase().includes(q),
        );
    }, [entries, query]);

    return (
        <div className="chat-panel__memories" data-testid="chat-panel-memories">
            <div className="chat-panel__memories-toolbar">
                <input
                    type="search"
                    className="chat-panel__memories-search"
                    placeholder="Search memories…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                />
                <span className="chat-panel__memories-summary">
                    {entries.length} total · {entries.filter(e => !e.disabled).length} active
                </span>
            </div>
            <div className="chat-panel__memories-grid">
                <button
                    className="memory-card memory-card--add"
                    onClick={() => setShowModal(true)}
                    data-testid="memory-add-card"
                >
                    <Plus size={20} />
                    <span>Add new memory</span>
                </button>
                {filtered.map(entry => (
                    <MemoryCard
                        key={entry.id}
                        entry={entry}
                        onToggle={() => handleToggle(entry.id, !!entry.disabled)}
                        onDelete={() => handleDelete(entry.id)}
                    />
                ))}
                {entries.length > 0 && filtered.length === 0 && (
                    <div className="chat-panel__memories-empty">No memories match “{query}”.</div>
                )}
            </div>

            {showModal && (
                <AddMemoryModal
                    workspaceId={workspaceId}
                    onClose={() => setShowModal(false)}
                    onCreated={handleCreated}
                />
            )}
        </div>
    );
}
