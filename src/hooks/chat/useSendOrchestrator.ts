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
    const startedAt = perfNow();
    const run = beginStreamingRun(streamState, abortRef);
    try {
      return await execute(run.callbacks);
    } finally {
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
