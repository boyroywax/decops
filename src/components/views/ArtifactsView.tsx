import { useState, useRef } from "react";
import type { JobArtifact } from "../../types";
import { SectionTitle } from "../shared/ui";
import { FileText, Image, Code, File, X, Plus } from "lucide-react";
import "../../styles/components/artifacts.css";

interface ArtifactsViewProps {
    artifacts: JobArtifact[];
    importArtifact: (artifact: JobArtifact) => void;
    removeArtifact: (id: string) => void;
}

export function ArtifactsView({ artifacts, importArtifact, removeArtifact }: ArtifactsViewProps) {
    const [filter, setFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [selectedArtifact, setSelectedArtifact] = useState<JobArtifact | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const filteredArtifacts = artifacts.filter(art => {
        const matchesFilter = filter === "all" || art.type === filter;
        const matchesSearch = art.name.toLowerCase().includes(search.toLowerCase());
        return matchesFilter && matchesSearch;
    });

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const isImage = file.type.startsWith("image/");
        const reader = new FileReader();

        reader.onload = (event) => {
            const content = event.target?.result as string;
            const newArtifact: JobArtifact = {
                id: `imported-${Date.now()}`,
                type: isImage ? "image" : "markdown", // Default to markdown for text, image for images
                name: file.name,
                // For images, content is data URI (which we can use as url). For text, it's string.
                url: isImage ? content : undefined,
                content: isImage ? undefined : content
            };

            // Refine type based on extension if text
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

        // Reset input
        e.target.value = "";
    };

    const handleDelete = () => {
        if (selectedArtifact) {
            removeArtifact(selectedArtifact.id);
            setSelectedArtifact(null);
        }
    };

    const handleDownload = () => {
        if (!selectedArtifact) return;

        const link = document.createElement('a');
        link.download = selectedArtifact.name;

        if (selectedArtifact.url) {
            link.href = selectedArtifact.url;
        } else if (selectedArtifact.content) {
            const blob = new Blob([selectedArtifact.content], { type: 'text/plain' });
            link.href = URL.createObjectURL(blob);
        } else {
            return;
        }

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        if (!selectedArtifact.url) {
            URL.revokeObjectURL(link.href);
        }
    };

    return (
        <div className="artifacts">
            <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={handleFileChange}
            />
            <div className="artifacts__header">
                <div>
                    <SectionTitle text="Artifacts Library" />
                    <div className="artifacts__subtitle">
                        Manage generated and imported project files.
                    </div>
                </div>
                <button
                    onClick={handleImportClick}
                    className="btn btn-primary"
                >
                    <Plus size={14} /> Import Artifact
                </button>
            </div>

            {/* Toolbar */}
            <div className="artifacts__toolbar">
                <input
                    type="text"
                    placeholder="Search artifacts..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="artifacts__search"
                />
                <select
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    className="artifacts__filter"
                >
                    <option value="all">All Types</option>
                    <option value="markdown">Markdown</option>
                    <option value="json">JSON</option>
                    <option value="image">Image</option>
                    <option value="code">Code</option>
                </select>
            </div>

            {/* Main Content Area */}
            <div className="artifacts__content">
                {/* List */}
                <div className="artifacts__grid">
                    {filteredArtifacts.length === 0 && (
                        <div className="artifacts__empty">
                            No artifacts found.
                        </div>
                    )}
                    {filteredArtifacts.map(art => (
                        <div
                            key={art.id}
                            onClick={() => setSelectedArtifact(art)}
                            className={`artifact-card${selectedArtifact?.id === art.id ? ' artifact-card--selected' : ''}`}
                        >
                            <div className="artifact-card__header">
                                <div
                                    className="artifact-card__icon"
                                    style={{
                                        background: getIconColor(art.type) + "20",
                                        color: getIconColor(art.type),
                                    }}
                                >
                                    {getIcon(art.type)}
                                </div>
                                <div className="artifact-card__info">
                                    <div className="artifact-card__name">{art.name}</div>
                                    <div className="artifact-card__type">{art.type.toUpperCase()}</div>
                                </div>
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

                        <div className="artifacts__preview-body">
                            {selectedArtifact.type === "image" ? (
                                <img src={selectedArtifact.url} alt={selectedArtifact.name} className="artifacts__preview-img" />
                            ) : (
                                <pre className="artifacts__preview-code">
                                    {typeof selectedArtifact.content === 'string' ? selectedArtifact.content.slice(0, 5000) : JSON.stringify(selectedArtifact.content, null, 2)}
                                </pre>
                            )}
                        </div>

                        <div className="artifacts__preview-actions">
                            <button
                                onClick={handleDownload}
                                className="artifacts__btn-download"
                            >Download</button>
                            <button
                                onClick={handleDelete}
                                className="artifacts__btn-delete"
                            >Delete</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function getIcon(type: string) {
    switch (type) {
        case "markdown": return <FileText size={18} />;
        case "json": return <Code size={18} />;
        case "image": return <Image size={18} />;
        case "code": return <Code size={18} />;
        default: return <File size={18} />;
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
