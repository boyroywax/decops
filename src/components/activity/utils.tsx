import DOMPurify from "dompurify";
import { marked } from "marked";
import { Zap, Upload, Compass, Settings, FileText } from "lucide-react";
import type { NotebookCategory } from "../../types";

export const CATEGORY_META: Record<NotebookCategory, { label: string; color: string; icon: React.ReactNode }> = {
    action: { label: "Action", color: "#00e5a0", icon: <Zap size={12} color="#00e5a0" /> },
    output: { label: "Output", color: "#38bdf8", icon: <Upload size={12} color="#38bdf8" /> },
    navigation: { label: "Navigation", color: "#a78bfa", icon: <Compass size={12} color="#a78bfa" /> },
    system: { label: "System", color: "#ef4444", icon: <Settings size={12} color="#ef4444" /> },
    narrative: { label: "Narrative", color: "#fbbf24", icon: <FileText size={12} color="#fbbf24" /> },
};

export const FALLBACK_META = { label: "Unknown", color: "#71717a", icon: <Zap size={12} color="#71717a" /> };

export function relativeTime(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function dayKey(ts: number): string {
    const d = new Date(ts);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

/** Renders markdown content as HTML */
export function renderMarkdown(md: string): string {
    try {
        const result = marked.parse(md);
        if (result instanceof Promise) return md; // Safety check if marked returns a promise
        return DOMPurify.sanitize(result as string);
    } catch {
        return md;
    }
}

/** Returns true if this entry category should render its description as markdown */
export function isMarkdownCategory(cat: NotebookCategory): boolean {
    return cat === "output" || cat === "narrative";
}
