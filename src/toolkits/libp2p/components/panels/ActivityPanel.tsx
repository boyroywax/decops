/**
 * ActivityPanel — Libp2pView's "Activity" section.
 *
 * Renders the rolling event log (most recent first, capped at 100 entries
 * by the parent) plus a clear button. Extracted from Libp2pView.tsx so
 * the parent keeps shrinking; logic stays in the parent because the log
 * state is shared with libp2pService event subscribers.
 *
 * §3.1 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
import { RefreshCw } from "lucide-react";

export interface LogEntry {
    ts: number;
    msg: string;
    level: "info" | "error";
}

interface ActivityPanelProps {
    log: LogEntry[];
    onClear: () => void;
}

export function ActivityPanel({ log, onClear }: ActivityPanelProps) {
    return (
        <section className="libp2p-panel">
            <h3>
                Activity
                <button
                    className="libp2p-icon-btn libp2p-icon-btn--right"
                    title="Clear"
                    onClick={onClear}
                    aria-label="Clear"
                    disabled={log.length === 0}
                >
                    <RefreshCw size={12} />
                </button>
            </h3>
            {log.length === 0 ? (
                <p className="libp2p-muted">Activity will appear here.</p>
            ) : (
                <ul className="libp2p-log">
                    {log.map((entry) => (
                        <li key={entry.ts} className={`libp2p-log-entry libp2p-log-entry--${entry.level}`}>
                            <span className="libp2p-log-ts">
                                {new Date(entry.ts).toLocaleTimeString()}
                            </span>
                            <span>{entry.msg}</span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
