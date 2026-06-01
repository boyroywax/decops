import { useCallback, useEffect, useRef, useState } from "react";
import type { ToolCallDisplay, StreamCallbacks } from "@/services/ai";

/**
 * Shared streaming chat state machine used by ChatPanel and AgentChat.
 * Keeps token buffering/tool-call lifecycle logic in one place so both
 * surfaces behave identically.
 */
export function useStreamingChatState() {
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [streamingToolCalls, setStreamingToolCalls] = useState<ToolCallDisplay[]>([]);
  const [roundPhase, setRoundPhase] = useState<"idle" | "drafting">("idle");

  const invalidatedRef = useRef(false);
  const tokenBufRef = useRef("");
  const rafIdRef = useRef<number | null>(null);

  const flushTokens = useCallback(() => {
    rafIdRef.current = null;
    if (invalidatedRef.current) return;
    const buf = tokenBufRef.current;
    tokenBufRef.current = "";
    if (!buf) return;
    setRoundPhase("idle");
    setStreamingText(prev => (prev ?? "") + buf);
  }, []);

  const flushPending = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    const buf = tokenBufRef.current;
    tokenBufRef.current = "";
    if (!buf || invalidatedRef.current) return;
    setRoundPhase("idle");
    setStreamingText(prev => (prev ?? "") + buf);
  }, []);

  const startStreaming = useCallback(() => {
    invalidatedRef.current = false;
    tokenBufRef.current = "";
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    setStreamingText("");
    setStreamingToolCalls([]);
    setRoundPhase("idle");
  }, []);

  const clearStreaming = useCallback(() => {
    invalidatedRef.current = true;
    tokenBufRef.current = "";
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    setStreamingText(null);
    setStreamingToolCalls([]);
    setRoundPhase("idle");
  }, []);

  const onToken = useCallback((token: string) => {
    tokenBufRef.current += token;
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(flushTokens);
    }
  }, [flushTokens]);

  const onToolCallStart = useCallback((name: string) => {
    setRoundPhase("idle");
    setStreamingToolCalls(prev => [
      ...prev,
      { name, input: {}, result: null, duration_ms: 0 },
    ]);
  }, []);

  const onToolCallComplete = useCallback((display: ToolCallDisplay) => {
    setStreamingToolCalls(prev => {
      const updated = [...prev];
      let idx = -1;
      for (let i = 0; i < updated.length; i++) {
        if (updated[i].name === display.name && updated[i].duration_ms === 0) {
          idx = i;
          break;
        }
      }
      if (idx >= 0) updated[idx] = display;
      else updated.push(display);
      return updated;
    });
  }, []);

  const onRoundEnd = useCallback(() => {
    setRoundPhase("drafting");
  }, []);

  /**
   * §5.6: release the token accumulator and cancel any pending rAF when the
   * host component unmounts. Without this, a rapid mount/unmount (e.g. tab
   * switching during a stream) would leave the buffer + frame request alive
   * past the component's lifecycle.
   */
  useEffect(() => {
    return () => {
      invalidatedRef.current = true;
      tokenBufRef.current = "";
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  const buildCallbacks = useCallback((signal?: AbortSignal): StreamCallbacks => ({
    onToken,
    signal,
    onToolCallStart: (name) => onToolCallStart(name),
    onToolCallComplete,
    onRoundEnd,
  }), [onToken, onToolCallStart, onToolCallComplete, onRoundEnd]);

  return {
    streamingText,
    streamingToolCalls,
    roundPhase,
    setRoundPhase,
    setStreamingText,
    setStreamingToolCalls,
    startStreaming,
    flushPending,
    clearStreaming,
    buildCallbacks,
  };
}
