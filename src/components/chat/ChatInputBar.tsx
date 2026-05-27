import { Send, Square, X } from "lucide-react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { BotMenu } from "@/components/chat/BotMenu";
import { ChatMentionPicker, type MentionCandidate } from "@/components/chat/ChatMentionPicker";
import type { PinnedMention } from "@/hooks/chat/useChatMentions";
import type { ChatAgent } from "@/services/chat/agents";

type StreamStateLike = { streamingText: string | null };

interface ChatInputBarProps {
    // Agent / mode
    activeAgent: ChatAgent | null;
    availableAgents: Record<string, ChatAgent>;
    studioActive: boolean;
    editorActive: boolean;

    // Input value
    input: string;
    setInput: Dispatch<SetStateAction<string>>;
    inputRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;

    // Send / stream state
    loading: boolean;
    isReady: boolean;
    streamState: StreamStateLike;
    send: () => void;
    stopStreaming: () => void;

    // Mentions
    mentionQuery: string | null;
    setMentionQuery: Dispatch<SetStateAction<string | null>>;
    mentionIndex: number;
    setMentionIndex: Dispatch<SetStateAction<number>>;
    mentionCandidates: MentionCandidate[];
    insertMention: (candidate: MentionCandidate) => void;
    pinnedMentions: PinnedMention[];
    setPinnedMentions: Dispatch<SetStateAction<PinnedMention[]>>;
    removePinnedMention: (key: string) => void;

    // BotMenu
    botMenuOpen: boolean;
    setBotMenuOpen: Dispatch<SetStateAction<boolean>>;
    lohkExpanded: boolean;
    setLohkExpanded: Dispatch<SetStateAction<boolean>>;
    hasLayoutOverride: boolean;
    onResetLayout: () => void;
}

export function ChatInputBar({
    activeAgent,
    availableAgents,
    studioActive,
    editorActive,
    input,
    setInput,
    inputRef,
    loading,
    isReady,
    streamState,
    send,
    stopStreaming,
    mentionQuery,
    setMentionQuery,
    mentionIndex,
    setMentionIndex,
    mentionCandidates,
    insertMention,
    pinnedMentions,
    setPinnedMentions,
    removePinnedMention,
    botMenuOpen,
    setBotMenuOpen,
    lohkExpanded,
    setLohkExpanded,
    hasLayoutOverride,
    onResetLayout,
}: ChatInputBarProps) {
    return (
        <div className="chat-panel__input-area">
            {/* @mention autocomplete picker */}
            {mentionQuery !== null && (
                <ChatMentionPicker
                    candidates={mentionCandidates}
                    activeIndex={mentionIndex}
                    onHoverIndex={setMentionIndex}
                    onPick={insertMention}
                />
            )}
            <div
                className={`chat-panel__input-bar${activeAgent ? " chat-panel__input-bar--agent" : studioActive ? " chat-panel__input-bar--studio" : editorActive ? " chat-panel__input-bar--editor" : ""}`}
                style={activeAgent ? {
                    // Cast: React's CSSProperties index signature rejects `--` custom-property keys; cast widens the key type for CSS variables.
                    ["--agent-gradient-start" as any]: activeAgent.gradient?.[0] ?? "#38bdf8",
                    ["--agent-gradient-end" as any]: activeAgent.gradient?.[1] ?? "#a78bfa",
                } : undefined}
            >
                <BotMenu
                    activeAgent={activeAgent}
                    availableAgents={availableAgents}
                    studioActive={studioActive}
                    editorActive={editorActive}
                    botMenuOpen={botMenuOpen}
                    setBotMenuOpen={setBotMenuOpen}
                    lohkExpanded={lohkExpanded}
                    setLohkExpanded={setLohkExpanded}
                    hasLayoutOverride={hasLayoutOverride}
                    onResetLayout={onResetLayout}
                />
                {pinnedMentions.length > 0 && (
                    <div className="chat-panel__pinned-mentions" aria-label="Mentioned agents">
                        {pinnedMentions.map(m => {
                            const key = `${m.type}:${m.id}`;
                            return (
                                <span
                                    key={key}
                                    className={`chat-panel__pinned-mention chat-panel__pinned-mention--${m.type}`}
                                    title={`${m.type === "agent" ? "Agent" : "Group"}: ${m.name}`}
                                >
                                    <span className="chat-panel__pinned-mention-label">@{m.name}</span>
                                    <button
                                        type="button"
                                        className="chat-panel__pinned-mention-remove"
                                        onMouseDown={e => { e.preventDefault(); removePinnedMention(key); }}
                                        aria-label={`Remove ${m.name} mention`}
                                        tabIndex={-1}
                                    >
                                        <X size={10} strokeWidth={2.5} />
                                    </button>
                                </span>
                            );
                        })}
                    </div>
                )}
                <input
                    ref={inputRef as RefObject<HTMLInputElement>}
                    value={input}
                    onChange={e => {
                        const val = e.target.value;
                        setInput(val);
                        const cur = e.target.selectionStart ?? val.length;
                        const before = val.slice(0, cur);
                        const mt = before.match(/(^|\s)@(\w*)$/);
                        if (mt) { setMentionQuery(mt[2]); setMentionIndex(0); }
                        else { setMentionQuery(null); }
                    }}
                    onKeyDown={e => {
                        if (mentionQuery !== null && mentionCandidates.length > 0) {
                            if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex(j => (j + 1) % mentionCandidates.length); return; }
                            if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex(j => (j - 1 + mentionCandidates.length) % mentionCandidates.length); return; }
                            if (e.key === "Enter" || e.key === "Tab" || e.key === " ") { e.preventDefault(); insertMention(mentionCandidates[mentionIndex]); return; }
                            if (e.key === "Escape") { e.preventDefault(); setMentionQuery(null); return; }
                        }
                        // Backspace on an empty input pops the last pinned mention chip.
                        if (e.key === "Backspace" && input.length === 0 && pinnedMentions.length > 0) {
                            e.preventDefault();
                            setPinnedMentions(prev => prev.slice(0, -1));
                            return;
                        }
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                    }}
                    placeholder={activeAgent?.placeholder ?? (studioActive ? "Ask the AI to build on the Studio canvas..." : editorActive ? "Ask the AI to help edit your file..." : "Ask about your workspace — type @ to mention agents...")}
                    disabled={loading && !streamState.streamingText}
                    className={`chat-panel__input${studioActive ? " chat-panel__input--studio" : editorActive ? " chat-panel__input--editor" : ""}`}
                    data-testid="chat-panel-input"
                />
                {loading ? (
                    <button
                        onClick={stopStreaming}
                        className="chat-panel__send-btn chat-panel__send-btn--stop"
                        title="Stop generating"
                        data-testid="chat-panel-stop"
                    ><Square size={14} /></button>
                ) : (
                    <button
                        onClick={send}
                        disabled={!input.trim() && pinnedMentions.length === 0}
                        className={`chat-panel__send-btn${isReady ? " chat-panel__send-btn--ready" : ""}`}
                        data-testid="chat-panel-send"
                    ><Send size={14} /></button>
                )}
            </div>
        </div>
    );
}
