import { useEffect } from "react";
import { X, FileText } from "lucide-react";
import type { JobArtifact } from "../../types";

interface ArtifactViewerProps {
    artifact: JobArtifact;
    onClose: () => void;
}

export function ArtifactViewer({ artifact, onClose }: ArtifactViewerProps) {
    // Close on escape
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        }
        window.addEventListener("keydown", handleEsc);
        return () => window.removeEventListener("keydown", handleEsc);
    }, [onClose]);

    return (
        <div style={{
            position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)",
            zIndex: 60, display: "flex", justifyContent: "center", alignItems: "center",
            padding: 24
        }} onClick={onClose}>
            <div style={{
                width: "100%", maxWidth: 800, maxHeight: "90vh",
                background: "#09090b", border: "1px solid #27272a",
                borderRadius: 12, boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
                display: "flex", flexDirection: "column", overflow: "hidden"
            }} onClick={e => e.stopPropagation()}>
                <div style={{
                    padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)",
                    background: "rgba(255,255,255,0.02)",
                    display: "flex", justifyContent: "space-between", alignItems: "center"
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <FileText size={16} color="#38bdf8" />
                        <span style={{ fontWeight: 500, color: "#fff" }}>{artifact.name}</span>
                        <span style={{ fontSize: 10, background: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: 4, color: "#a1a1aa" }}>{artifact.type}</span>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ background: "none", border: "none", color: "#71717a", cursor: "pointer", padding: 4 }}
                    ><X size={18} /></button>
                </div>

                <div style={{ flex: 1, overflow: "auto", background: "#000", padding: 0 }}>
                    {artifact.type === 'image' && artifact.url ? (
                        <div style={{ display: "flex", justifyContent: "center", padding: 20 }}>
                            <img src={artifact.url} alt={artifact.name} style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 4 }} />
                        </div>
                    ) : (
                        <pre style={{
                            margin: 0, padding: 20,
                            fontSize: 12, color: "#d4d4d8", fontFamily: "monospace", lineHeight: 1.5
                        }}>
                            {artifact.content || "No content available"}
                        </pre>
                    )}
                </div>
            </div>
        </div>
    );
}
