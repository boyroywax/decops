import { useState, useRef, useEffect, useMemo } from "react";
import { X, Gem, Plus, FileText, Image, Code, File, Tag, Layers, Clock, Hash, ChevronRight, Search, Upload, PenLine, ChevronsUp, ChevronsDown } from "lucide-react";
import type { JobArtifact, ArtifactType } from "../../types";
import "../../styles/components/artifacts-panel.css";

/* ─── Types ─────────────────────────────────────────────────────────── */

type GroupBy = "none" | "type" | "source" | "tag";

interface ArtifactsPanelProps {
    artifacts: JobArtifact[];
    importArtifact: (artifact: JobArtifact) => void;
    removeArtifact: (id: string) => void;
    updateArtifact: (id: string, updates: Partial<JobArtifact>) => void;
    onClose: () => void;
    height: number;
    setHeight: (h: number) => void;
    isExpanded: boolean;
    onToggleExpand: () => void;
}

/* ─── Helpers ───────────────────────────────────────────────────────── */

function getIcon(type: string, size = 14) {
    switch (type) {
        case "markdown": return <FileText size={size} />;
        case "json": return <Code size={size} />;
        case "yaml": return <Code size={size} />;
        case "image": return <Image size={size} />;
        case "code": return <Code size={size} />;
        case "csv": return <Hash size={size} />;
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
        default: return "#9ca3af";
    }
}

function inferTypeFromName(name: string): ArtifactType {
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    const map: Record<string, ArtifactType> = {
        md: "markdown", json: "json", yaml: "yaml", yml: "yaml",
        csv: "csv", ts: "code", js: "code", py: "code", rs: "code",
        png: "image", jpg: "image", jpeg: "image", gif: "image", svg: "image", webp: "image",
    };
    return map[ext] ?? "markdown";
}

