import { useState } from "react";
import { FileText } from "lucide-react";
import type { NotebookCategory, NotebookEntry } from "../../types";
import { CATEGORY_META } from "./utils";
import "../../styles/components/compose-panel.css";

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
        <div className="compose-panel">
            <div className="compose-panel__header">
                <FileText size={16} />
                <span className="compose-panel__title">
                    New Entry
                </span>
                <span className="compose-panel__categories">
                    {(["narrative", "action", "system"] as NotebookCategory[]).map(cat => {
                        const meta = CATEGORY_META[cat];
                        const sel = category === cat;
                        return (
                            <button
                                key={cat}
                                onClick={() => setCategory(cat)}
                                className="compose-panel__cat-btn"
                                style={{
                                    borderColor: sel ? meta.color + "60" : undefined,
                                    background: sel ? meta.color + "15" : undefined,
                                    color: sel ? meta.color : undefined,
                                }}
                            >
                                {meta.icon} {meta.label}
                            </button>
                        );
                    })}
                </span>
            </div>
            <input
                className="compose-panel__input"
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Title (e.g., Design Decision, TODO, Observation...)"
            />
            <textarea
                className="compose-panel__textarea"
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Write your note here... (supports **Markdown**)"
                rows={4}
            />
            <div className="compose-panel__actions">
                <button
                    onClick={() => {
                        setTitle("");
                        setBody("");
                        onCancel();
                    }}
                    className="btn btn-surface compose-panel__btn"
                >
                    Cancel
                </button>
                <button
                    onClick={handleSubmit}
                    className="btn btn-primary compose-panel__btn compose-panel__btn--submit"
                    disabled={!title.trim() && !body.trim()}
                >
                    Add Entry
                </button>
            </div>
        </div>
    );
}
