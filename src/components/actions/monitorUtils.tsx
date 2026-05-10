/** Format ms duration into a readable string */
export function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}m ${rem}s`;
}

/** Render key request params as compact badges */
export function renderRequestParams(request: Record<string, any>) {
    if (!request || typeof request !== "object") return null;
    const skip = new Set(["steps", "mode"]);
    const entries = Object.entries(request).filter(
        ([k, v]) => !skip.has(k) && v !== undefined && v !== null && v !== ""
    );
    if (entries.length === 0) return null;
    return (
        <div className="actions-monitor__history-request">
            {entries.slice(0, 6).map(([key, val]) => (
                <span key={key} className="actions-monitor__request-param">
                    <span className="actions-monitor__request-param-key">{key}:</span>{" "}
                    {typeof val === "object" ? JSON.stringify(val).slice(0, 40) : String(val).slice(0, 40)}
                </span>
            ))}
        </div>
    );
}

export const RECENT_OPTIONS = [5, 10, 20, 50];
