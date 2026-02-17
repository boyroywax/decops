import { useState, useRef, useEffect } from "react";
import { X, Gem, Plus, FileText, Image, Code, File } from "lucide-react";
import type { JobArtifact } from "../../types";
import "../../styles/components/artifacts-panel.css";

interface ArtifactsPanelProps {
    artifacts: JobArtifact[];
    importArtifact: (artifact: JobArtifact) => void;
    removeArtifact: (id: string) => void;
    onClose: () => void;
}

export function ArtifactsPanel({ artifacts, importArtifact, removeArtifact, onClose }: ArtifactsPanelProps) {
    const [height, setHeight] = useState(400);
    const [isResizing, setIsResizing] = useState(false);
    const [filter, setFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [selectedArtifact, setSelectedArtifact] = useState<JobArtifact | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Resize logic (same pattern as ActionManager)
    const startResizing = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
    };

    const stopResizing = () => setIsResizing(false);

    const resize = (e: MouseEvent) => {
        if (isResizing) {
            const newHeight = window.innerHeight - e.clientY;
            if (newHeight > 200 && newHeight < window.innerHeight - 50) {
                setHeight(newHeight);
            }
        }
    };

    useEffect(() => {
        if (isResizing) {
            window.addEventListener("mousemove", resize);
            window.addEventListener("mouseup", stopResizing);
        }
        return () => {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResizing);
        };
    }, [isResizing]);

    // Filter artifacts
    const filteredArtifacts = artifacts.filter(art => {
        const matchesFilter = filter === "all" || art.type === filter;
        const matchesSearch = art.name.toLowerCase().includes(search.toLowerCase());
        return matchesFilter && matchesSearch;
    });

    // Import handler
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const isImage = file.type.startsWith("image/");
        const reader = new FileReader();

        reader.onload = (event) => {
            const content = event.target?.result as string;
            const newArtifact: JobArtifact = {
                id: `imported-${Date.now()}`,
                type: isImage ? "image" : "markdown",
                name: file.name,
                url: isImage ? content : undefined,
                content: isImage ? undefined : content
            };

            if (!isImage) {
                if (file.name.endsWith(".json")) newArtifact.type = "json";
                else if (file.name.endsWith(".yaml") || file.name.endsWith(".yml")) newArtifact.type = "yaml";
                else if (file.name.endsWith(".csv")) newArtifact.type = "csv";
                else if (file.name.endsWith(".ts") || file.name.endsWith(".js") || file.name.endsWith(".py")) newArtifact.type = "code";
            }

            importArtifact(newArtifact);
        };

        if (isImage) {
            reader.readAsDataURL(file);
        } else {
            reader.readAsText(file);
        }

        e.target.value = "";
    };

    const handleDownload = () => {
        if (!selectedArtifact) return;
        const link = document.createElement("a");
        link.download = selectedArtifact.name;

        if (selectedArtifact.url) {
            link.href = selectedArtifact.url;
        } else if (selectedArtifact.content) {
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
                    <span style={{ fontSize: 10, color: "#71717a" }}>{artifacts.length} items</span>
                </div>
                <button onClick={onClose} className="artifacts-panel__close-btn" title="Close artifacts">
                    <X size={14} />
                </button>
            </div>

            {/* Toolbar */}
            <div className="artifacts-panel__toolbar">
                <input
                    type="text"
                    placeholder="Search artifacts..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="artifacts-panel__search"
                />
                <select
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    className="artifacts-panel__filter"
                >
                    <option value="all">All</option>
                    <option value="markdown">Markdown</option>
                    <option value="json">JSON</option>
                    <option value="image">Image</option>
                    <option value="code">Code</option>
                </select>
                <button onClick={() => fileInputRef.current?.click()} className="artifacts-panel__import-btn">
                    <Plus size={10} /> Import
                </button>
            </div>

            {/* Content */}
            <div className="artifacts-panel__content">
                <div className="artifacts-panel__grid">
                    {filteredArtifacts.length === 0 && (
                        <div className="artifacts-panel__empty">
                            No artifacts found.
                        </div>
                    )}
                    {filteredArtifacts.map(art => (
                        <div
                            key={art.id}
                            onClick={() => setSelectedArtifact(art)}
                            className={`artifacts-panel__card${selectedArtifact?.id === art.id ? " artifacts-panel__card--selected" : ""}`}
                        >
                            <div
                                className="artifacts-panel__card-icon"
                                style={{
                                    background: getIconColor(art.type) + "20",
                                    color: getIconColor(art.type),
                                }}
                            >
                                {getIcon(art.type)}
                            </div>
                            <div className="artifacts-panel__card-info">
                                <div className="artifacts-panel__card-name">{art.name}</div>
                                <div className="artifacts-panel__card-type">{art.type}</div>
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
        </div>
    );
}

function getIcon(type: string) {
    switch (type) {
        case "markdown": return <FileText size={14} />;
        case "json": return <Code size={14} />;
        case "image": return <Image size={14} />;
        case "code": return <Code size={14} />;
        default: return <File size={14} />;
    }
}

function getIconColor(type: string) {
    switch (type) {
        case "markdown": return "#38bdf8";
        case "json": return "#fbbf24";
        case "image": return "#f472b6";
        case "code": return "#a78bfa";
        default: return "#9ca3af";
    }
}
