import { useState, useRef } from "react";
import type { JobArtifact } from "../../types";
import { SectionTitle } from "../shared/ui";
import { FileText, Image, Code, File, X, Plus } from "lucide-react";

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
        <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 24 }}>
            <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={handleFileChange}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                    <SectionTitle text="Artifacts Library" />
                    <div style={{ fontSize: 13, color: "#a1a1aa" }}>
                        Manage generated and imported project files.
                    </div>
                </div>
                <button
                    onClick={handleImportClick}
                    style={{
                        background: "#00e5a0",
                        color: "#0a0a0f",
                        border: "none",
                        borderRadius: 4,
                        padding: "8px 16px",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 6
                    }}
                >
                    <Plus size={14} /> Import Artifact
                </button>
            </div>

            {/* Toolbar */}
            <div style={{ display: "flex", gap: 12, background: "rgba(255,255,255,0.02)", padding: 12, borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
                <input
                    type="text"
                    placeholder="Search artifacts..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{
                        background: "rgba(0,0,0,0.3)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        color: "#e4e4e7",
                        padding: "6px 12px",
                        borderRadius: 4,
                        fontSize: 12,
                        width: 200,
                        outline: "none"
                    }}
                />
                <select
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    style={{
                        background: "rgba(0,0,0,0.3)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        color: "#e4e4e7",
                        padding: "6px 12px",
                        borderRadius: 4,
                        fontSize: 12,
                        outline: "none",
                        cursor: "pointer"
                    }}
                >
                    <option value="all">All Types</option>
                    <option value="markdown">Markdown</option>
                    <option value="json">JSON</option>
                    <option value="image">Image</option>
                    <option value="code">Code</option>
                </select>
            </div>

            {/* Main Content Area */}
            <div style={{ display: "flex", flex: 1, gap: 24, overflow: "hidden" }}>
                {/* List */}
                <div style={{ flex: 1, overflow: "auto", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", alignContent: "start", gap: 16 }}>
                    {filteredArtifacts.length === 0 && (
                        <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 40, color: "#52525b", fontSize: 13 }}>
                            No artifacts found.
                        </div>
                    )}
                    {filteredArtifacts.map(art => (
                        <div
                            key={art.id}
                            onClick={() => setSelectedArtifact(art)}
                            style={{
                                background: selectedArtifact?.id === art.id ? "rgba(0,229,160,0.08)" : "rgba(255,255,255,0.02)",
                                border: `1px solid ${selectedArtifact?.id === art.id ? "rgba(0,229,160,0.3)" : "rgba(255,255,255,0.06)"}`,
                                borderRadius: 8,
                                padding: 16,
                                cursor: "pointer",
                                transition: "all 0.15s",
                                display: "flex",
                                flexDirection: "column",
                                gap: 12
                            }}
                        >
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <div style={{
                                    width: 32, height: 32, borderRadius: 6,
                                    background: getIconColor(art.type) + "20",
                                    color: getIconColor(art.type),
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontSize: 16
                                }}>
                                    {getIcon(art.type)}
                                </div>
                                <div style={{ overflow: "hidden" }}>
                                    <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "#e4e4e7" }}>{art.name}</div>
                                    <div style={{ fontSize: 10, color: "#71717a", marginTop: 2 }}>{art.type.toUpperCase()}</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Preview */}
                {selectedArtifact && (
                    <div style={{ width: 400, background: "rgba(0,0,0,0.2)", borderLeft: "1px solid rgba(255,255,255,0.06)", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ fontSize: 16, fontWeight: 600, color: "#e4e4e7" }}>{selectedArtifact.name}</div>
                            <button onClick={() => setSelectedArtifact(null)} style={{ background: "none", border: "none", color: "#71717a", cursor: "pointer" }}><X size={16} /></button>
                        </div>

                        <div style={{ flex: 1, background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: 16, overflow: "auto", border: "1px solid rgba(255,255,255,0.06)" }}>
                            {selectedArtifact.type === "image" ? (
                                <img src={selectedArtifact.url} alt={selectedArtifact.name} style={{ maxWidth: "100%", borderRadius: 4 }} />
                            ) : (
                                <pre style={{ fontSize: 11, fontFamily: "monospace", color: "#d4d4d8", whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0 }}>
                                    {typeof selectedArtifact.content === 'string' ? selectedArtifact.content.slice(0, 5000) : JSON.stringify(selectedArtifact.content, null, 2)}
                                </pre>
                            )}
                        </div>

                        <div style={{ display: "flex", gap: 12 }}>
                            <button
                                onClick={handleDownload}
                                style={{ flex: 1, padding: "8px 0", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, color: "#e4e4e7", cursor: "pointer", fontSize: 12 }}
                            >Download</button>
                            <button
                                onClick={handleDelete}
                                style={{ flex: 1, padding: "8px 0", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 4, color: "#ef4444", cursor: "pointer", fontSize: 12 }}
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
