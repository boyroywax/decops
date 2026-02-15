import { useState } from "react";
import { FileText } from "lucide-react";
import type { NotebookCategory, NotebookEntry } from "../../types";
import { CATEGORY_META } from "./utils";

interface ComposePanelProps {
    onAddEntry: (entry: Omit<NotebookEntry, "id" | "timestamp">) => void;
    onCancel: () => void;
}

export function ComposePanel({ onAddEntry, onCancel }: ComposePanelProps) {
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const [category, setCategory] = useState<NotebookCategory>("narrative");

    const handleSubmit = () => {
        if (!title.trim() && !body.trim()) return;
        const meta = CATEGORY_META[category];
        onAddEntry({
            category,
            icon: meta.icon,
            title: title.trim() || "Untitled Note",
            description: body.trim(),
            tags: ["user-note", category],
        });
        setTitle("");
        setBody("");
        // Parent handles closing
    };

    return (
        <div style={{
            marginBottom: 20, padding: 16,
            background: "rgba(251,191,36,0.04)",
            border: "1px solid rgba(251,191,36,0.2)",
            borderRadius: "var(--radius-xl)",
        }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <FileText size={16} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
                    New Entry
                </span>
                <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                    {(["narrative", "action", "system"] as NotebookCategory[]).map(cat => {
                        const meta = CATEGORY_META[cat];
                        const sel = category === cat;
                        return (
                            <button
                                key={cat}
                                onClick={() => setCategory(cat)}
                                style={{
                                    padding: "2px 8px", borderRadius: 8,
                                    border: `1px solid ${sel ? meta.color + "60" : "var(--border-subtle)"}`,
                                    background: sel ? meta.color + "15" : "transparent",
                                    color: sel ? meta.color : "var(--text-ghost)",
                                    fontSize: 10, fontWeight: 600, cursor: "pointer",
                                    fontFamily: "var(--font-mono)",
                                }}
                            >
                                {meta.icon} {meta.label}
                            </button>
                        );
                    })}
                </span>
            </div>
            <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Title (e.g., Design Decision, TODO, Observation...)"
                style={{
                    width: "100%", padding: "8px 12px", marginBottom: 8,
                    background: "var(--bg-input)", border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-lg)", color: "var(--text-primary)",
                    fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 600,
                    boxSizing: "border-box",
                }}
            />
            <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Write your note here... (supports **Markdown**)"
                rows={4}
                style={{
                    width: "100%", padding: "10px 12px", marginBottom: 10,
                    background: "var(--bg-input)", border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-lg)", color: "var(--text-primary)",
                    fontFamily: "var(--font-mono)", fontSize: 12,
                    resize: "vertical", boxSizing: "border-box",
                    lineHeight: 1.6,
                }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                    onClick={() => {
                        setTitle("");
                        setBody("");
                        onCancel();
                    }}
                    className="btn btn-surface"
                    style={{ fontSize: 11, padding: "6px 14px" }}
                >
                    Cancel
                </button>
                <button
                    onClick={handleSubmit}
                    className="btn btn-primary"
                    style={{ fontSize: 11, padding: "6px 18px", color: "#000", fontWeight: 700 }}
                    disabled={!title.trim() && !body.trim()}
                >
                    Add Entry
                </button>
            </div>
        </div>
    );
}
