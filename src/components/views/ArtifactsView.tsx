import { useState, useRef, useMemo, useEffect } from "react";
import type { JobArtifact, ArtifactType } from "../../types";
import { SectionTitle } from "../shared/ui";
import { FileText, Image, Code, File, X, Plus, Tag, Layers, Clock, Hash, ChevronRight, Search, Upload, PenLine } from "lucide-react";
import { useDeleteConfirm } from "../../hooks/useDeleteConfirm";
import { DeleteConfirmInline } from "../shared/DeleteConfirmInline";
import "../../styles/components/artifacts.css";

/* ─── Types ─────────────────────────────────────────────────────────── */

type GroupBy = "none" | "type" | "source" | "tag";

interface ArtifactsViewProps {
    artifacts: JobArtifact[];
    importArtifact: (artifact: JobArtifact) => void;
    removeArtifact: (id: string) => void;
    updateArtifact: (id: string, updates: Partial<JobArtifact>) => void;
    /** If provided, auto-select this artifact on mount */
    initialSelectedId?: string;
}

/* ─── Helpers ───────────────────────────────────────────────────────── */

function getIcon(type: string, size = 18) {
    switch (type) {
        case "markdown": return <FileText size={size} />;
        case "json": return <Code size={size} />;
        case "yaml": return <Code size={size} />;
        case "image": return <Image size={size} />;
        case "code": return <Code size={size} />;
        case "csv": return <Hash size={size} />;
        case "txt": return <FileText size={size} />;
        default: return <File size={size} />;
    }
}

function getIconColor(type: string) {
    switch (type) {
        case "markdown": return "#38bdf8";
        case "json": return "#fbbf24";
        case "yaml": return "#fb923c";
        case "image": return "#f472b6";
        case "code": return "#a78bfa";
        case "csv": return "#34d399";
        case "txt": return "#94a3b8";
        default: return "#9ca3af";
    }
}

function inferTypeFromName(name: string): ArtifactType {
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    const map: Record<string, ArtifactType> = {
        md: "markdown", json: "json", yaml: "yaml", yml: "yaml",
        csv: "csv", ts: "code", js: "code", py: "code", rs: "code",
        png: "image", jpg: "image", jpeg: "image", gif: "image", svg: "image", webp: "image",
        txt: "txt", text: "txt", log: "txt", sh: "txt", bash: "txt",
        zsh: "txt", env: "txt", cfg: "txt", conf: "txt", ini: "txt",
        toml: "txt", properties: "txt", gitignore: "txt", dockerignore: "txt",
        editorconfig: "txt", makefile: "txt", dockerfile: "txt",
    };
    return map[ext] ?? "markdown";
}

