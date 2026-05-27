/**
 * Shared helpers for the SystemView and its panel components.
 *
 * §3.3 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
import {
    Circle, Play, ArrowRight, CheckCircle, XCircle, SkipForward,
    MessageSquare, StopCircle,
} from "lucide-react";
import type { JobEvent } from "@/types";

/** Format ms duration into a readable string */
export function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    if (m < 60) return `${m}m ${rem}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
}

export function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatDate(ts: number): string {
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return "Today";
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function eventIcon(kind: JobEvent["kind"]): React.ReactNode {
    switch (kind) {
        case "created":        return <Circle size={10} color="#64748b" />;
        case "started":        return <Play size={10} color="#3b82f6" />;
        case "step:started":   return <ArrowRight size={10} color="#3b82f6" />;
        case "step:completed": return <CheckCircle size={10} color="#10b981" />;
        case "step:failed":    return <XCircle size={10} color="#ef4444" />;
        case "step:skipped":   return <SkipForward size={10} color="#71717a" />;
        case "awaiting-input": return <MessageSquare size={10} color="#f59e0b" />;
        case "input-received": return <MessageSquare size={10} color="#10b981" />;
        case "completed":      return <CheckCircle size={10} color="#10b981" />;
        case "failed":         return <XCircle size={10} color="#ef4444" />;
        case "stopped":        return <StopCircle size={10} color="#ef4444" />;
        default:               return <Circle size={10} color="#52525b" />;
    }
}
