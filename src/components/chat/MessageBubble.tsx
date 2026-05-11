import { useMemo } from "react";
import type { ChatMessage, ToolCallDisplay, WorkspaceContext } from "@/services/ai";
import { parseActions } from "./utils";
import ActionCard from "./ActionCard";
import { JobProgressCard } from "./JobProgressCard";
import { MarkdownContent } from "@/components/shared/MarkdownContent";
import { useJobsContext } from "@/context/JobsContext";
import { useArchitectContext, ArchitectInlinePanel } from "@/toolkits/architect";
import type { ViewId } from "@/types";
import { CheckCircle, AlertTriangle, Wrench, Loader, FileText } from "lucide-react";
import "../../styles/components/message-bubble.css";

interface MessageBubbleProps {
    msg: ChatMessage;
    context: WorkspaceContext;
    setView?: (v: ViewId) => void;
    isStreaming?: boolean;
}

/** Extract artifact IDs from a tool call result (handles nested result objects) */
function extractArtifactIds(result: any): string[] {
    if (!result || typeof result !== "object") return [];
    // Direct artifactIds array (e.g. from assign_task result)
    if (Array.isArray(result.artifactIds)) return result.artifactIds;
    // Nested: result.result.artifactIds (e.g. assign_task returns { result: { artifactIds } })
    if (result.result && Array.isArray(result.result.artifactIds)) return result.result.artifactIds;
    // jobResult.artifactIds (from studio_run_job child result)
    if (result.jobResult && Array.isArray(result.jobResult.artifactIds)) return result.jobResult.artifactIds;
    return [];
}

function ToolCallCard({ tc }: { tc: ToolCallDisplay }) {
    const { allArtifacts } = useJobsContext();
    const isError = !!tc.error;
    const isPending = tc.duration_ms === 0 && !tc.error && !tc.result;
    const inputSummary = Object.entries(tc.input)
        .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
        .join(", ");

    // Collect artifacts referenced by this tool call's result
    const artifactIds = useMemo(() => extractArtifactIds(tc.result), [tc.result]);
    const artifacts = useMemo(() => {
        if (artifactIds.length === 0) return [];
        const idSet = new Set(artifactIds.map(id => id.toLowerCase()));
        return allArtifacts.filter(a => idSet.has(a.id.toLowerCase()));
    }, [artifactIds, allArtifacts]);

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
            {artifacts.length > 0 && (
                <div className="tool-call-card__artifacts">
                    <FileText size={10} />
                    <span className="tool-call-card__artifacts-label">Artifacts ({artifacts.length})</span>
                    <div className="tool-call-card__artifacts-list">
                        {artifacts.map(a => (
                            <span key={a.id} className="msg-artifact-chip" title={a.description || a.name}>
                                <span className="msg-artifact-chip__name">{a.name}</span>
                                <span className="msg-artifact-chip__type">{a.type}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function MessageBubble({ msg, context, setView, isStreaming }: MessageBubbleProps) {
    const isUser = msg.role === "user";
    const { cleanText, actions } = parseActions(msg.content);
    const architect = useArchitectContext();
    const canUseLiveArchitect = !!msg.architectCard?.live && !!architect;

    return (
        <div className={`mb-row ${isUser ? "mb-row--user" : "mb-row--assistant"}`}>
            <div className={`mb-bubble ${isUser ? "mb-bubble--user" : "mb-bubble--assistant"}${isStreaming ? " mb-bubble--streaming" : ""}`}>
                {msg.architectCard ? (
                    <ArchitectInlinePanel
                        archPrompt={canUseLiveArchitect ? architect.archPrompt : msg.architectCard.prompt}
                        archPreview={msg.architectCard.preview}
                        archPhase={msg.architectCard.phase}
                        deployProgress={msg.architectCard.deployProgress}
                        deployNetwork={canUseLiveArchitect ? architect.deployNetwork : (() => { })}
                        resetArchitect={canUseLiveArchitect ? architect.resetArchitect : (() => { })}
                        generateNetwork={canUseLiveArchitect ? architect.generateNetwork : undefined}
                        setView={setView ?? (() => { })}
                        showActions={canUseLiveArchitect}
                    />
                ) : isUser
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
                {msg.jobIds && msg.jobIds.length > 0 && (
                    <div className="job-progress-section">
                        {msg.jobIds.map(jid => <JobProgressCard key={jid} jobId={jid} />)}
                    </div>
                )}
                {actions.map((a, i) => <ActionCard key={i} action={a} context={context} />)}
            </div>
        </div>
    );
}
