import { useMemo } from "react";
import type { ChatMessage, ToolCallDisplay, WorkspaceContext } from "../../services/ai";
import { parseActions } from "./utils";
import ActionCard from "./ActionCard";
import { MarkdownContent } from "../shared/MarkdownContent";
import { CheckCircle, AlertTriangle, Wrench, Loader } from "lucide-react";
import "../../styles/components/message-bubble.css";

interface MessageBubbleProps {
    msg: ChatMessage;
    context: WorkspaceContext;
    isStreaming?: boolean;
}

function ToolCallCard({ tc }: { tc: ToolCallDisplay }) {
    const isError = !!tc.error;
    const isPending = tc.duration_ms === 0 && !tc.error && !tc.result;
    const inputSummary = Object.entries(tc.input)
        .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
        .join(", ");

    return (
        <div className={`tool-call-card ${isError ? "tool-call-card--error" : isPending ? "tool-call-card--pending" : "tool-call-card--success"}`}>
            <div className="tool-call-card__header">
                <Wrench size={12} className="tool-call-card__icon" />
                <span className="tool-call-card__name">{tc.name}</span>
                {tc.jobId && (
                    <span className="tool-call-card__job-id" title={tc.jobId}>
                        {tc.jobId.slice(0, 12)}
                    </span>
                )}
                {isPending
                    ? <Loader size={12} className="tool-call-card__status tool-call-card__status--pending" />
                    : isError
                        ? <AlertTriangle size={12} className="tool-call-card__status tool-call-card__status--error" />
                        : <CheckCircle size={12} className="tool-call-card__status tool-call-card__status--success" />
                }
                {!isPending && <span className="tool-call-card__duration">{tc.duration_ms}ms</span>}
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

export default function MessageBubble({ msg, context, isStreaming }: MessageBubbleProps) {
    const isUser = msg.role === "user";
    const { cleanText, actions } = parseActions(msg.content);

    return (
        <div className={`mb-row ${isUser ? "mb-row--user" : "mb-row--assistant"}`}>
            <div className={`mb-bubble ${isUser ? "mb-bubble--user" : "mb-bubble--assistant"}${isStreaming ? " mb-bubble--streaming" : ""}`}>
                {isUser
                    ? <span style={{ whiteSpace: "pre-wrap" }}>{cleanText}</span>
                    : cleanText
                        ? <MarkdownContent content={cleanText} />
                        : isStreaming && !msg.toolCalls?.length
                            ? <span className="mb-streaming-cursor">●</span>
                            : null
                }
                {isStreaming && cleanText && <span className="mb-streaming-cursor">▊</span>}
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
