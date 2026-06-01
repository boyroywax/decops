import { Fragment, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { ChatMessage, WorkspaceContext } from "@/services/ai";
import { parseActions } from "./utils";
import type { ParsedSegment } from "./types";
import ActionCard from "./ActionCard";
import { ThinkingCard } from "./ThinkingCard";
import { JobProgressCard } from "./JobProgressCard";
import { MarkdownContent } from "@/components/shared/MarkdownContent";
import { useJobsContext } from "@/context/JobsContext";
import { useArchitectContext, ArchitectInlinePanel } from "@/toolkits/architect";
import { useChatAgentsStore } from "@/services/chat/agents";
import type { ViewId } from "@/types";
import { CheckCircle, AlertTriangle, Wrench, Loader, FileText, ChevronDown, ChevronRight } from "lucide-react";
import "../../styles/components/message-bubble.css";

interface MessageBubbleProps {
    msg: ChatMessage;
    context: WorkspaceContext;
    setView?: (v: ViewId) => void;
    isStreaming?: boolean;
    isLatestMessage?: boolean;
    onStopPromptAction?: (choice: "finish" | "stop" | "stop-and-job", prompt: NonNullable<ChatMessage["stopPrompt"]>) => void;
}

function formatToolValue(value: unknown): string {
    if (value === undefined) return "undefined";
    if (typeof value === "string") return value;
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

function summarizeToolResult(result: unknown): string {
    if (result == null) return "";
    if (typeof result === "string") {
        const trimmed = result.trim();
        return trimmed.length > 240 ? `${trimmed.slice(0, 240)}...` : trimmed;
    }
    try {
        const json = JSON.stringify(result);
        return json.length > 240 ? `${json.slice(0, 240)}...` : json;
    } catch {
        const fallback = String(result);
        return fallback.length > 240 ? `${fallback.slice(0, 240)}...` : fallback;
    }
}

function extractArtifactIds(result: any): string[] {
    if (!result || typeof result !== "object") return [];
    if (Array.isArray(result.artifactIds)) return result.artifactIds;
    if (result.result && Array.isArray(result.result.artifactIds)) return result.result.artifactIds;
    if (result.jobResult && Array.isArray(result.jobResult.artifactIds)) return result.jobResult.artifactIds;
    return [];
}

/** Compact relative timestamp for the bubble meta header. */
function formatTimeSince(ts: number): string {
    const diffMs = Date.now() - ts;
    if (diffMs < 45_000) return "just now";
    const mins = Math.round(diffMs / 60_000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(ts).toLocaleDateString();
}

function ToolCallCard({ tc, collapseSignal }: { tc: NonNullable<ChatMessage["toolCalls"]>[number]; collapseSignal: number }) {
    const { allArtifacts } = useJobsContext();
    const [expanded, setExpanded] = useState(false);
    const isError = !!tc.error;
    const isPending = tc.duration_ms === 0 && !tc.error && !tc.result;
    const statusLabel = isPending ? "pending" : isError ? "failed" : "completed";
    const resultSummary = !isPending && !isError ? summarizeToolResult(tc.result) : "";
    const detailPayload = useMemo(() => ({
        name: tc.name,
        jobId: tc.jobId ?? null,
        duration_ms: tc.duration_ms,
        input: tc.input,
        result: tc.result,
        error: tc.error ?? null,
    }), [tc]);
    const detailText = useMemo(() => formatToolValue(detailPayload), [detailPayload]);
    const canExpand = !isPending;
    const inputSummary = Object.entries(tc.input)
        .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
        .join(", ");
    const artifactIds = useMemo(() => extractArtifactIds(tc.result), [tc.result]);
    const artifacts = useMemo(() => {
        if (artifactIds.length === 0) return [];
        const idSet = new Set(artifactIds.map(id => id.toLowerCase()));
        return allArtifacts.filter(artifact => idSet.has(artifact.id.toLowerCase()));
    }, [artifactIds, allArtifacts]);

    useEffect(() => {
        setExpanded(false);
    }, [collapseSignal]);

    const showBody = expanded || isPending;

    return (
        <div className={`tool-call-card ${isError ? "tool-call-card--error" : isPending ? "tool-call-card--pending" : "tool-call-card--success"}${showBody ? " tool-call-card--expanded" : " tool-call-card--collapsed"}`}>
            <div
                className="tool-call-card__header"
                role={canExpand ? "button" : undefined}
                tabIndex={canExpand ? 0 : undefined}
                onClick={canExpand ? () => setExpanded(v => !v) : undefined}
                onKeyDown={canExpand ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(v => !v); } } : undefined}
                style={canExpand ? { cursor: "pointer" } : undefined}
                aria-expanded={canExpand ? expanded : undefined}
            >
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
                <span className={`tool-call-card__state tool-call-card__state--${statusLabel}`}>{statusLabel}</span>
                {!isPending && <span className="tool-call-card__duration">{tc.duration_ms}ms</span>}
                {canExpand && (
                    expanded
                        ? <ChevronDown size={11} className="tool-call-card__chevron" />
                        : <ChevronRight size={11} className="tool-call-card__chevron" />
                )}
            </div>
            {showBody && inputSummary && <div className="tool-call-card__args">{inputSummary}</div>}
            {showBody && resultSummary && <div className="tool-call-card__result">{resultSummary}</div>}
            {showBody && expanded && (
                <pre className="tool-call-card__payload">{detailText}</pre>
            )}
            {isError && tc.error && <div className="tool-call-card__error">{tc.error}</div>}
            {showBody && artifacts.length > 0 && (
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

/** Index of the last thinking segment that should show the streaming
 *  spinner — the last thinking block before trailing whitespace-only
 *  text. Returns -1 when no thinking block is "active". */
function findLastStreamingThought(segments: ParsedSegment[]): number {
    for (let i = segments.length - 1; i >= 0; i--) {
        if (segments[i].type === "thinking") return i;
        if (segments[i].type === "action") return -1;
        const t = segments[i] as { type: "text"; text: string };
        if (t.text?.trim()) return -1;
    }
    return -1;
}

function isTextSeg(seg: ParsedSegment): seg is { type: "text"; text: string } {
    return seg.type === "text";
}

function isActionSeg(seg: ParsedSegment): seg is { type: "action"; action: any } {
    return seg.type === "action";
}

export default function MessageBubble({ msg, context, setView, isStreaming, isLatestMessage, onStopPromptAction }: MessageBubbleProps) {
    const { jobs } = useJobsContext();
    const isUser = msg.role === "user";
    const { cleanText, segments } = parseActions(msg.content);
    const architect = useArchitectContext();
    const canUseLiveArchitect = !!msg.architectCard?.live && !!architect;

    // Resolve the chat agent that authored this message so we can tint
    // the bubble in its banner color scheme. We deliberately do NOT fall
    // back to the currently active agent — that would re-theme prior
    // bubbles whenever the operator switches bots. Messages are stamped
    // with `agentId` at persistence time in useConversations.
    const agentMap = useChatAgentsStore((s) => s.agents);
    const resolvedAgentId = !isUser ? msg.agentId : undefined;
    const themedAgent = resolvedAgentId ? agentMap[resolvedAgentId] : undefined;

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
    const allToolCalls = msg.toolCalls || [];
    const jobStatusById = useMemo(() => {
        const map = new Map<string, string>();
        for (const job of jobs) map.set(job.id, job.status);
        return map;
    }, [jobs]);
    const isTerminalJobStatus = (status: string | undefined): boolean => {
        if (!status) return true;
        return status !== "queued" && status !== "running" && status !== "awaiting-input";
    };
    const visibleToolCalls = useMemo(() => allToolCalls.filter(tc => {
        const isPending = tc.duration_ms === 0 && !tc.error && !tc.result;
        if (!isPending) return true;

        // Pending rows without a job id are only meaningful during the active stream.
        if (!tc.jobId) return !!isStreaming;

        const status = jobStatusById.get(tc.jobId);

        // Hide stale pending rows once a job reaches terminal state.
        if (isTerminalJobStatus(status)) return false;

        return true;
    }), [allToolCalls, jobStatusById, isStreaming]);
    const completedToolCalls = visibleToolCalls.filter(tc => tc.duration_ms > 0 && !tc.error).length;
    const failedToolCalls = visibleToolCalls.filter(tc => !!tc.error).length;
    const pendingToolCalls = visibleToolCalls.filter(tc => tc.duration_ms === 0 && !tc.error && !tc.result).length;
    const resolvedToolCalls = completedToolCalls + failedToolCalls;
    const toolProgressPct = visibleToolCalls.length > 0
        ? Math.round((resolvedToolCalls / visibleToolCalls.length) * 100)
        : 0;
    const collapseSignal = useMemo(() => {
        if (isStreaming) return 0;
        return isLatestMessage ? 0 : 1;
    }, [isLatestMessage, isStreaming]);

    const toolCallsByJobId = useMemo(() => {
        const grouped = new Map<string, NonNullable<ChatMessage["toolCalls"]>>();
        for (const toolCall of msg.toolCalls || []) {
            if (!toolCall.jobId) continue;
            const status = jobStatusById.get(toolCall.jobId);
            const isPending = toolCall.duration_ms === 0 && !toolCall.error && !toolCall.result;
            if (isPending && isTerminalJobStatus(status)) continue;
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
    }, [msg.toolCalls, latestJobId, standaloneFailedToolCalls, jobStatusById]);


    const commandBlocks = (
        <>
            {visibleToolCalls.filter(tc => !tc.jobId).length > 0 && (
                <div className="tool-calls-section">
                    <div className="tool-calls-section__label">
                        <Wrench size={11} /> Command completion ({toolProgressPct}% · {resolvedToolCalls}/{visibleToolCalls.length})
                    </div>
                    {visibleToolCalls
                        .filter(tc => !tc.jobId)
                        .map((toolCall, index) => (
                            <ToolCallCard key={`${toolCall.name}-${index}`} tc={toolCall} collapseSignal={collapseSignal} />
                        ))}
                </div>
            )}

            {latestJobId && (
                <div className="job-progress-section">
                    <JobProgressCard jobId={latestJobId} toolCalls={toolCallsByJobId.get(latestJobId) || []} />
                    {olderJobIds.length > 0 && (
                        <div className="job-progress-section__older">
                            {olderJobIds.map(jobId => (
                                <JobProgressCard
                                    key={jobId}
                                    jobId={jobId}
                                    toolCalls={toolCallsByJobId.get(jobId) || []}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </>
    );

    return (
        <div className={`mb-row ${isUser ? "mb-row--user" : "mb-row--assistant"}`}>
            <div
                className={`mb-bubble ${isUser ? "mb-bubble--user" : "mb-bubble--assistant"}${isStreaming ? " mb-bubble--streaming" : ""}${themedAgent ? " mb-bubble--themed" : ""}`}
                data-agent-id={themedAgent?.id}
                style={themedAgent?.gradient ? {
                    // Banner color scheme → bubble tint. The CSS rules in
                    // message-bubble.css use these custom properties to draw
                    // the accent border + soft background gradient.
                    ["--mb-agent-start" as any]: themedAgent.gradient[0],
                    ["--mb-agent-end" as any]: themedAgent.gradient[1],
                } : undefined}
            >
                {(themedAgent || msg.createdAt) && !isUser ? (
                    <div className="mb-bubble__meta" aria-hidden={false}>
                        {themedAgent ? (
                            <span className="mb-bubble__author" title={themedAgent.description}>
                                {themedAgent.name}
                            </span>
                        ) : null}
                        {msg.createdAt ? (
                            <span className="mb-bubble__time" title={new Date(msg.createdAt).toLocaleString()}>
                                {formatTimeSince(msg.createdAt)}
                            </span>
                        ) : null}
                    </div>
                ) : null}
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
                ) : (() => {
                    // Chronological interleave path: when any tool call carries
                    // a textOffset (captured at SSE start time), splice the per-
                    // call ToolCallCards and their JobProgressCards into the raw
                    // content at exactly the position they occurred during
                    // streaming, instead of grouping all command panels at the
                    // top or bottom of the bubble.
                    const toolCallsWithOffsets = (msg.toolCalls || [])
                        .map((tc, idx) => ({ tc, idx }))
                        .filter(({ tc }) => typeof tc.textOffset === "number")
                        .sort((a, b) => (a.tc.textOffset! - b.tc.textOffset!));
                    const useInterleaved = toolCallsWithOffsets.length > 0;

                    const renderFragmentSegments = (fragment: string, keyBase: string) => {
                        const { segments: fragSegments, cleanText: fragClean } = parseActions(fragment);
                        if (fragSegments.length === 0) {
                            return fragClean ? <MarkdownContent key={`${keyBase}-md`} content={fragClean} /> : null;
                        }
                        return (
                            <Fragment key={keyBase}>
                                {fragSegments.map((seg, i) => {
                                    if (isTextSeg(seg)) {
                                        return seg.text.trim()
                                            ? <MarkdownContent key={`${keyBase}-t-${i}`} content={seg.text} />
                                            : null;
                                    }
                                    if (isActionSeg(seg)) {
                                        return <ActionCard key={`${keyBase}-a-${i}`} action={seg.action} context={context} />;
                                    }
                                    return (
                                        <ThinkingCard
                                            key={`${keyBase}-th-${i}`}
                                            thinking={seg.thinking}
                                            isLatest={i === fragSegments.length - 1 || (() => { const last = fragSegments[fragSegments.length - 1]; return i === fragSegments.length - 2 && isTextSeg(last) && !last.text.trim(); })()}
                                            isStreaming={!!isStreaming && i === findLastStreamingThought(fragSegments)}
                                        />
                                    );
                                })}
                            </Fragment>
                        );
                    };

                    if (useInterleaved) {
                        const pieces: ReactNode[] = [];
                        let cursor = 0;
                        const seenJobs = new Set<string>();
                        const totalLen = msg.content.length;

                        for (const { tc, idx } of toolCallsWithOffsets) {
                            const off = Math.max(cursor, Math.min(tc.textOffset!, totalLen));
                            if (off > cursor) {
                                const frag = msg.content.slice(cursor, off);
                                const node = renderFragmentSegments(frag, `frag-${cursor}-${off}`);
                                if (node) pieces.push(node);
                                cursor = off;
                            }

                            const isPending = tc.duration_ms === 0 && !tc.error && !tc.result;
                            const status = tc.jobId ? jobStatusById.get(tc.jobId) : undefined;
                            // Only render the standalone ToolCallCard for
                            // tool calls that have NO jobId — those are the
                            // only ones that don't already get represented
                            // by a JobProgressCard. Otherwise the bubble
                            // would show two cards for the same command.
                            const showToolCall = !tc.jobId && (
                                !isPending || !!isStreaming
                            );

                            if (showToolCall) {
                                pieces.push(
                                    <ToolCallCard key={`itc-${idx}`} tc={tc} collapseSignal={collapseSignal} />,
                                );
                            }

                            if (tc.jobId && !seenJobs.has(tc.jobId)) {
                                seenJobs.add(tc.jobId);
                                const jobIsTerminallyHidden = isPending && isTerminalJobStatus(status);
                                if (!jobIsTerminallyHidden) {
                                    pieces.push(
                                        <div className="job-progress-section" key={`ijp-${tc.jobId}`}>
                                            <JobProgressCard
                                                jobId={tc.jobId}
                                                toolCalls={toolCallsByJobId.get(tc.jobId) || []}
                                            />
                                        </div>,
                                    );
                                }
                            }
                        }

                        if (cursor < totalLen) {
                            const frag = msg.content.slice(cursor);
                            const node = renderFragmentSegments(frag, `frag-tail-${cursor}`);
                            if (node) pieces.push(node);
                        }

                        return (
                            <>
                                <div className="segments-section">{pieces}</div>
                                {olderJobIds.filter(id => !seenJobs.has(id)).length > 0 && (
                                    <div className="job-progress-section">
                                        <div className="job-progress-section__older">
                                            {olderJobIds.filter(id => !seenJobs.has(id)).map(jobId => (
                                                <JobProgressCard
                                                    key={jobId}
                                                    jobId={jobId}
                                                    toolCalls={toolCallsByJobId.get(jobId) || []}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        );
                    }

                    // Legacy path (no offsets, e.g. persisted messages from
                    // before this change, or non-streaming providers): keep
                    // the existing single-anchor inline placement.
                    return (
                    <>
                        {segments.length === 0 && commandBlocks}
                        {/* Render segments in order: thinking cards interleaved
                            with their surrounding prose so each thought appears
                            inline where it was written, not stacked at the top. */}
                        {segments.length > 0 ? (
                            <div className="segments-section">
                                {(() => {
                                    const firstActionIdx = segments.findIndex(isActionSeg);
                                    const firstThinkingIdx = segments.findIndex(seg => seg.type === "thinking");
                                    const firstTextIdx = segments.findIndex(isTextSeg);
                                    const inlineInsertIdx = firstActionIdx >= 0
                                        ? firstActionIdx
                                        : (firstThinkingIdx >= 0 ? firstThinkingIdx : (firstTextIdx >= 0 ? firstTextIdx : 0));
                                    return segments.map((seg, i) => {
                                    if (isTextSeg(seg)) {
                                            if (!seg.text.trim()) {
                                                return i === inlineInsertIdx
                                                    ? <div key={`cmd-${i}`}>{commandBlocks}</div>
                                                    : null;
                                            }
                                            return (
                                                <Fragment key={`seg-text-${i}`}>
                                                    {i === inlineInsertIdx && firstActionIdx < 0 && commandBlocks}
                                                    <MarkdownContent content={seg.text} />
                                                    {i === inlineInsertIdx && firstActionIdx >= 0 && commandBlocks}
                                                </Fragment>
                                            );
                                    }
                                    if (isActionSeg(seg)) {
                                            return (
                                                <Fragment key={`seg-action-${i}`}>
                                                    <ActionCard action={seg.action} context={context} />
                                                    {i === inlineInsertIdx && commandBlocks}
                                                </Fragment>
                                            );
                                    }
                                    return (
                                            <Fragment key={`seg-thinking-${i}`}>
                                                <ThinkingCard
                                                    thinking={seg.thinking}
                                                    isLatest={i === segments.length - 1 || (() => { const last = segments[segments.length - 1]; return i === segments.length - 2 && isTextSeg(last) && !last.text.trim(); })()}
                                                    isStreaming={!!isStreaming && i === findLastStreamingThought(segments)}
                                                />
                                                {i === inlineInsertIdx && commandBlocks}
                                            </Fragment>
                                    );
                                    });
                                })()}
                            </div>
                        ) : cleanText ? (
                            <MarkdownContent content={cleanText} />
                        ) : isStreaming && !msg.toolCalls?.length ? (
                            <span className="mb-streaming-cursor">●</span>
                        ) : null}
                    </>
                    );
                })()}

                {isStreaming && cleanText && <span className="mb-streaming-cursor">▊</span>}
            </div>
        </div>
    );
}
