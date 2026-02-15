import { useMemo } from "react";
import { marked } from "marked";
import type { ChatMessage, WorkspaceContext } from "../../services/ai";
import { parseActions } from "./utils";
import ActionCard from "./ActionCard";

// Configure marked for safe, styled rendering
marked.setOptions({
    breaks: true,
    gfm: true,
});

interface MessageBubbleProps {
    msg: ChatMessage;
    context: WorkspaceContext;
}

export default function MessageBubble({ msg, context }: MessageBubbleProps) {
    const isUser = msg.role === "user";
    const { cleanText, actions } = parseActions(msg.content);

    const renderedHtml = useMemo(() => {
        if (isUser) return null;
        try {
            return marked.parse(cleanText) as string;
        } catch {
            return null;
        }
    }, [cleanText, isUser]);

    return (
        <div style={{
            display: "flex",
            justifyContent: isUser ? "flex-end" : "flex-start",
            marginBottom: 8,
        }}>
            <div
                className={isUser ? undefined : "chat-md"}
                style={{
                    maxWidth: "85%",
                    background: isUser ? "rgba(0,229,160,0.1)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${isUser ? "rgba(0,229,160,0.2)" : "rgba(255,255,255,0.06)"}`,
                    borderRadius: isUser ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                    padding: "8px 12px",
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: "#e4e4e7",
                    wordBreak: "break-word",
                    ...(isUser ? { whiteSpace: "pre-wrap" as const } : {}),
                }}
            >
                {isUser || !renderedHtml
                    ? cleanText
                    : <div dangerouslySetInnerHTML={{ __html: renderedHtml }} />
                }
                {actions.map((a, i) => <ActionCard key={i} action={a} context={context} />)}
            </div>
        </div>
    );
}
