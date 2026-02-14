import type { CSSProperties, ReactNode } from "react";

export const inputStyle: CSSProperties = {
  background: "rgba(0,0,0,0.4)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 6,
  padding: "10px 14px",
  color: "#e4e4e7",
  fontFamily: "'DM Mono', monospace",
  fontSize: 12,
  outline: "none",
  width: "100%",
  resize: "none",
};

export function SectionTitle({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 9, color: "#52525b", letterSpacing: "0.12em", marginBottom: 10, textTransform: "uppercase" }}>
      {text}
    </div>
  );
}

export function PillButton({
  active,
  activeColor,
  onClick,
  children,
}: {
  active: boolean;
  activeColor: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? activeColor + "18" : "rgba(0,0,0,0.3)",
        border: `1px solid ${active ? activeColor + "45" : "rgba(255,255,255,0.06)"}`,
        color: active ? activeColor : "#71717a",
        padding: "8px 12px",
        borderRadius: 6,
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: 11,
        transition: "all 0.15s",
      }}
    >
      {children}
    </button>
  );
}

export function BulkCheckbox({
  checked,
  onChange,
  color = "#00e5a0",
}: {
  checked: boolean;
  onChange: () => void;
  color?: string;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      style={{
        width: 18,
        height: 18,
        borderRadius: 4,
        border: `1.5px solid ${checked ? color : "rgba(255,255,255,0.15)"}`,
        background: checked ? color + "20" : "transparent",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        transition: "all 0.15s",
        padding: 0,
      }}
    >
      {checked && (
        <span style={{ color, fontSize: 11, lineHeight: 1 }}>✓</span>
      )}
    </button>
  );
}

export function BulkActionBar({
  count,
  total,
  onSelectAll,
  onClear,
  onDelete,
  allSelected,
  entityName,
  color = "#ef4444",
}: {
  count: number;
  total: number;
  onSelectAll: () => void;
  onClear: () => void;
  onDelete: () => void;
  allSelected: boolean;
  entityName: string;
  color?: string;
}) {
  if (count === 0) return null;
  return (
    <div
      style={{
        position: "sticky",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 18px",
        background: "rgba(10,10,15,0.95)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(239,68,68,0.2)",
        borderRadius: 10,
        marginTop: 16,
        animation: "slideUp 0.2s ease-out",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{
          fontSize: 12, fontWeight: 600, color: "#ef4444",
          background: "rgba(239,68,68,0.1)", padding: "4px 10px",
          borderRadius: 6, fontFamily: "var(--font-mono)",
        }}>
          {count}
        </span>
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          {entityName}{count !== 1 ? "s" : ""} selected
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={allSelected ? onClear : onSelectAll}
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid var(--border-medium)",
            color: "var(--text-muted)",
            padding: "6px 12px",
            borderRadius: 6,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 10,
          }}
        >
          {allSelected ? "Deselect All" : `Select All (${total})`}
        </button>
        <button
          onClick={onClear}
          style={{
            background: "transparent",
            border: "1px solid var(--border-medium)",
            color: "var(--text-muted)",
            padding: "6px 12px",
            borderRadius: 6,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 10,
          }}
        >
          Cancel
        </button>
        <button
          onClick={onDelete}
          style={{
            background: "rgba(239,68,68,0.15)",
            border: "1px solid rgba(239,68,68,0.35)",
            color: "#ef4444",
            padding: "6px 14px",
            borderRadius: 6,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 11,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          🗑 Delete {count}
        </button>
      </div>
      <style>{`@keyframes slideUp { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
    </div>
  );
}
