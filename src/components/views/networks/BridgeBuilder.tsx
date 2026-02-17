import type { Network, Bridge, BridgeForm } from "../../../types";
import { ROLES, CHANNEL_TYPES } from "../../../constants";
import { inputStyle, PillButton } from "../../shared/ui";
import { ArrowLeftRight, Link2 } from "lucide-react";
import { GradientIcon } from "../../shared/GradientIcon";
import "../../../styles/components/bridge-builder.css";

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
  const ready = bridgeForm.fromAgent && bridgeForm.toAgent;
  return (
    <div className="bridge-builder">
      <div className="bridge-builder__title">
        <GradientIcon icon={Link2} size={14} gradient={["#fbbf24", "#fb923c"]} />
        Bridge Builder
      </div>
      <div className="bridge-builder__row">
        <div className="bridge-builder__col">
          <div className="bridge-builder__col-label">SOURCE NETWORK</div>
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
        <div className="bridge-builder__arrow">
          <ArrowLeftRight size={18} color="#fbbf24" />
        </div>
        <div className="bridge-builder__col">
          <div className="bridge-builder__col-label">TARGET NETWORK</div>
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
      <div className="bridge-builder__footer">
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
          disabled={!ready}
          className={`bridge-builder__submit${ready ? " bridge-builder__submit--enabled" : ""}`}
        >
          Create Bridge
        </button>
      </div>
      <div className="bridge-builder__hint">
        Bridge channels appear as cross-network connections (mode: bridge)
      </div>
    </div>
  );
}
