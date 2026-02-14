import { useState, useCallback } from "react";
import type { LogEntry } from "../types";

export function useActivityLog() {
  const [log, setLog] = useState<LogEntry[]>([]);

  const addLog = useCallback((msg: string) => {
    setLog((prev) => [{ msg, ts: Date.now() }, ...prev].slice(0, 80));
  }, []);

  return { log, addLog };
}
