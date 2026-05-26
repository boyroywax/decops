import { useCallback, useMemo, useState, type RefObject } from "react";
import type { Agent, Group } from "@/types";
import type { MentionCandidate } from "@/components/chat/ChatMentionPicker";

export interface PinnedMention {
  type: "agent" | "group";
  id: string;
  name: string;
}

interface UseChatMentionsParams {
  input: string;
  setInput: (next: string) => void;
  inputRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  agents: Agent[];
  groups: Group[];
}

/**
 * Chat input "@mention" state: autocomplete picker + pinned chips.
 *
 * Typing `@name` opens an autocomplete dropdown sourced from the
 * workspace's agents and groups. Confirming a candidate pushes a chip
 * into `pinnedMentions` rather than injecting text — chips persist
 * across sends until the user removes them (chip × or Backspace on
 * empty input).
 *
 * Extracted from ChatPanel as part of §2.2 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
export function useChatMentions({ input, setInput, inputRef, agents, groups }: UseChatMentionsParams) {
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [pinnedMentions, setPinnedMentions] = useState<PinnedMention[]>([]);

  const mentionCandidates = useMemo<MentionCandidate[]>(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    const agentCandidates: MentionCandidate[] = (agents || []).map((a: Agent) => ({
      type: "agent",
      id: a.id as string,
      name: a.name as string,
      detail: (a.title || a.role || "") as string,
    }));
    const groupCandidates: MentionCandidate[] = (groups || []).map((g: Group) => ({
      type: "group",
      id: g.id as string,
      name: g.name as string,
      detail: `${g.governance} · ${g.members.length} members`,
    }));
    return [...agentCandidates, ...groupCandidates]
      .filter(c => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
      .slice(0, 8);
  }, [mentionQuery, agents, groups]);

  const insertMention = useCallback((candidate: { type: "agent" | "group"; id: string; name: string }) => {
    const cursorPos = inputRef.current?.selectionStart ?? input.length;
    const before = input.slice(0, cursorPos);
    const after = input.slice(cursorPos);
    // Strip the just-typed `@xxx` token — the chip replaces it.
    const stripped = before.replace(/(^|\s)@(\w*)$/, (_full, lead) => lead || "");
    // Collapse any duplicate whitespace that resulted from the strip.
    const cleaned = (stripped + after).replace(/\s{2,}/g, " ").replace(/^\s+/, "");
    setInput(cleaned);
    setPinnedMentions(prev => {
      const key = `${candidate.type}:${candidate.id}`;
      if (prev.some(p => `${p.type}:${p.id}` === key)) return prev;
      return [...prev, { type: candidate.type, id: candidate.id, name: candidate.name }];
    });
    setMentionQuery(null);
    inputRef.current?.focus();
  }, [input, setInput, inputRef]);

  const removePinnedMention = useCallback((key: string) => {
    setPinnedMentions(prev => prev.filter(m => `${m.type}:${m.id}` !== key));
    inputRef.current?.focus();
  }, [inputRef]);

  return {
    mentionQuery,
    setMentionQuery,
    mentionIndex,
    setMentionIndex,
    mentionCandidates,
    pinnedMentions,
    setPinnedMentions,
    insertMention,
    removePinnedMention,
  };
}
