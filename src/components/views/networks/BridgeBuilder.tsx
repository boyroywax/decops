import type { Network, Bridge, BridgeForm } from "../../../types";
import { ROLES, CHANNEL_TYPES } from "../../../constants";
import { inputStyle, PillButton } from "../../shared/ui";
import { ArrowLeftRight, Link2 } from "lucide-react";
import { GradientIcon } from "../../shared/GradientIcon";

interface BridgeBuilderProps {
  ecosystems: Network[];
  bridgeForm: BridgeForm;
  setBridgeForm: (v: BridgeForm) => void;
  bridgeFromNet: Network | null | undefined;
  bridgeToNet: Network | null | undefined;
  createBridge: () => void;
  onClose: () => void;
}

export function BridgeBuilder({
  ecosystems, bridgeForm, setBridgeForm,
  bridgeFromNet, bridgeToNet,
  createBridge, onClose,
}: BridgeBuilderProps) {
  return (
    <div style={{
      background: "rgba(251,191,36,0.03)",
      border: "1px solid rgba(251,191,36,0.1)",
      borderRadius: 14,
      padding: 18,
      marginBottom: 20,
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#e4e4e7", marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
        <GradientIcon icon={Link2} size={14} gradient={["#fbbf24", "#fb923c"]} />
        Bridge Builder
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 9, color: "#52525b", marginBottom: 4, fontWeight: 600, letterSpacing: "0.05em" }}>SOURCE NETWORK</div>
          <select
            value={bridgeForm.fromNet}
            onChange={(e) => setBridgeForm({ ...bridgeForm, fromNet: e.target.value, fromAgent: "" })}
            style={{ ...inputStyle, border: "1px solid rgba(251,191,36,0.15)" }}
          >
            <option value="">Select network…</option>
            {ecosystems.map((n) => (
              <option key={n.id} value={n.id}>{n.name} ({n.agents.length} agents)</option>
            ))}
          </select>
          {bridgeFromNet && (
            <select
              value={bridgeForm.fromAgent}
              onChange={(e) => setBridgeForm({ ...bridgeForm, fromAgent: e.target.value })}
              style={{ ...inputStyle, border: "1px solid rgba(251,191,36,0.1)", marginTop: 6 }}
            >
              <option value="">Select agent…</option>
              {bridgeFromNet.agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({ROLES.find((r) => r.id === a.role)?.label})
                </option>
              ))}
            </select>
          )}
        </div>
        <div style={{ alignSelf: "center", flexShrink: 0, padding: "10px 0" }}>
          <ArrowLeftRight size={18} color="#fbbf24" />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 9, color: "#52525b", marginBottom: 4, fontWeight: 600, letterSpacing: "0.05em" }}>TARGET NETWORK</div>
          <select
            value={bridgeForm.toNet}
            onChange={(e) => setBridgeForm({ ...bridgeForm, toNet: e.target.value, toAgent: "" })}
            style={{ ...inputStyle, border: "1px solid rgba(251,191,36,0.15)" }}
          >
            <option value="">Select network…</option>
            {ecosystems.filter((n) => n.id !== bridgeForm.fromNet).map((n) => (
              <option key={n.id} value={n.id}>{n.name} ({n.agents.length} agents)</option>
            ))}
          </select>
          {bridgeToNet && (
            <select
              value={bridgeForm.toAgent}
              onChange={(e) => setBridgeForm({ ...bridgeForm, toAgent: e.target.value })}
              style={{ ...inputStyle, border: "1px solid rgba(251,191,36,0.1)", marginTop: 6 }}
            >
              <option value="">Select agent…</option>
              {bridgeToNet.agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({ROLES.find((r) => r.id === a.role)?.label})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {CHANNEL_TYPES.map((t) => (
            <PillButton
              key={t.id}
              active={bridgeForm.type === t.id}
              activeColor="#fbbf24"
              onClick={() => setBridgeForm({ ...bridgeForm, type: t.id })}
            >
              {t.icon} {t.label}
            </PillButton>
          ))}
        </div>
        <button
          onClick={() => { createBridge(); onClose(); }}
          disabled={!bridgeForm.fromAgent || !bridgeForm.toAgent}
          style={{
            background: bridgeForm.fromAgent && bridgeForm.toAgent ? "#fbbf24" : "#3f3f46",
            color: "#0a0a0f",
            border: "none",
            padding: "10px 18px",
            borderRadius: 6,
            cursor: bridgeForm.fromAgent && bridgeForm.toAgent ? "pointer" : "not-allowed",
            fontFamily: "inherit",
            fontSize: 11,
            fontWeight: 600,
            marginLeft: "auto",
          }}
        >
          Create Bridge
        </button>
      </div>
      <div style={{ fontSize: 9, color: "#52525b", marginTop: 8 }}>
        Bridge channels appear as cross-network connections (mode: bridge)
      </div>
    </div>
  );
}
