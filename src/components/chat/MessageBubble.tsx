import { useMemo } from "react";
import type { ChatMessage, ToolCallDisplay, WorkspaceContext } from "../../services/ai";
import { parseActions } from "./utils";
import ActionCard from "./ActionCard";
import { MarkdownContent } from "../shared/MarkdownContent";
import { CheckCircle, AlertTriangle, Wrench } from "lucide-react";
import "../../styles/components/message-bubble.css";

interface MessageBubbleProps {
    msg: ChatMessage;
    context: WorkspaceContext;
}

function ToolCallCard({ tc }: { tc: ToolCallDisplay }) {
    const isError = !!tc.error;
    const inputSummary = Object.entries(tc.input)
        .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
        .join(", ");

    return (
        <div className={`tool-call-card ${isError ? "tool-call-card--error" : "tool-call-card--success"}`}>
            <div className="tool-call-card__header">
                <Wrench size={12} className="tool-call-card__icon" />
                <span className="tool-call-card__name">{tc.name}</span>
                {isError
                    ? <AlertTriangle size={12} className="tool-call-card__status tool-call-card__status--error" />
                    : <CheckCircle size={12} className="tool-call-card__status tool-call-card__status--success" />
                }
                <span className="tool-call-card__duration">{tc.duration_ms}ms</span>
            </div>
            {inputSummary && (
                <div className="tool-call-card__args">{inputSummary}</div>
            )}
            {isError && tc.error && (
                <div className="tool-call-card__error">{tc.error}</div>
            )}
        </div>
    );
}

export default function MessageBubble({ msg, context }: MessageBubbleProps) {
    const isUser = msg.role === "user";
    const { cleanText, actions } = parseActions(msg.content);

    return (
        <div className={`mb-row ${isUser ? "mb-row--user" : "mb-row--assistant"}`}>
            <div className={`mb-bubble ${isUser ? "mb-bubble--user" : "mb-bubble--assistant"}`}>
                {isUser
                    ? <span style={{ whiteSpace: "pre-wrap" }}>{cleanText}</span>
                    : <MarkdownContent content={cleanText} />
                }
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="tool-calls-section">
                        <div className="tool-calls-section__label">
                            <Wrench size={11} /> Tools used ({msg.toolCalls.length})
                        </div>
                        {msg.toolCalls.map((tc, i) => <ToolCallCard key={i} tc={tc} />)}
                    </div>
                )}
                {actions.map((a, i) => <ActionCard key={i} action={a} context={context} />)}
            </div>
        </div>
    );
}
