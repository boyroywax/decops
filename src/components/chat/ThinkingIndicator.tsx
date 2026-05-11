import "./ThinkingIndicator.css";

/**
 * Shared "AI is working" indicator.
 *
 * One component, three variants. All chat surfaces (workspace chat,
 * agent-to-agent messages, toolkit bots) use this so the user gets a
 * consistent visual cue.
 *
 *   • idle      — three pulsing dots, no label (compact, in-bubble)
 *   • thinking  — three dots + label, "<name> is thinking…"
 *   • working   — three dots + label + tool name, "<name> is running <tool>"
 */

export type ThinkingPhase = "thinking" | "working" | "idle";

export interface ThinkingIndicatorProps {
  /** Optional agent / bot name to prefix the label. */
  name?: string;
  /** Phase: "thinking" before tools, "working" during a tool call. */
  phase?: ThinkingPhase;
  /** Currently executing tool name (only used when phase === "working"). */
  toolName?: string;
  /** Compact dots-only mode (no label). */
  compact?: boolean;
  /** Visual variant — tints the dots. */
  variant?: "default" | "bridge" | "broadcast";
  className?: string;
}

export function ThinkingIndicator({
  name,
  phase = "thinking",
  toolName,
  compact = false,
  variant = "default",
  className = "",
}: ThinkingIndicatorProps) {
  const label = (() => {
    if (compact) return null;
    if (phase === "working" && toolName) {
      return name ? `${name} is running ${toolName}…` : `Running ${toolName}…`;
    }
    if (phase === "thinking") {
      return name ? `${name} is thinking…` : "Thinking…";
    }
    return null;
  })();

  return (
    <div
      className={`thinking thinking--${variant} ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="thinking__dots" aria-hidden="true">
        <span className="thinking__dot" />
        <span className="thinking__dot" />
        <span className="thinking__dot" />
      </div>
      {label && <span className="thinking__label">{label}</span>}
    </div>
  );
}