function formatDate(ts?: number) {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " +
        d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function collectTags(artifacts: JobArtifact[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const a of artifacts) {
        if (a.tags) for (const t of a.tags) map.set(t, (map.get(t) ?? 0) + 1);
    }
    return map;
}

function groupArtifacts(arts: JobArtifact[], by: GroupBy): [string, JobArtifact[]][] {
    if (by === "none") return [["", arts]];
    const groups = new Map<string, JobArtifact[]>();
    for (const a of arts) {
        let keys: string[];
        if (by === "type") keys = [a.type ?? "other"];
        else if (by === "source") keys = [a.source ?? "unknown"];
        else keys = a.tags?.length ? a.tags : ["untagged"];
        for (const k of keys) { if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(a); }
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

/* ═══════════════════════════════════════════════════════════════════════
 * CREATE ARTIFACT MODAL (full-page variant)
 * ═══════════════════════════════════════════════════════════════════════ */

function CreateArtifactModal({ onClose, onCreate }: {
    onClose: () => void;
    onCreate: (a: JobArtifact) => void;
}) {
    const [name, setName] = useState("");
    const [type, setType] = useState<ArtifactType>("markdown");
    const [content, setContent] = useState("");
    const [description, setDescription] = useState("");
    const [tagInput, setTagInput] = useState("");

    const handleSubmit = () => {
        if (!name.trim()) return;
        const tags = tagInput.split(",").map(t => t.trim()).filter(Boolean);
        tags.push(`type:${type}`);
        onCreate({
            id: crypto.randomUUID(),
            name: name.trim(), type, content: content || "",
            tags, createdAt: Date.now(), description: description || undefined, source: "user",
        });
        onClose();
    };

    return (
        <div className="av-modal-overlay" onClick={onClose}>
            <div className="av-modal" onClick={e => e.stopPropagation()}>
                <div className="av-modal__header">
                    <span className="av-modal__title"><PenLine size={14} /> Create Artifact</span>
                    <button onClick={onClose} className="av-modal__close"><X size={16} /></button>
                </div>
                <div className="av-modal__body">
                    <label className="av-modal__label">Name
                        <input className="av-modal__input" value={name} onChange={e => setName(e.target.value)} placeholder="report.md" autoFocus />
                    </label>
                    <div className="av-modal__row">
                        <label className="av-modal__label">Type
                            <select className="av-modal__select" value={type} onChange={e => setType(e.target.value as ArtifactType)}>
                                <option value="markdown">Markdown</option>
                                <option value="json">JSON</option>
                                <option value="yaml">YAML</option>
                                <option value="code">Code</option>
                                <option value="csv">CSV</option>
                                <option value="txt">Plain Text</option>
                                <option value="image">Image</option>
                            </select>
                        </label>
                        <label className="av-modal__label">Tags <span className="av-modal__hint">(comma-separated)</span>
                            <input className="av-modal__input" value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder="source:manual, project:alpha" />
                        </label>
                    </div>
                    <label className="av-modal__label">Description
                        <input className="av-modal__input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" />
                    </label>
                    <label className="av-modal__label">Content
                        <textarea className="av-modal__textarea" value={content} onChange={e => setContent(e.target.value)} placeholder="Artifact content…" rows={10} />
                    </label>
                </div>
                <div className="av-modal__footer">
                    <button className="av-modal__btn av-modal__btn--cancel" onClick={onClose}>Cancel</button>
                    <button className="av-modal__btn av-modal__btn--create" onClick={handleSubmit} disabled={!name.trim()}>Create</button>
                </div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════
 * MAIN COMPONENT
 * ═══════════════════════════════════════════════════════════════════════ */

export function ArtifactsView({ artifacts, importArtifact, removeArtifact, updateArtifact, initialSelectedId }: ArtifactsViewProps) {
    const [search, setSearch] = useState("");
    const [groupBy, setGroupBy] = useState<GroupBy>("none");
    const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
    const [selectedArtifact, setSelectedArtifact] = useState<JobArtifact | null>(() => {
        if (initialSelectedId) {
            return artifacts.find(a => a.id === initialSelectedId) || null;
        }
        return null;
    });
    const [showCreateModal, setShowCreateModal] = useState(false);
    const del = useDeleteConfirm();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Auto-select when initialSelectedId changes (e.g. navigated from messages)
    useEffect(() => {
        if (initialSelectedId) {
            const art = artifacts.find(a => a.id === initialSelectedId);
            if (art) setSelectedArtifact(art);
        }
    }, [initialSelectedId, artifacts]);

    const tagMap = useMemo(() => collectTags(artifacts), [artifacts]);

    const filteredArtifacts = useMemo(() => {
        return artifacts.filter(art => {
            const matchesSearch = !search || art.name.toLowerCase().includes(search.toLowerCase()) ||
                art.description?.toLowerCase().includes(search.toLowerCase()) ||
                art.tags?.some(t => t.toLowerCase().includes(search.toLowerCase()));
            const matchesTag = !activeTagFilter || art.tags?.includes(activeTagFilter);
            return matchesSearch && matchesTag;
        });
    }, [artifacts, search, activeTagFilter]);

    const grouped = useMemo(() => groupArtifacts(filteredArtifacts, groupBy), [filteredArtifacts, groupBy]);

    /* ── Import handler ───────────────────────────────────────────── */
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const isImage = file.type.startsWith("image/");
        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            const type = isImage ? "image" : inferTypeFromName(file.name);
            importArtifact({
                id: `imported-${Date.now()}`, type, name: file.name,
                url: isImage ? content : undefined,
                content: isImage ? undefined : content,
                tags: [`type:${type}`, "source:import"], source: "import",
            });
        };
        if (isImage) reader.readAsDataURL(file); else reader.readAsText(file);
        e.target.value = "";
    };

    const handleDelete = () => {
        if (selectedArtifact) { removeArtifact(selectedArtifact.id); setSelectedArtifact(null); }
    };

    const handleDownload = () => {
        if (!selectedArtifact) return;
        const link = document.createElement("a");
        link.download = selectedArtifact.name;
        if (selectedArtifact.url) link.href = selectedArtifact.url;
        else if (selectedArtifact.content) {
            const blob = new Blob([selectedArtifact.content], { type: "text/plain" });
            link.href = URL.createObjectURL(blob);
        } else return;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        if (!selectedArtifact.url) URL.revokeObjectURL(link.href);
    };

    return (
        <div className="artifacts">
            <input type="file" ref={fileInputRef} style={{ display: "none" }} onChange={handleFileChange} />

            {/* Header */}
            <div className="artifacts__header">
                <div>
                    <SectionTitle text="Artifacts Explorer" />
                    <div className="artifacts__subtitle">
                        Tag-based file explorer for generated and imported artifacts.
                    </div>
                </div>
                <div className="artifacts__header-actions">
                    <button onClick={() => fileInputRef.current?.click()} className="btn btn-secondary">
                        <Upload size={14} /> Import
                    </button>
                    <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
                        <Plus size={14} /> New Artifact
                    </button>
                </div>
            </div>

            {/* Toolbar */}
            <div className="artifacts__toolbar">
                <div className="artifacts__search-wrap">
                    <Search size={13} className="artifacts__search-icon" />
                    <input
                        type="text"
                        placeholder="Search name, tag, description..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="artifacts__search"
                    />
                </div>
                <div className="artifacts__group-by">
                    <Layers size={12} />
                    <select value={groupBy} onChange={e => setGroupBy(e.target.value as GroupBy)} className="artifacts__filter">
                        <option value="none">No Grouping</option>
                        <option value="type">By Type</option>
                        <option value="source">By Source</option>
                        <option value="tag">By Tag</option>
                    </select>
                </div>
            </div>

            {/* Active tag filter */}
            {activeTagFilter && (
                <div className="artifacts__active-filter">
                    <Tag size={12} />
                    <span>Filtered by: {activeTagFilter}</span>
                    <button onClick={() => setActiveTagFilter(null)} className="artifacts__active-filter-clear">
                        <X size={12} /> Clear
                    </button>
                </div>
            )}

            {/* Main Content Area */}
            <div className="artifacts__content">
                {/* Tag sidebar */}
                {tagMap.size > 0 && (
                    <div className="artifacts__tags-sidebar">
                        <div className="artifacts__tags-title">Tags</div>
                        <button
                            className={`artifacts__tag-item${!activeTagFilter ? " artifacts__tag-item--active" : ""}`}
                            onClick={() => setActiveTagFilter(null)}
                        >
                            <span className="artifacts__tag-name">All artifacts</span>
                            <span className="artifacts__tag-count">{artifacts.length}</span>
                        </button>
                        {Array.from(tagMap.entries())
                            .sort((a, b) => b[1] - a[1])
                            .map(([tag, count]) => (
                                <button
                                    key={tag}
                                    className={`artifacts__tag-item${activeTagFilter === tag ? " artifacts__tag-item--active" : ""}`}
                                    onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)}
                                >
                                    <span className="artifacts__tag-name">{tag}</span>
                                    <span className="artifacts__tag-count">{count}</span>
                                </button>
                            ))}
                    </div>
                )}

                {/* File grid with grouping */}
                <div className="artifacts__grid-area">
                    {filteredArtifacts.length === 0 && (
                        <div className="artifacts__empty">
                            {search || activeTagFilter ? "No matching artifacts." : "No artifacts yet. Import a file or create one."}
                        </div>
                    )}
                    {grouped.map(([groupLabel, items]) => (
                        <div key={groupLabel || "__all"} className="artifacts__group">
                            {groupLabel && (
                                <div className="artifacts__group-header">
                                    <ChevronRight size={12} />
                                    <span>{groupLabel}</span>
                                    <span className="artifacts__group-count">{items.length}</span>
                                </div>
                            )}
                            <div className="artifacts__grid">
                                {items.map(art => (
                                    <div
                                        key={art.id}
                                        onClick={() => setSelectedArtifact(art)}
                                        className={`artifact-card${selectedArtifact?.id === art.id ? " artifact-card--selected" : ""}`}
                                    >
                                        <div className="artifact-card__header">
                                            <div
                                                className="artifact-card__icon"
                                                style={{ background: getIconColor(art.type) + "20", color: getIconColor(art.type) }}
                                            >
                                                {getIcon(art.type)}
                                            </div>
                                            <div className="artifact-card__info">
                                                <div className="artifact-card__name">{art.name}</div>
                                                <div className="artifact-card__meta">
                                                    <span className="artifact-card__type">{art.type.toUpperCase()}</span>
                                                    {art.createdAt && <span className="artifact-card__date">{formatDate(art.createdAt)}</span>}
                                                </div>
                                            </div>
                                        </div>
                                        {art.tags && art.tags.length > 0 && (
                                            <div className="artifact-card__tags">
                                                {art.tags.slice(0, 4).map(t => (
                                                    <span key={t} className="artifact-card__chip" onClick={e => { e.stopPropagation(); setActiveTagFilter(t); }}>{t}</span>
                                                ))}
                                                {art.tags.length > 4 && <span className="artifact-card__chip artifact-card__chip--more">+{art.tags.length - 4}</span>}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Preview */}
                {selectedArtifact && (
                    <div className="artifacts__preview">
                        <div className="artifacts__preview-header">
                            <div className="artifacts__preview-title">{selectedArtifact.name}</div>
                            <button onClick={() => setSelectedArtifact(null)} className="artifacts__preview-close"><X size={16} /></button>
                        </div>

                        <div className="artifacts__preview-meta">
                            {selectedArtifact.source && <span className="artifacts__preview-badge">{selectedArtifact.source}</span>}
                            <span className="artifacts__preview-badge">{selectedArtifact.type}</span>
                            {selectedArtifact.createdAt && (
                                <span className="artifacts__preview-date"><Clock size={11} /> {formatDate(selectedArtifact.createdAt)}</span>
                            )}
                        </div>

                        {selectedArtifact.description && (
                            <div className="artifacts__preview-desc">{selectedArtifact.description}</div>
                        )}

                        {selectedArtifact.tags && selectedArtifact.tags.length > 0 && (
                            <div className="artifacts__preview-tags">
                                {selectedArtifact.tags.map(t => (
                                    <span key={t} className="artifact-card__chip" onClick={() => { setActiveTagFilter(t); setSelectedArtifact(null); }}>{t}</span>
                                ))}
                            </div>
                        )}

                        <div className="artifacts__preview-body">
                            {selectedArtifact.type === "image" ? (
                                <img src={selectedArtifact.url} alt={selectedArtifact.name} className="artifacts__preview-img" />
                            ) : (
                                <pre className="artifacts__preview-code">
                                    {typeof selectedArtifact.content === "string" ? selectedArtifact.content.slice(0, 5000) : JSON.stringify(selectedArtifact.content, null, 2)}
                                </pre>
                            )}
                        </div>

                        <div className="artifacts__preview-actions">
                            <button onClick={handleDownload} className="artifacts__btn-download">Download</button>
                            {del.isPending(selectedArtifact.id) ? (
                                <DeleteConfirmInline entityName="Artifact" entityLabel={selectedArtifact.name} warning="This artifact will be permanently deleted." onConfirm={() => del.confirm(handleDelete)} onCancel={del.cancel} compact />
                            ) : (
                                <button onClick={() => del.requestDelete(selectedArtifact.id)} className="artifacts__btn-delete">Delete</button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {showCreateModal && (
                <CreateArtifactModal
                    onClose={() => setShowCreateModal(false)}
                    onCreate={a => importArtifact(a)}
                />
            )}
        </div>
    );
}
