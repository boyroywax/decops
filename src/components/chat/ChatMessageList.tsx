import type { RefObject } from "react";
import { Eye, MessageCircle } from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
import MessageBubble from "@/components/chat/MessageBubble";
import { ThinkingIndicator } from "@/components/chat/ThinkingIndicator";
import { ChatAgentBanner } from "@/components/chat/ChatAgentBanner";
import { extractEditorPreviewContent } from "@/components/chat/editorPreview";
import type { ChatMessage, WorkspaceContext, ToolCallDisplay } from "@/services/ai";
import type { ChatAgent } from "@/services/chat/agents";
import type { ViewId } from "@/types";

interface StreamStateLike {
  streamingText: string | null;
  streamingToolCalls: ToolCallDisplay[];
  roundPhase: string;
}

interface EditorApiLike {
  // We only need a truthy/falsy check from this component's POV.
  getState?: () => unknown;
}

interface ChatMessageListProps {
  messages: ChatMessage[];
  loading: boolean;
  context: WorkspaceContext;
  setView?: (v: ViewId) => void;
  handleStopPromptAction: (choice: "finish" | "stop" | "stop-and-job", prompt: NonNullable<ChatMessage["stopPrompt"]>) => void;

  activeAgent: ChatAgent | null;
  setInput: (s: string) => void;
  inputRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;

  editorActive: boolean;
  editorApi: EditorApiLike | null | undefined;
  proposeEdit: (content: string) => void;

  streamState: StreamStateLike;
  endRef: RefObject<HTMLDivElement | null>;
}

/**
 * The scrollable chat body — agent banner / welcome, empty state, message
 * list, streaming bubble, thinking indicators, scroll anchor.
 *
 * Extracted from ChatPanel as part of §2.2 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
export function ChatMessageList({
  messages,
  loading,
  context,
  setView,
  handleStopPromptAction,
  activeAgent,
  setInput,
  inputRef,
  editorActive,
  editorApi,
  proposeEdit,
  streamState,
  endRef,
}: ChatMessageListProps) {
  return (
    <div className="chat-panel__messages" data-testid="chat-panel-messages">
      <ChatAgentBanner />
      {activeAgent?.welcome && !loading && (() => {
        const Welcome = activeAgent.welcome!;
        return (
          <div className="chat-panel__agent-welcome chat-panel__agent-welcome--inline">
            <Welcome
              onPrompt={(t: string) => {
                setInput(t);
                setTimeout(() => inputRef.current?.focus(), 0);
              }}
            />
          </div>
        );
      })()}
      {messages.length === 0 && !loading && !activeAgent?.welcome && (
        <div className="chat-panel__chat-empty">
          <GradientIcon icon={MessageCircle} size={24} gradient={["#00e5a0", "#38bdf8"]} />
          <div className="chat-panel__chat-empty-title">
            {activeAgent ? activeAgent.name : "Workspace AI Assistant"}
          </div>
          <div className="chat-panel__chat-empty-desc">
            {activeAgent?.description ?? "Ask about your agents, channels, groups, topology — or request workspace actions."}
          </div>
          {activeAgent?.quickActions && activeAgent.quickActions.length > 0 && (
            <div className="chat-agent-quickactions">
              {activeAgent.quickActions.map((qa, i) => (
                <button
                  key={i}
                  type="button"
                  className="chat-agent-quickactions__chip"
                  onClick={() => {
                    if (qa.run) qa.run();
                    else if (qa.prompt) {
                      setInput(qa.prompt);
                      setTimeout(() => inputRef.current?.focus(), 0);
                    }
                  }}
                >
                  {qa.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {messages.map((m, i) => (
        <div key={i}>
          {m.systemNotice ? (
            <div className="chat-panel__system-notice" role="status" aria-live="polite">
              <span className="chat-panel__system-notice-dot" aria-hidden />
              <span className="chat-panel__system-notice-text">{m.content.replace(/^\[workspace update\]\s*/, "")}</span>
            </div>
          ) : (
            <MessageBubble msg={m} context={context} setView={setView} onStopPromptAction={handleStopPromptAction} />
          )}
          {editorActive && editorApi && m.role === "assistant" && !!extractEditorPreviewContent(m.content) && (
            <button
              className="chat-panel__apply-editor-btn"
              onClick={() => {
                const previewContent = extractEditorPreviewContent(m.content);
                if (previewContent) proposeEdit(previewContent);
              }}
              title="Preview AI changes as inline diff in the editor"
            >
              <Eye size={11} /> Preview in Editor
            </button>
          )}
        </div>
      ))}
      {streamState.streamingText !== null && (
        <MessageBubble
          msg={{
            role: "assistant",
            content: streamState.streamingText || "",
            toolCalls: streamState.streamingToolCalls.length > 0 ? streamState.streamingToolCalls : undefined,
            jobIds: streamState.streamingToolCalls.filter(tc => tc.jobId).map(tc => tc.jobId!),
          }}
          context={context}
          setView={setView}
          onStopPromptAction={handleStopPromptAction}
          isStreaming
        />
      )}
      {streamState.streamingText !== null && streamState.roundPhase === "drafting" && !streamState.streamingText && (
        <div className="chat-panel__loading">
          <ThinkingIndicator phase="working" toolName="processing tool results" />
        </div>
      )}
      {loading && streamState.streamingText === null && (
        <div className="chat-panel__loading">
          <ThinkingIndicator phase="thinking" />
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
