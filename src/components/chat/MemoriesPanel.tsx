import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Trash2, X, Tag as TagIcon, Bot, Globe, Folder, Maximize2, Brain, Sparkles, Copy } from "lucide-react";
import { useJobsContext } from "@/context/JobsContext";
import {
    listAllCollectiveMemory,
    importCollectiveMemoryEntries,
    rememberCollectiveMemory,
    forgetCollectiveMemory,
    setCollectiveMemoryDisabled,
    updateCollectiveMemory,
    type CollectiveMemoryEntry,
} from "@/services/collectiveMemory";
import {
    buildCollectiveMemoryArchiveManifest,
    parseCollectiveMemoryArchive,
} from "@/services/collectiveMemoryArchive";
import type { JobArtifact } from "@/types";

interface MemoriesPanelProps {
    workspaceId: string | null | undefined;
}

interface AddModalProps {
    workspaceId: string | null | undefined;
    onClose: () => void;
    artifacts: JobArtifact[];
    onCreated: () => void;
}

function AddMemoryModal({ workspaceId, onClose, artifacts, onCreated }: AddModalProps) {
    const { importArtifact } = useJobsContext();
    const [content, setContent] = useState("");
    const [tagsInput, setTagsInput] = useState("");
    const [importance, setImportance] = useState(3);
    const [scope, setScope] = useState<"workspace" | "global">("workspace");
    const [mode, setMode] = useState<"manual" | "artifact" | "file">("manual");
    const [importMode, setImportMode] = useState<"upsert" | "skip-existing">("upsert");
    const [selectedArtifactId, setSelectedArtifactId] = useState("");
    const [fileName, setFileName] = useState<string | null>(null);
    const [fileContent, setFileContent] = useState<string>("");
    const [importSummary, setImportSummary] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const importableArtifacts = useMemo(() => {
        return artifacts.filter((a) =>
            a.type === "json" &&
            typeof a.content === "string" &&
            Array.isArray(a.tags) &&
            a.tags.includes("memory:archive"),
        );
    }, [artifacts]);

    const save = useCallback(() => {
        setError(null);
        setImportSummary(null);
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
            onCreated();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, [content, tagsInput, importance, scope, workspaceId, onCreated]);

    const runArchiveImport = useCallback((rawContent: string) => {
        setError(null);
        setImportSummary(null);
        const parsed = parseCollectiveMemoryArchive(rawContent);
        if (!parsed.manifest) {
            setError(`Invalid memory archive: ${parsed.errors.join("; ")}`);
            return;
        }

        const result = importCollectiveMemoryEntries(parsed.manifest.entries, { mode: importMode });
        const summary = `Imported ${result.imported}, updated ${result.updated}, skipped ${result.skipped}.`;
        setImportSummary(summary);

        const archiveArtifact = {
            id: crypto.randomUUID(),
            name: `memory-import-${new Date().toISOString().slice(0, 10)}.json`,
            type: "json" as const,
            content: JSON.stringify(parsed.manifest, null, 2),
            tags: ["type:json", "memory:archive", "memory:collective", "source:import"],
            createdAt: Date.now(),
            description: `Imported collective memory archive (${parsed.manifest.summary.count} entries)`,
            source: "command" as const,
        };
        importArtifact(archiveArtifact);
        onCreated();
    }, [importArtifact, importMode, onCreated]);

    const importFromSelectedArtifact = useCallback(() => {
        setError(null);
        if (!selectedArtifactId) {
            setError("Choose an artifact to import.");
            return;
        }
        const artifact = importableArtifacts.find((a) => a.id === selectedArtifactId);
        if (!artifact || typeof artifact.content !== "string") {
            setError("Selected artifact is missing JSON content.");
            return;
        }
        runArchiveImport(artifact.content);
    }, [selectedArtifactId, importableArtifacts, runArchiveImport]);

    const onPickFile = useCallback(async (evt: React.ChangeEvent<HTMLInputElement>) => {
        setError(null);
        setImportSummary(null);
        const file = evt.target.files?.[0];
        if (!file) return;
        setFileName(file.name);
        try {
            const text = await file.text();
            setFileContent(text);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, []);

    const importFromFile = useCallback(() => {
        if (!fileContent.trim()) {
            setError("Select a JSON file to import.");
            return;
        }
        runArchiveImport(fileContent);
    }, [fileContent, runArchiveImport]);

    return createPortal(
        <div className="memories-modal__backdrop" onClick={onClose}>
            <div className="memories-modal" onClick={e => e.stopPropagation()}>
                <div className="memories-modal__header">
                    <span className="memories-modal__title">Add Memory</span>
                    <button className="memories-modal__close" onClick={onClose} title="Close">
                        <X size={14} />
                    </button>
                </div>
                <div className="memories-modal__body">
                    <div className="memories-modal__tabs">
                        <button
                            className={`memories-modal__tab${mode === "manual" ? " memories-modal__tab--active" : ""}`}
                            onClick={() => setMode("manual")}
                            type="button"
                        >
                            Manual
                        </button>
                        <button
                            className={`memories-modal__tab${mode === "artifact" ? " memories-modal__tab--active" : ""}`}
                            onClick={() => setMode("artifact")}
                            type="button"
                        >
                            Import Artifact
                        </button>
                        <button
                            className={`memories-modal__tab${mode === "file" ? " memories-modal__tab--active" : ""}`}
                            onClick={() => setMode("file")}
                            type="button"
                        >
                            Import File
                        </button>
                    </div>

                    {mode === "manual" && (
                        <>
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
                        </>
                    )}

                    {mode === "artifact" && (
                        <>
                            <label className="memories-modal__label">Archive Artifact</label>
                            <select
                                className="memories-modal__select"
                                value={selectedArtifactId}
                                onChange={(e) => setSelectedArtifactId(e.target.value)}
                            >
                                <option value="">Select memory archive artifact…</option>
                                {importableArtifacts.map((a) => (
                                    <option key={a.id} value={a.id}>{a.name}</option>
                                ))}
                            </select>
                            <label className="memories-modal__label">Import Mode</label>
                            <select
                                className="memories-modal__select"
                                value={importMode}
                                onChange={(e) => setImportMode(e.target.value as "upsert" | "skip-existing")}
                            >
                                <option value="upsert">upsert (update existing by id)</option>
                                <option value="skip-existing">skip-existing (leave existing unchanged)</option>
                            </select>
                            <div className="memories-modal__hint">Only JSON artifacts tagged memory:archive are listed.</div>
                        </>
                    )}

                    {mode === "file" && (
                        <>
                            <label className="memories-modal__label">Archive JSON File</label>
                            <input
                                className="memories-modal__input"
                                type="file"
                                accept="application/json,.json"
                                onChange={onPickFile}
                            />
                            <label className="memories-modal__label">Import Mode</label>
                            <select
                                className="memories-modal__select"
                                value={importMode}
                                onChange={(e) => setImportMode(e.target.value as "upsert" | "skip-existing")}
                            >
                                <option value="upsert">upsert (update existing by id)</option>
                                <option value="skip-existing">skip-existing (leave existing unchanged)</option>
                            </select>
                            {fileName && <div className="memories-modal__hint">Loaded: {fileName}</div>}
                        </>
                    )}

                    {importSummary && <div className="memories-modal__ok">{importSummary}</div>}

                    {error && <div className="memories-modal__error">{error}</div>}
                </div>
                <div className="memories-modal__footer">
                    <button className="memories-modal__btn-secondary" onClick={onClose}>Cancel</button>
                    {mode === "manual" && (
                        <button className="memories-modal__btn-primary" onClick={save}>Save Memory</button>
                    )}
                    {mode === "artifact" && (
                        <button className="memories-modal__btn-primary" onClick={importFromSelectedArtifact}>Import Archive</button>
                    )}
                    {mode === "file" && (
                        <button className="memories-modal__btn-primary" onClick={importFromFile}>Import File</button>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
}

function MemoryCard({
    entry,
    onToggle,
    onDelete,
    onOpen,
}: {
    entry: CollectiveMemoryEntry;
    onToggle: () => void;
    onDelete: () => void;
    onOpen: () => void;
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
                        onClick={onOpen}
                        title="Open memory"
                    >
                        <Maximize2 size={11} />
                    </button>
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

interface DetailModalProps {
    entry: CollectiveMemoryEntry;
    workspaceId: string | null | undefined;
    onClose: () => void;
    onChanged: () => void;
    onDeleted: () => void;
}

const IMPORTANCE_COLORS: Record<number, string> = {
    1: "#64748b",
    2: "#38bdf8",
    3: "#00e5a0",
    4: "#fbbf24",
    5: "#f87171",
};

function MemoryDetailModal({ entry, workspaceId, onClose, onChanged, onDeleted }: DetailModalProps) {
    const { importArtifact } = useJobsContext();
    const backdropRef = useRef<HTMLDivElement>(null);
    const [content, setContent] = useState(entry.content);
    const [tagsInput, setTagsInput] = useState(entry.tags.join(", "));
    const [importance, setImportance] = useState(entry.importance);
    const [scope, setScope] = useState<"workspace" | "global">(entry.scope);
    const [disabled, setDisabled] = useState(!!entry.disabled);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const accent = IMPORTANCE_COLORS[importance] || "#a1a1aa";

    const dirty =
        content !== entry.content ||
        tagsInput !== entry.tags.join(", ") ||
        importance !== entry.importance ||
        scope !== entry.scope ||
        disabled !== !!entry.disabled;

    const save = useCallback(() => {
        const trimmed = content.trim();
        if (!trimmed) {
            setError("Memory content cannot be empty.");
            return;
        }
        try {
            const tags = tagsInput.split(",").map(t => t.trim()).filter(Boolean);
            const updated = updateCollectiveMemory(entry.id, {
                content: trimmed,
                tags,
                importance,
                scope,
                disabled,
            });
            if (!updated) {
                setError("Memory not found — it may have been deleted elsewhere.");
                return;
            }
            onChanged();
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, [entry.id, content, tagsInput, importance, scope, disabled, onChanged, onClose]);

    const doDelete = useCallback(() => {
        forgetCollectiveMemory(entry.id);
        onDeleted();
        onClose();
    }, [entry.id, onDeleted, onClose]);

    const copyMemoryId = useCallback(async () => {
        setError(null);
        try {
            if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(entry.id);
            } else {
                const textarea = document.createElement("textarea");
                textarea.value = entry.id;
                textarea.style.position = "fixed";
                textarea.style.opacity = "0";
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand("copy");
                document.body.removeChild(textarea);
            }
            setNotice("ID copied to clipboard.");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not copy ID.");
        }
    }, [entry.id]);

    const exportToArtifacts = useCallback(() => {
        setError(null);
        setNotice(null);
        const tags = tagsInput.split(",").map(t => t.trim()).filter(Boolean);
        const draftEntry: CollectiveMemoryEntry = {
            ...entry,
            content: content.trim() || entry.content,
            tags,
            importance,
            scope,
            disabled,
            workspaceId: scope === "workspace" ? (workspaceId || entry.workspaceId) : undefined,
            updatedAt: new Date().toISOString(),
        };

        const manifest = buildCollectiveMemoryArchiveManifest({
            workspaceId: workspaceId || undefined,
            filters: {
                query: draftEntry.id,
                scope: draftEntry.scope,
                includeDisabled: true,
                limit: 1,
            },
            entries: [draftEntry],
        });

        const artifact = {
            id: crypto.randomUUID(),
            name: `memory-${draftEntry.id.slice(0, 8)}-archive.json`,
            type: "json" as const,
            content: JSON.stringify(manifest, null, 2),
            tags: [
                "type:json",
                "memory:archive",
                "memory:collective",
                `memory:id:${draftEntry.id}`,
                `scope:${draftEntry.scope}`,
            ],
            createdAt: Date.now(),
            description: `Collective memory export for ${draftEntry.id.slice(0, 8)}…`,
            source: "command" as const,
        };

        importArtifact(artifact);
        setNotice(`Exported to artifact: ${artifact.name}`);
    }, [entry, content, tagsInput, importance, scope, disabled, workspaceId, importArtifact]);

    const tagsPreview = tagsInput.split(",").map(t => t.trim()).filter(Boolean);

    return createPortal(
        <div
            ref={backdropRef}
            className="tc-backdrop"
            onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
        >
            <div className="tc-card mc-card" style={{ "--tc-accent": accent } as React.CSSProperties}>
                <button className="tc-close" onClick={onClose} aria-label="Close">
                    <X size={18} />
                </button>
                <div
                    className="tc-glow"
                    style={{ background: `linear-gradient(135deg, ${accent}40, transparent 60%, ${accent}20)` }}
                />

                {/* Header: icon + power badge */}
                <div className="mc-header">
                    <div className="mc-icon-frame" style={{ borderColor: `${accent}50`, color: accent }}>
                        <Brain size={42} />
                    </div>
                    <div className="tc-power-badge" style={{ background: accent, color: "#000" }}>
                        <Sparkles size={12} />
                        <span>imp {importance}/5</span>
                    </div>
                </div>

                {/* Identity */}
                <div className="tc-identity">
                    <h2 className="tc-name">Collective Memory</h2>
                    <div className="tc-role mc-id-row" style={{ color: accent }}>
                        <span style={{ fontFamily: "var(--font-mono, monospace)", letterSpacing: "0.04em" }}>
                            {entry.id.slice(0, 8)}…
                        </span>
                        <button
                            type="button"
                            className="mc-id-copy"
                            onClick={copyMemoryId}
                            title="Copy memory ID"
                            aria-label="Copy memory ID"
                        >
                            <Copy size={11} />
                        </button>
                    </div>
                    {disabled && (
                        <div className="tc-personality" style={{ borderColor: "rgba(244,67,54,0.4)", color: "#f87171" }}>
                            disabled — excluded from recall
                        </div>
                    )}
                </div>

                {/* Facts ribbon */}
                <div className="tc-facts">
                    <span className="tc-fact-chip" style={{ background: `${accent}12`, borderColor: `${accent}20` }}>
                        {scope === "global" ? <Globe size={10} style={{ marginRight: 4 }} /> : <Folder size={10} style={{ marginRight: 4 }} />}
                        {scope}
                    </span>
                    {entry.sourceAgentName && (
                        <span className="tc-fact-chip" style={{ background: `${accent}12`, borderColor: `${accent}20` }}>
                            <Bot size={10} style={{ marginRight: 4 }} />
                            {entry.sourceAgentName}
                        </span>
                    )}
                </div>

                {/* Content */}
                <div className="mc-section">
                    <div className="tc-section-label">Content</div>
                    <textarea
                        className="mc-textarea"
                        value={content}
                        onChange={e => setContent(e.target.value)}
                        rows={7}
                        style={{ borderColor: `${accent}25` }}
                    />
                </div>

                {/* Tags */}
                <div className="mc-section">
                    <div className="tc-section-label">Tags <span className="mc-hint">(comma-separated)</span></div>
                    <input
                        className="mc-input"
                        value={tagsInput}
                        onChange={e => setTagsInput(e.target.value)}
                        placeholder="preference, ledger, naming…"
                        style={{ borderColor: `${accent}25` }}
                    />
                    {tagsPreview.length > 0 && (
                        <div className="mc-tag-preview">
                            <TagIcon size={10} style={{ color: accent }} />
                            {tagsPreview.map(t => (
                                <span key={t} className="mc-tag" style={{ background: `${accent}15`, color: accent, borderColor: `${accent}30` }}>
                                    {t}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* Settings */}
                <div className="mc-section">
                    <div className="tc-section-label">Settings</div>
                    <div className="mc-settings-grid">
                        <label className="mc-field">
                            <span className="mc-field-label">Importance</span>
                            <select
                                className="mc-select"
                                value={importance}
                                onChange={e => setImportance(Number(e.target.value))}
                                style={{ borderColor: `${accent}25` }}
                            >
                                <option value={1}>1 — trivia</option>
                                <option value={2}>2 — low</option>
                                <option value={3}>3 — normal</option>
                                <option value={4}>4 — high</option>
                                <option value={5}>5 — critical</option>
                            </select>
                        </label>
                        <label className="mc-field">
                            <span className="mc-field-label">Scope</span>
                            <select
                                className="mc-select"
                                value={scope}
                                onChange={e => setScope(e.target.value as "workspace" | "global")}
                                style={{ borderColor: `${accent}25` }}
                            >
                                <option value="workspace">workspace</option>
                                <option value="global">global</option>
                            </select>
                        </label>
                        <label className="mc-field">
                            <span className="mc-field-label">Status</span>
                            <button
                                type="button"
                                className="mc-status-btn"
                                onClick={() => setDisabled(d => !d)}
                                style={{
                                    borderColor: disabled ? "rgba(244,67,54,0.4)" : `${accent}40`,
                                    color: disabled ? "#f87171" : accent,
                                    background: disabled ? "rgba(244,67,54,0.1)" : `${accent}12`,
                                }}
                            >
                                {disabled ? "disabled" : "enabled"}
                            </button>
                        </label>
                    </div>
                </div>

                {error && <div className="mc-error">{error}</div>}
                {notice && <div className="mc-notice">{notice}</div>}

                {/* Footer */}
                <div className="mc-footer">
                    {confirmDelete ? (
                        <>
                            <span className="mc-confirm-text">Permanently delete?</span>
                            <button className="mc-btn mc-btn--ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
                            <button
                                className="mc-btn mc-btn--danger"
                                onClick={doDelete}
                            >
                                <Trash2 size={11} /> Delete
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                className="mc-btn mc-btn--ghost mc-btn--danger-text"
                                onClick={() => setConfirmDelete(true)}
                            >
                                <Trash2 size={11} /> Delete
                            </button>
                            <button
                                className="mc-btn mc-btn--ghost"
                                onClick={exportToArtifacts}
                            >
                                Export to Artifacts
                            </button>
                            <span className="mc-spacer" />
                            <button className="mc-btn mc-btn--ghost" onClick={onClose}>Close</button>
                            <button
                                className="mc-btn mc-btn--primary"
                                onClick={save}
                                disabled={!dirty}
                                style={{
                                    background: dirty ? `${accent}25` : "transparent",
                                    color: dirty ? accent : "var(--text-subtle)",
                                    borderColor: dirty ? `${accent}60` : "var(--border-subtle)",
                                    cursor: dirty ? "pointer" : "not-allowed",
                                    opacity: dirty ? 1 : 0.5,
                                }}
                            >
                                Save
                            </button>
                        </>
                    )}
                </div>

                {/* Timestamps */}
                <div className="mc-meta">
                    <span>created {new Date(entry.createdAt).toLocaleString()}</span>
                    <span>updated {new Date(entry.updatedAt).toLocaleString()}</span>
                </div>
            </div>
        </div>,
        document.body,
    );
}

export function MemoriesPanel({ workspaceId }: MemoriesPanelProps) {
    const { allArtifacts } = useJobsContext();
    const [entries, setEntries] = useState<CollectiveMemoryEntry[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [detailId, setDetailId] = useState<string | null>(null);
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
                        onOpen={() => setDetailId(entry.id)}
                    />
                ))}
                {entries.length > 0 && filtered.length === 0 && (
                    <div className="chat-panel__memories-empty">No memories match “{query}”.</div>
                )}
            </div>

            {showModal && (
                <AddMemoryModal
                    workspaceId={workspaceId}
                    artifacts={allArtifacts}
                    onClose={() => setShowModal(false)}
                    onCreated={handleCreated}
                />
            )}

            {detailId && (() => {
                const detailEntry = entries.find(e => e.id === detailId);
                if (!detailEntry) return null;
                return (
                    <MemoryDetailModal
                        entry={detailEntry}
                        workspaceId={workspaceId}
                        onClose={() => setDetailId(null)}
                        onChanged={refresh}
                        onDeleted={() => { setDetailId(null); refresh(); }}
                    />
                );
            })()}
        </div>
    );
}
