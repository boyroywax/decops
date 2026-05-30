import type { MutableRefObject } from "react";
import type { StreamCallbacks } from "@/services/ai";

export interface StreamingRunState {
  startStreaming: () => void;
  clearStreaming: () => void;
  flushPending: () => void;
  buildCallbacks: (signal: AbortSignal) => StreamCallbacks;
}

export interface StreamingRunHandle {
  signal: AbortSignal;
  callbacks: StreamCallbacks;
  finish: () => void;
}

export function beginStreamingRun(
  streamState: StreamingRunState,
  abortRef: MutableRefObject<AbortController | null>,
): StreamingRunHandle {
  streamState.startStreaming();
  const controller = new AbortController();
  abortRef.current = controller;

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    if (abortRef.current === controller) {
      abortRef.current = null;
    }
    streamState.flushPending();
    streamState.clearStreaming();
  };

  return {
    signal: controller.signal,
    callbacks: streamState.buildCallbacks(controller.signal),
    finish,
  };
}

export function abortStreamingRun(
  streamState: StreamingRunState,
  abortRef: MutableRefObject<AbortController | null>,
): void {
  abortRef.current?.abort();
  abortRef.current = null;
  streamState.clearStreaming();
}
