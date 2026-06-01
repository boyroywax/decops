import { useCallback } from "react";
import type { MutableRefObject } from "react";
import type { StreamCallbacks } from "@/services/ai";
import { perfLog, perfNow } from "@/services/perf";
import { beginStreamingRun, abortStreamingRun } from "@/hooks/chat/streamingRun";
import type { StreamingRunState } from "@/hooks/chat/streamingRun";

interface UseSendOrchestratorOptions {
  streamState: StreamingRunState;
  abortRef: MutableRefObject<AbortController | null>;
  owner: "workspace-chat" | "agent-chat";
}

export function useSendOrchestrator(options: UseSendOrchestratorOptions) {
  const { streamState, abortRef, owner } = options;

  const runStreamingTurn = useCallback(async <T>(
    execute: (callbacks: StreamCallbacks) => Promise<T>,
  ): Promise<T> => {
    const NO_TOOL_IDLE_ABORT_MS = 3000;
    const WATCHDOG_TICK_MS = 250;
    const startedAt = perfNow();
    const run = beginStreamingRun(streamState, abortRef);
    let sawText = false;
    let sawToolCall = false;
    let lastActivityAt = perfNow();
    let watchdogAborted = false;

    const callbacks: StreamCallbacks = {
      ...run.callbacks,
      onToken: (token: string) => {
        sawText = true;
        lastActivityAt = perfNow();
        run.callbacks.onToken(token);
      },
      onToolCallStart: (name, input) => {
        sawToolCall = true;
        lastActivityAt = perfNow();
        run.callbacks.onToolCallStart?.(name, input);
      },
      onToolCallComplete: (display) => {
        lastActivityAt = perfNow();
        run.callbacks.onToolCallComplete?.(display);
      },
      onRoundEnd: (round) => {
        lastActivityAt = perfNow();
        run.callbacks.onRoundEnd?.(round);
      },
    };

    const watchdog = window.setInterval(() => {
      if (watchdogAborted) return;
      // Safety valve: if text has already been emitted and no tool loop is
      // active, don't let tail stalls hold the chat turn open indefinitely.
      if (sawText && !sawToolCall && perfNow() - lastActivityAt >= NO_TOOL_IDLE_ABORT_MS) {
        watchdogAborted = true;
        abortRef.current?.abort();
        perfLog("chat.streaming_idle_abort", {
          owner,
          idleMs: Math.round(perfNow() - lastActivityAt),
        });
      }
    }, WATCHDOG_TICK_MS);

    try {
      return await execute(callbacks);
    } finally {
      clearInterval(watchdog);
      run.finish();
      perfLog("chat.streaming_turn", {
        owner,
        durationMs: Math.round(perfNow() - startedAt),
      });
    }
  }, [abortRef, owner, streamState]);

  const stopStreamingTurn = useCallback(() => {
    const startedAt = perfNow();
    abortStreamingRun(streamState, abortRef);
    perfLog("chat.streaming_abort", {
      owner,
      durationMs: Math.round(perfNow() - startedAt),
    });
  }, [abortRef, owner, streamState]);

  return { runStreamingTurn, stopStreamingTurn };
}
