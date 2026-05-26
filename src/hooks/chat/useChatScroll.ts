import { useEffect, type RefObject } from "react";

interface UseChatScrollParams {
  endRef: RefObject<HTMLElement | null>;
  inputRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  initialScrollDone: RefObject<boolean>;
  messagesLength: number;
  loading: boolean;
  streamingText: string | null;
  showConvos: boolean;
  activeId: string | null;
  focusTick: number;
}

/**
 * Chat scroll + input focus side effects extracted from ChatPanel.
 *
 *  - Smooth-scrolls to the latest message on new content / streaming updates
 *    (skipping the first mount via `initialScrollDone`).
 *  - Focuses the input whenever the chat view becomes visible or the active
 *    conversation changes.
 *  - Honors external focus bumps (`focusTick`) from Cmd+K, libp2p Bot, etc.
 *  - Re-focuses the input after the assistant finishes responding so the
 *    operator can keep typing without re-clicking.
 *
 * Extracted as part of §2.2 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
export function useChatScroll({
  endRef,
  inputRef,
  initialScrollDone,
  messagesLength,
  loading,
  streamingText,
  showConvos,
  activeId,
  focusTick,
}: UseChatScrollParams) {
  // Smooth scroll for new messages / streaming updates
  useEffect(() => {
    if (initialScrollDone.current) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messagesLength, loading, streamingText, endRef, initialScrollDone]);

  useEffect(() => {
    if (!showConvos && inputRef.current?.offsetParent !== null) {
      inputRef.current?.focus();
    }
  }, [showConvos, activeId, inputRef]);

  // External focus requests (Cmd+K, libp2p Bot button, …) bump focusTick.
  useEffect(() => {
    if (focusTick > 0) {
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [focusTick, inputRef]);

  // Re-focus input after the assistant finishes responding.
  useEffect(() => {
    if (!loading && !showConvos && inputRef.current?.offsetParent !== null) {
      inputRef.current?.focus();
    }
  }, [loading, showConvos, inputRef]);
}
