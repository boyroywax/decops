import type { CSSProperties, ReactNode } from "react";

// NOTE: These inline style constants are DEPRECATED
// Use CSS classes from the design system instead:
// - .input, .input-accent, .input-channel, etc. for inputs
// - .section-title for section titles
// - .btn-pill for pill buttons
// - .checkbox for checkboxes
// - .bulk-action-bar for bulk actions
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
  boxSizing: "border-box",
};

export function SectionTitle({ text }: { text: string }) {
  return (
    <div className="section-title">
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
      className={`btn-pill ${active ? 'active' : ''}`}
      style={active ? { 
        background: `${activeColor}18`, 
        color: activeColor, 
        borderColor: `${activeColor}45` 
      } : undefined}
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
      className={`checkbox ${checked ? 'checked' : ''}`}
      style={checked ? { borderColor: color, background: `${color}20` } : undefined}
    >
      {checked && (
        <span className="checkbox-checkmark" style={{ color }}>✓</span>
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
    <div className="bulk-action-bar">
      <div className="flex items-center gap-lg">
        <span className="bulk-action-count">
          {count}
        </span>
        <span className="bulk-action-label">
          {entityName}{count !== 1 ? "s" : ""} selected
        </span>
      </div>
      <div className="bulk-actions">
        <button onClick={allSelected ? onClear : onSelectAll} className="btn btn-ghost btn-sm">
          {allSelected ? "Deselect All" : `Select All (${total})`}
        </button>
        <button onClick={onClear} className="btn btn-ghost btn-sm">
          Cancel
        </button>
        <button onClick={onDelete} className="btn btn-danger btn-sm">
          🗑 Delete {count}
        </button>
      </div>
    </div>
  );
}
