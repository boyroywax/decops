import { useEffect, useMemo, useState } from "react";
import { isPerfDebugEnabled, subscribePerfEvents } from "@/services/perf";

const MAX_SAMPLES = 120;

type Buckets = {
  streamTurnMs: number[];
  streamAbortMs: number[];
  persistConversationsMs: number[];
  persistActiveIdMs: number[];
};

const emptyBuckets = (): Buckets => ({
  streamTurnMs: [],
  streamAbortMs: [],
  persistConversationsMs: [],
  persistActiveIdMs: [],
});

function pushSample(values: number[], next: number): number[] {
  const out = values.length >= MAX_SAMPLES ? values.slice(values.length - (MAX_SAMPLES - 1)) : values.slice();
  out.push(next);
  return out;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[idx]);
}

function formatMs(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "-";
  return `${value}ms`;
}

export function ChatPerfPanel() {
  const [enabled, setEnabled] = useState(() => isPerfDebugEnabled());
  const [buckets, setBuckets] = useState<Buckets>(() => emptyBuckets());

  useEffect(() => {
    const unsubscribe = subscribePerfEvents((record) => {
      const duration = Number(record.payload?.durationMs);
      if (!Number.isFinite(duration)) return;
      setBuckets((prev) => {
        if (record.event === "chat.streaming_turn") {
          return { ...prev, streamTurnMs: pushSample(prev.streamTurnMs, duration) };
        }
        if (record.event === "chat.streaming_abort") {
          return { ...prev, streamAbortMs: pushSample(prev.streamAbortMs, duration) };
        }
        if (record.event === "chat.persistence.conversations") {
          return { ...prev, persistConversationsMs: pushSample(prev.persistConversationsMs, duration) };
        }
        if (record.event === "chat.persistence.active_id") {
          return { ...prev, persistActiveIdMs: pushSample(prev.persistActiveIdMs, duration) };
        }
        return prev;
      });
    });

    const poll = window.setInterval(() => {
      setEnabled(isPerfDebugEnabled());
    }, 1000);

    return () => {
      unsubscribe();
      window.clearInterval(poll);
    };
  }, []);

  const summary = useMemo(() => {
    const stream = {
      p50: percentile(buckets.streamTurnMs, 50),
      p95: percentile(buckets.streamTurnMs, 95),
      n: buckets.streamTurnMs.length,
    };
    const persist = {
      p50: percentile(buckets.persistConversationsMs, 50),
      p95: percentile(buckets.persistConversationsMs, 95),
      n: buckets.persistConversationsMs.length,
    };
    return { stream, persist };
  }, [buckets]);

  if (!enabled) return null;

  return (
    <div className="chat-panel__perf-pill" title="Rolling performance stats (last 120 samples)">
      <span className="chat-panel__perf-label">Perf</span>
      <span className="chat-panel__perf-item">TT p50 {formatMs(summary.stream.p50)}</span>
      <span className="chat-panel__perf-item">TT p95 {formatMs(summary.stream.p95)}</span>
      <span className="chat-panel__perf-item">PS p50 {formatMs(summary.persist.p50)}</span>
      <span className="chat-panel__perf-item">PS p95 {formatMs(summary.persist.p95)}</span>
      <span className="chat-panel__perf-count">n={summary.stream.n}/{summary.persist.n}</span>
    </div>
  );
}
