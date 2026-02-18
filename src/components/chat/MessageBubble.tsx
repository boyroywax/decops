import { useMemo } from "react";
import type { ChatMessage, WorkspaceContext } from "../../services/ai";
import { parseActions } from "./utils";
import ActionCard from "./ActionCard";
import { MarkdownContent } from "../shared/MarkdownContent";
import "../../styles/components/message-bubble.css";

interface MessageBubbleProps {
    msg: ChatMessage;
    context: WorkspaceContext;
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
                {actions.map((a, i) => <ActionCard key={i} action={a} context={context} />)}
            </div>
        </div>
    );
}