function formatDate(ts?: number) {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " +
        d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** Extract all unique tags from artifacts */
function collectTags(artifacts: JobArtifact[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const a of artifacts) {
        if (a.tags) {
            for (const t of a.tags) {
                map.set(t, (map.get(t) ?? 0) + 1);
            }
        }
    }
    return map;
}

/** Group artifacts by a key function — preserves order within groups */
function groupArtifacts(arts: JobArtifact[], by: GroupBy): [string, JobArtifact[]][] {
    if (by === "none") return [["", arts]];

    const groups = new Map<string, JobArtifact[]>();
    for (const a of arts) {
        let keys: string[];
        if (by === "type") keys = [a.type ?? "other"];
        else if (by === "source") keys = [a.source ?? "unknown"];
        else /* tag */ keys = a.tags?.length ? a.tags : ["untagged"];

        for (const k of keys) {
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k)!.push(a);
        }
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

/* ═══════════════════════════════════════════════════════════════════════
 * CREATE ARTIFACT MODAL
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
        const tags = tagInput
            .split(",")
            .map(t => t.trim())
            .filter(Boolean);
        tags.push(`type:${type}`);

        onCreate({
            id: `art-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            name: name.trim(),
            type,
            content: content || "",
            tags,
            description: description || undefined,
            source: "user",
        });
        onClose();
    };

    return (
        <div className="ap-modal-overlay" onClick={onClose}>
            <div className="ap-modal" onClick={e => e.stopPropagation()}>
                <div className="ap-modal__header">
                    <span className="ap-modal__title"><PenLine size={12} /> New Artifact</span>
                    <button onClick={onClose} className="ap-modal__close"><X size={14} /></button>
                </div>
                <div className="ap-modal__body">
                    <label className="ap-modal__label">
                        Name
                        <input className="ap-modal__input" value={name} onChange={e => setName(e.target.value)} placeholder="report.md" autoFocus />
                    </label>
                    <label className="ap-modal__label">
                        Type
                        <select className="ap-modal__select" value={type} onChange={e => setType(e.target.value as ArtifactType)}>
                            <option value="markdown">Markdown</option>
                            <option value="json">JSON</option>
                            <option value="yaml">YAML</option>
                            <option value="code">Code</option>
                            <option value="csv">CSV</option>
                            <option value="image">Image</option>
                        </select>
                    </label>
                    <label className="ap-modal__label">
                        Tags <span className="ap-modal__hint">(comma-separated)</span>
                        <input className="ap-modal__input" value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder="source:manual, project:alpha" />
                    </label>
                    <label className="ap-modal__label">
                        Description
                        <input className="ap-modal__input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" />
                    </label>
                    <label className="ap-modal__label">
                        Content
                        <textarea className="ap-modal__textarea" value={content} onChange={e => setContent(e.target.value)} placeholder="Artifact content…" rows={6} />
                    </label>
                </div>
                <div className="ap-modal__footer">
                    <button className="ap-modal__btn ap-modal__btn--cancel" onClick={onClose}>Cancel</button>
                    <button className="ap-modal__btn ap-modal__btn--create" onClick={handleSubmit} disabled={!name.trim()}>Create</button>
                </div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════
 * MAIN COMPONENT
 * ═══════════════════════════════════════════════════════════════════════ */

export function ArtifactsPanel({ artifacts, importArtifact, removeArtifact, updateArtifact, onClose, height, setHeight, isExpanded, onToggleExpand }: ArtifactsPanelProps) {
    const [isResizing, setIsResizing] = useState(false);
    const [search, setSearch] = useState("");
    const [selectedArtifact, setSelectedArtifact] = useState<JobArtifact | null>(null);
    const [groupBy, setGroupBy] = useState<GroupBy>("none");
    const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showTagSidebar, setShowTagSidebar] = useState(true);
    const fileInputRef = useRef<HTMLInputElement>(null);

    /* ── Resize ───────────────────────────────────────────────────── */
    const startResizing = (e: React.MouseEvent) => { e.preventDefault(); setIsResizing(true); };
    const stopResizing = () => setIsResizing(false);
    const resize = (e: MouseEvent) => {
        if (isResizing) {
            const h = window.innerHeight - e.clientY;
            if (h > 220 && h < window.innerHeight - 50) {
                setHeight(h);
            }
        }
    };

    useEffect(() => {
        if (isResizing) {
            window.addEventListener("mousemove", resize);
            window.addEventListener("mouseup", stopResizing);
        }
        return () => { window.removeEventListener("mousemove", resize); window.removeEventListener("mouseup", stopResizing); };
    }, [isResizing]);

    /* ── Derived data ─────────────────────────────────────────────── */
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
            const newArtifact: JobArtifact = {
                id: `imported-${Date.now()}`,
                type,
                name: file.name,
                url: isImage ? content : undefined,
                content: isImage ? undefined : content,
                tags: [`type:${type}`, "source:import"],
                source: "import",
            };
            importArtifact(newArtifact);
        };
        if (isImage) reader.readAsDataURL(file); else reader.readAsText(file);
        e.target.value = "";
    };

    /* ── Actions ──────────────────────────────────────────────────── */
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

    const handleDelete = () => {
        if (selectedArtifact) {
            removeArtifact(selectedArtifact.id);
            setSelectedArtifact(null);
        }
    };

    const handleCreate = (a: JobArtifact) => {
        importArtifact(a);
    };

    /* ── Render ───────────────────────────────────────────────────── */
    return (
        <div className={`artifacts-panel${isResizing ? " artifacts-panel--resizing" : ""}`} style={{ height }}>
            <input type="file" ref={fileInputRef} style={{ display: "none" }} onChange={handleFileChange} />

            {/* Resize Handle */}
            <div onMouseDown={startResizing} className="artifacts-panel__resize-handle">
                <div className="artifacts-panel__resize-grip" />
            </div>

            {/* Header */}
            <div className="artifacts-panel__header">
                <div className="artifacts-panel__header-left">
                    <span className="artifacts-panel__title">
                        <Gem size={10} color="#818cf8" /> ARTIFACTS
                    </span>
                    <span className="artifacts-panel__separator">│</span>
                    <span className="artifacts-panel__count">{artifacts.length} items</span>
                </div>
                <div className="artifacts-panel__header-actions">
                    <button
                        onClick={() => setShowTagSidebar(!showTagSidebar)}
                        className={`artifacts-panel__icon-btn${showTagSidebar ? " artifacts-panel__icon-btn--active" : ""}`}
                        title="Toggle tag sidebar"
                    >
                        <Tag size={12} />
                    </button>
                    <button
                        onClick={onToggleExpand}
                        className="artifacts-panel__expand-btn"
                        title={isExpanded ? "Collapse panel" : "Expand panel"}
                    >
                        {isExpanded ? <ChevronsDown size={14} /> : <ChevronsUp size={14} />}
                    </button>
                    <button onClick={onClose} className="artifacts-panel__close-btn" title="Close artifacts">
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Toolbar */}
            <div className="artifacts-panel__toolbar">
                <div className="artifacts-panel__search-wrap">
                    <Search size={11} className="artifacts-panel__search-icon" />
                    <input
                        type="text"
                        placeholder="Search name, tag, description..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="artifacts-panel__search"
                    />
                </div>

                {/* Group-by selector */}
                <div className="artifacts-panel__group-by">
                    <Layers size={10} />
                    <select
                        value={groupBy}
                        onChange={e => setGroupBy(e.target.value as GroupBy)}
                        className="artifacts-panel__filter"
                    >
                        <option value="none">No Grouping</option>
                        <option value="type">By Type</option>
                        <option value="source">By Source</option>
                        <option value="tag">By Tag</option>
                    </select>
                </div>

                <button onClick={() => fileInputRef.current?.click()} className="artifacts-panel__import-btn" title="Import file">
                    <Upload size={10} /> Import
                </button>
                <button onClick={() => setShowCreateModal(true)} className="artifacts-panel__create-btn" title="Create artifact">
                    <Plus size={10} /> New
                </button>
            </div>

            {/* Active tag filter pill */}
            {activeTagFilter && (
                <div className="artifacts-panel__active-filter">
                    <Tag size={10} />
                    <span>{activeTagFilter}</span>
                    <button onClick={() => setActiveTagFilter(null)} className="artifacts-panel__active-filter-clear">
                        <X size={10} />
                    </button>
                </div>
            )}

            {/* Content */}
            <div className="artifacts-panel__content">
                {/* Tag sidebar */}
                {showTagSidebar && tagMap.size > 0 && (
                    <div className="artifacts-panel__tags-sidebar">
                        <div className="artifacts-panel__tags-title">TAGS</div>
                        <button
                            className={`artifacts-panel__tag-item${!activeTagFilter ? " artifacts-panel__tag-item--active" : ""}`}
                            onClick={() => setActiveTagFilter(null)}
                        >
                            <span className="artifacts-panel__tag-name">All</span>
                            <span className="artifacts-panel__tag-count">{artifacts.length}</span>
                        </button>
                        {Array.from(tagMap.entries())
                            .sort((a, b) => b[1] - a[1])
                            .map(([tag, count]) => (
                                <button
                                    key={tag}
                                    className={`artifacts-panel__tag-item${activeTagFilter === tag ? " artifacts-panel__tag-item--active" : ""}`}
                                    onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)}
                                >
                                    <span className="artifacts-panel__tag-name">{tag}</span>
                                    <span className="artifacts-panel__tag-count">{count}</span>
                                </button>
                            ))}
                    </div>
                )}

                {/* File grid with optional grouping */}
                <div className="artifacts-panel__grid-area">
                    {filteredArtifacts.length === 0 && (
                        <div className="artifacts-panel__empty">
                            {search || activeTagFilter ? "No matching artifacts." : "No artifacts yet. Import a file or create one."}
                        </div>
                    )}
                    {grouped.map(([groupLabel, items]) => (
                        <div key={groupLabel || "__all"} className="artifacts-panel__group">
                            {groupLabel && (
                                <div className="artifacts-panel__group-header">
                                    <ChevronRight size={10} />
                                    <span>{groupLabel}</span>
                                    <span className="artifacts-panel__group-count">{items.length}</span>
                                </div>
                            )}
                            <div className="artifacts-panel__grid">
                                {items.map(art => (
                                    <div
                                        key={art.id}
                                        onClick={() => setSelectedArtifact(art)}
                                        className={`artifacts-panel__card${selectedArtifact?.id === art.id ? " artifacts-panel__card--selected" : ""}`}
                                    >
                                        <div
                                            className="artifacts-panel__card-icon"
                                            style={{ background: getIconColor(art.type) + "20", color: getIconColor(art.type) }}
                                        >
                                            {getIcon(art.type)}
                                        </div>
                                        <div className="artifacts-panel__card-info">
                                            <div className="artifacts-panel__card-name">{art.name}</div>
                                            <div className="artifacts-panel__card-meta">
                                                <span className="artifacts-panel__card-type">{art.type}</span>
                                                {art.createdAt && <span className="artifacts-panel__card-date">{formatDate(art.createdAt)}</span>}
                                            </div>
                                            {art.tags && art.tags.length > 0 && (
                                                <div className="artifacts-panel__card-tags">
                                                    {art.tags.slice(0, 3).map(t => (
                                                        <span key={t} className="artifacts-panel__chip" onClick={e => { e.stopPropagation(); setActiveTagFilter(t); }}>{t}</span>
                                                    ))}
                                                    {art.tags.length > 3 && <span className="artifacts-panel__chip artifacts-panel__chip--more">+{art.tags.length - 3}</span>}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Preview sidebar */}
                {selectedArtifact && (
                    <div className="artifacts-panel__preview">
                        <div className="artifacts-panel__preview-header">
                            <div className="artifacts-panel__preview-title">{selectedArtifact.name}</div>
                            <button onClick={() => setSelectedArtifact(null)} className="artifacts-panel__preview-close">
                                <X size={12} />
                            </button>
                        </div>

                        {/* Preview metadata */}
                        <div className="artifacts-panel__preview-meta">
                            {selectedArtifact.source && (
                                <span className="artifacts-panel__preview-badge">{selectedArtifact.source}</span>
                            )}
                            <span className="artifacts-panel__preview-badge">{selectedArtifact.type}</span>
                            {selectedArtifact.createdAt && (
                                <span className="artifacts-panel__preview-date">
                                    <Clock size={9} /> {formatDate(selectedArtifact.createdAt)}
                                </span>
                            )}
                        </div>

                        {selectedArtifact.description && (
                            <div className="artifacts-panel__preview-desc">{selectedArtifact.description}</div>
                        )}

                        {/* Preview tags */}
                        {selectedArtifact.tags && selectedArtifact.tags.length > 0 && (
                            <div className="artifacts-panel__preview-tags">
                                {selectedArtifact.tags.map(t => (
                                    <span key={t} className="artifacts-panel__chip" onClick={() => { setActiveTagFilter(t); setSelectedArtifact(null); }}>{t}</span>
                                ))}
                            </div>
                        )}

                        <div className="artifacts-panel__preview-body">
                            {selectedArtifact.type === "image" ? (
                                <img src={selectedArtifact.url} alt={selectedArtifact.name} className="artifacts-panel__preview-img" />
                            ) : (
                                <pre className="artifacts-panel__preview-code">
                                    {typeof selectedArtifact.content === "string"
                                        ? selectedArtifact.content.slice(0, 5000)
                                        : JSON.stringify(selectedArtifact.content, null, 2)}
                                </pre>
                            )}
                        </div>
                        <div className="artifacts-panel__preview-actions">
                            <button onClick={handleDownload} className="artifacts-panel__btn artifacts-panel__btn--download">
                                Download
                            </button>
                            <button onClick={handleDelete} className="artifacts-panel__btn artifacts-panel__btn--delete">
                                Delete
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Create modal */}
            {showCreateModal && (
                <CreateArtifactModal
                    onClose={() => setShowCreateModal(false)}
                    onCreate={handleCreate}
                />
            )}
        </div>
    );
}
