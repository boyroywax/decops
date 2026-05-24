import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, WorkspaceContext } from "@/services/ai";
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
    onStopPromptAction?: (choice: "finish" | "stop" | "stop-and-job", prompt: NonNullable<ChatMessage["stopPrompt"]>) => void;
}

function extractArtifactIds(result: any): string[] {
    if (!result || typeof result !== "object") return [];
    if (Array.isArray(result.artifactIds)) return result.artifactIds;
    if (result.result && Array.isArray(result.result.artifactIds)) return result.result.artifactIds;
    if (result.jobResult && Array.isArray(result.jobResult.artifactIds)) return result.jobResult.artifactIds;
    return [];
}

function ToolCallCard({ tc }: { tc: NonNullable<ChatMessage["toolCalls"]>[number] }) {
    const { allArtifacts } = useJobsContext();
    const isError = !!tc.error;
    const isPending = tc.duration_ms === 0 && !tc.error && !tc.result;
    const inputSummary = Object.entries(tc.input)
        .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
        .join(", ");
    const artifactIds = useMemo(() => extractArtifactIds(tc.result), [tc.result]);
    const artifacts = useMemo(() => {
        if (artifactIds.length === 0) return [];
        const idSet = new Set(artifactIds.map(id => id.toLowerCase()));
        return allArtifacts.filter(artifact => idSet.has(artifact.id.toLowerCase()));
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
                        : <CheckCircle size={12} className="tool-call-card__status tool-call-card__status--success" />}
                {!isPending && <span className="tool-call-card__duration">{tc.duration_ms}ms</span>}
            </div>
            {inputSummary && <div className="tool-call-card__args">{inputSummary}</div>}
            {isError && tc.error && <div className="tool-call-card__error">{tc.error}</div>}
            {artifacts.length > 0 && (
                <div className="tool-call-card__artifacts">
                    <FileText size={10} />
                    <span className="tool-call-card__artifacts-label">Artifacts ({artifacts.length})</span>
                    <div className="tool-call-card__artifacts-list">
                        {artifacts.map(artifact => (
                            <span key={artifact.id} className="msg-artifact-chip" title={artifact.description || artifact.name}>
                                <span className="msg-artifact-chip__name">{artifact.name}</span>
                                <span className="msg-artifact-chip__type">{artifact.type}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function MessageBubble({ msg, context, setView, isStreaming, onStopPromptAction }: MessageBubbleProps) {
    const { jobs } = useJobsContext();
    const isUser = msg.role === "user";
    const { cleanText, actions } = parseActions(msg.content);
    const architect = useArchitectContext();
    const canUseLiveArchitect = !!msg.architectCard?.live && !!architect;
    const [showOlderJobs, setShowOlderJobs] = useState(false);
    const [isOlderCounterAnimating, setIsOlderCounterAnimating] = useState(false);
    const previousOlderCountRef = useRef<number>(0);

    const orderedJobIds = useMemo(() => {
        if (!msg.jobIds || msg.jobIds.length === 0) return [] as string[];
        const seen = new Set<string>();
        return msg.jobIds.filter(id => {
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });
    }, [msg.jobIds]);

    const latestJobId = orderedJobIds.length > 0 ? orderedJobIds[orderedJobIds.length - 1] : undefined;
    const olderJobIds = orderedJobIds.length > 1 ? orderedJobIds.slice(0, -1).reverse() : [];
    const standaloneToolCalls = useMemo(
        () => (msg.toolCalls || []).filter(toolCall => !toolCall.jobId),
        [msg.toolCalls],
    );
    const standaloneFailedToolCalls = useMemo(
        () => standaloneToolCalls.filter(toolCall => !!toolCall.error),
        [standaloneToolCalls],
    );
    const standaloneNonFailedToolCalls = useMemo(
        () => standaloneToolCalls.filter(toolCall => !toolCall.error),
        [standaloneToolCalls],
    );

    const toolCallsByJobId = useMemo(() => {
        const grouped = new Map<string, NonNullable<ChatMessage["toolCalls"]>>();
        for (const toolCall of msg.toolCalls || []) {
            if (!toolCall.jobId) continue;
            const existing = grouped.get(toolCall.jobId) || [];
            existing.push(toolCall);
            grouped.set(toolCall.jobId, existing);
        }
        // If a tool call failed before returning a jobId, attach it to the latest
        // visible job card so the failure is represented in one unified surface.
        if (latestJobId && standaloneFailedToolCalls.length > 0) {
            const existing = grouped.get(latestJobId) || [];
            grouped.set(latestJobId, [...existing, ...standaloneFailedToolCalls]);
        }
        return grouped;
    }, [msg.toolCalls, latestJobId, standaloneFailedToolCalls]);

    const latestOlderJobId = olderJobIds[0];
    const latestOlderJob = useMemo(
        () => jobs.find(job => job.id === latestOlderJobId),
        [jobs, latestOlderJobId],
    );
    const latestOlderJobHasToolErrors = !!latestOlderJobId && (toolCallsByJobId.get(latestOlderJobId) || []).some(tc => !!tc.error);
    const olderCounterTone: "success" | "error" =
        latestOlderJob?.status === "failed" || (latestOlderJob?.status === "completed" && latestOlderJobHasToolErrors)
            ? "error"
            : "success";

    useEffect(() => {
        if (previousOlderCountRef.current === 0) {
            previousOlderCountRef.current = olderJobIds.length;
            return;
        }
        if (olderJobIds.length !== previousOlderCountRef.current) {
            previousOlderCountRef.current = olderJobIds.length;
            setIsOlderCounterAnimating(true);
            const t = setTimeout(() => setIsOlderCounterAnimating(false), 700);
            return () => clearTimeout(t);
        }
    }, [olderJobIds.length]);

    return (
        <div className={`mb-row ${isUser ? "mb-row--user" : "mb-row--assistant"}`}>
            <div className={`mb-bubble ${isUser ? "mb-bubble--user" : "mb-bubble--assistant"}${isStreaming ? " mb-bubble--streaming" : ""}`}>
                {msg.architectCard ? (
                    <ArchitectInlinePanel
                        archPrompt={canUseLiveArchitect ? architect.archPrompt : msg.architectCard.prompt}
                        archPreview={msg.architectCard.preview}
                        archPhase={msg.architectCard.phase}
                        deployProgress={msg.architectCard.deployProgress}
                        deployNetwork={canUseLiveArchitect ? architect.deployNetwork : (() => {})}
                        resetArchitect={canUseLiveArchitect ? architect.resetArchitect : (() => {})}
                        generateNetwork={canUseLiveArchitect ? architect.generateNetwork : undefined}
                        setView={setView ?? (() => {})}
                        showActions={canUseLiveArchitect}
                    />
                ) : isUser ? (
                    <span style={{ whiteSpace: "pre-wrap" }}>{cleanText}</span>
                ) : cleanText ? (
                    <MarkdownContent content={cleanText} />
                ) : isStreaming && !msg.toolCalls?.length ? (
                    <span className="mb-streaming-cursor">●</span>
                ) : null}

                {isStreaming && cleanText && <span className="mb-streaming-cursor">▊</span>}

                {standaloneNonFailedToolCalls.length > 0 && orderedJobIds.length === 0 && (
                    <div className="tool-calls-section">
                        <div className="tool-calls-section__label">
                            <Wrench size={11} /> Tools used ({standaloneNonFailedToolCalls.length})
                        </div>
                        {standaloneNonFailedToolCalls.map((toolCall, index) => (
                            <ToolCallCard key={`${toolCall.name}-${index}`} tc={toolCall} />
                        ))}
                    </div>
                )}

                {msg.stopPrompt && (
                    <div className="mb-stop-prompt">
                        <div className="mb-stop-prompt__title">Do you want to finish this job?</div>
                        <div className="mb-stop-prompt__job">{msg.stopPrompt.jobName || "Unnamed job"}</div>
                        {msg.stopPrompt.jobDescription && (
                            <div className="mb-stop-prompt__desc">{msg.stopPrompt.jobDescription}</div>
                        )}
                        <div className="mb-stop-prompt__actions">
                            <button
                                type="button"
                                className="mb-stop-prompt__btn mb-stop-prompt__btn--finish"
                                onClick={() => onStopPromptAction?.("finish", msg.stopPrompt!)}
                            >
                                Finish Job
                            </button>
                            <button
                                type="button"
                                className="mb-stop-prompt__btn mb-stop-prompt__btn--stop"
                                onClick={() => onStopPromptAction?.("stop", msg.stopPrompt!)}
                            >
                                Stop Query
                            </button>
                            {msg.stopPrompt.jobId && (
                                <button
                                    type="button"
                                    className="mb-stop-prompt__btn mb-stop-prompt__btn--stop-job"
                                    onClick={() => onStopPromptAction?.("stop-and-job", msg.stopPrompt!)}
                                >
                                    Stop Query + Job
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {orderedJobIds.length > 0 && (
                    <div className="job-progress-section">
                        {latestJobId && (
                            <JobProgressCard
                                key={latestJobId}
                                jobId={latestJobId}
                                toolCalls={toolCallsByJobId.get(latestJobId)}
                            />
                        )}
                        {olderJobIds.length > 0 && (
                            <div className="job-progress-section__collapse">
                                <button
                                    type="button"
                                    className="job-progress-section__toggle"
                                    onClick={() => setShowOlderJobs(value => !value)}
                                >
                                    <span className="job-progress-section__toggle-text">
                                        {showOlderJobs
                                            ? `Hide older job ${olderJobIds.length === 1 ? "card" : "cards"}`
                                            : `Show older job ${olderJobIds.length === 1 ? "card" : "cards"}`}
                                    </span>
                                    <span
                                        className={`job-progress-section__counter job-progress-section__counter--${olderCounterTone}${isOlderCounterAnimating ? " job-progress-section__counter--animating" : ""}`}
                                        aria-label={`${olderJobIds.length} older jobs`}
                                    >
                                        {olderJobIds.length}
                                    </span>
                                </button>
                                {showOlderJobs && (
                                    <div className="job-progress-section__older">
                                        {olderJobIds.map(jobId => (
                                            <JobProgressCard
                                                key={jobId}
                                                jobId={jobId}
                                                toolCalls={toolCallsByJobId.get(jobId)}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {actions.map((action, index) => (
                    <ActionCard key={index} action={action} context={context} />
                ))}
            </div>
        </div>
    );
}