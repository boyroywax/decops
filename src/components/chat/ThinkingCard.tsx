/**
 * ThinkingCard — Renders an agent's structured inner-thoughts block.
 *
 * The Reasoning Protocol in the workspace + per-agent system prompts
 * requires every assistant turn to begin with a ```thinking fenced
 * block containing Confidence / Needs tools / Plan, plus a second
 * Assess / Next block after each tool result. `parseActions` extracts
 * those blocks; this card surfaces them so the user can see the
 * agent's confidence, plan, and post-tool assessment as it works.
 *
 * Error / unexpected-result blocks (Assess starts with ERROR: or
 * UNEXPECTED:) get an alarmed styling so the corrective re-approach
 * is visually distinct from a normal step.
 */

import { useState } from "react";
import { Brain, AlertTriangle, ChevronDown, ChevronRight, Loader } from "lucide-react";
import type { ParsedThinking } from "./types";

interface ThinkingCardProps {
    thinking: ParsedThinking;
    /** True when this is the most recent ```thinking block — used to
     *  decide whether to show a streaming spinner when the assistant
     *  hasn't produced visible prose yet. */
    isLatest?: boolean;
    /** When true, render a small "thinking…" spinner instead of just
     *  the header. The card is still collapsible. */
    isStreaming?: boolean;
}

/** Known Reasoning Protocol field names — these get a dedicated row;
 *  any other "Key: value" lines fall into an "extras" block so future
 *  protocol fields still render without code changes. */
const KNOWN_FIELDS = ["Confidence", "Needs tools", "Plan", "Assess", "Next"] as const;

function tone(field: string, value: string, isError: boolean): string {
    if (field === "Assess" && isError) return "thinking-card__row--error";
    if (field === "Confidence") {
        const v = value.split(/[\s—-]/)[0]?.toLowerCase();
        if (v === "high") return "thinking-card__row--good";
        if (v === "medium") return "thinking-card__row--warn";
        if (v === "low") return "thinking-card__row--bad";
    }
    if (field === "Needs tools") {
        const v = value.split(/[\s—-]/)[0]?.toLowerCase();
        if (v === "yes") return "thinking-card__row--good";
        if (v === "no") return "thinking-card__row--muted";
    }
    return "";
}

export function ThinkingCard({ thinking, isLatest, isStreaming }: ThinkingCardProps) {
    const [expanded, setExpanded] = useState(true);
    const { fields, raw, isError } = thinking;

    const ordered = KNOWN_FIELDS.filter(f => fields[f] !== undefined).map(f => [f, fields[f]] as const);
    const extras = Object.entries(fields).filter(([k]) => !KNOWN_FIELDS.includes(k as typeof KNOWN_FIELDS[number]));

    // Title summary: prefer Plan, fall back to Next, then Assess.
    const summary = fields.Plan || fields.Next || fields.Assess || raw.split("\n")[0] || "Thinking";

    return (
        <div className={`thinking-card${isError ? " thinking-card--error" : ""}${isLatest ? " thinking-card--latest" : ""}`}>
            <button
                type="button"
                className="thinking-card__header"
                onClick={() => setExpanded(v => !v)}
                aria-expanded={expanded}
            >
                {isStreaming
                    ? <Loader size={11} className="thinking-card__icon thinking-card__icon--spin" />
                    : isError
                        ? <AlertTriangle size={11} className="thinking-card__icon thinking-card__icon--error" />
                        : <Brain size={11} className="thinking-card__icon" />}
                <span className="thinking-card__label">
                    {isStreaming ? "thinking…" : isError ? "reassessing" : "inner thoughts"}
                </span>
                <span className="thinking-card__summary" title={summary}>
                    {summary.length > 80 ? summary.slice(0, 80) + "…" : summary}
                </span>
                {expanded
                    ? <ChevronDown size={11} className="thinking-card__chevron" />
                    : <ChevronRight size={11} className="thinking-card__chevron" />}
            </button>
            {expanded && (
                <div className="thinking-card__body">
                    {ordered.length > 0 ? (
                        ordered.map(([field, value]) => (
                            <div key={field} className={`thinking-card__row ${tone(field, value, isError)}`}>
                                <span className="thinking-card__field">{field}</span>
                                <span className="thinking-card__value">{value}</span>
                            </div>
                        ))
                    ) : (
                        <div className="thinking-card__raw">{raw}</div>
                    )}
                    {extras.length > 0 && (
                        <div className="thinking-card__extras">
                            {extras.map(([k, v]) => (
                                <div key={k} className="thinking-card__row">
                                    <span className="thinking-card__field">{k}</span>
                                    <span className="thinking-card__value">{v}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
