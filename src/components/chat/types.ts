import type { ChatMessage } from "../../services/ai";

export interface ParsedAction {
    type: string;
    [key: string]: any;
}

export interface Conversation {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: number;
    updatedAt: number;
}
