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
