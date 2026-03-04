import type { Agent, Group, Network, Bridge, BridgeForm } from "@/types";
import { ROLES, CHANNEL_TYPES } from "@/constants";
import { inputStyle, PillButton } from "@/components/shared/ui";
import { ArrowLeftRight, Link2, Users } from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
import "../../../styles/components/bridge-builder.css";

interface BridgeBuilderProps {
  ecosystems: Network[];
  agents: Agent[];
  groups: Group[];
  bridgeForm: BridgeForm;
  setBridgeForm: (v: BridgeForm) => void;
  bridgeFromNet: Network | null | undefined;
  bridgeToNet: Network | null | undefined;
  createBridge: () => void;
  onClose: () => void;
}

export function BridgeBuilder({
  ecosystems, agents, groups, bridgeForm, setBridgeForm,
  bridgeFromNet, bridgeToNet,
  createBridge, onClose,
}: BridgeBuilderProps) {
  // Use workspace-level agents filtered by networkId (always fresh)
  const fromNetAgents = bridgeForm.fromNet
    ? agents.filter(a => a.networkId === bridgeForm.fromNet)
    : [];
  const toNetAgents = bridgeForm.toNet
    ? agents.filter(a => a.networkId === bridgeForm.toNet)
    : [];
  const fromNetGroups = bridgeForm.fromNet
    ? groups.filter(g => g.networkId === bridgeForm.fromNet)
    : [];
  const toNetGroups = bridgeForm.toNet
    ? groups.filter(g => g.networkId === bridgeForm.toNet)
    : [];
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
            {ecosystems.map((n) => {
              const count = agents.filter(a => a.networkId === n.id).length;
              return <option key={n.id} value={n.id}>{n.name} ({count} agents)</option>;
            })}
          </select>
          {bridgeForm.fromNet && fromNetAgents.length > 0 && (
            <select
              value={bridgeForm.fromAgent}
              onChange={(e) => setBridgeForm({ ...bridgeForm, fromAgent: e.target.value })}
              style={{ ...inputStyle, border: "1px solid rgba(251,191,36,0.1)", marginTop: 6 }}
            >
              <option value="">Select agent…</option>
              {fromNetGroups.length > 0 ? (
                <>
                  {fromNetGroups.map((g) => {
                    const memberAgents = fromNetAgents.filter(a => g.members.includes(a.id));
                    if (memberAgents.length === 0) return null;
                    return (
                      <optgroup key={g.id} label={`${g.name} (${memberAgents.length})`}>
                        {memberAgents.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({ROLES.find((r) => r.id === a.role)?.label})
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                  {(() => {
                    const groupedIds = new Set(fromNetGroups.flatMap(g => g.members));
                    const ungrouped = fromNetAgents.filter(a => !groupedIds.has(a.id));
                    if (ungrouped.length === 0) return null;
                    return (
                      <optgroup label="Ungrouped">
                        {ungrouped.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({ROLES.find((r) => r.id === a.role)?.label})
                          </option>
                        ))}
                      </optgroup>
                    );
                  })()}
                </>
              ) : (
                fromNetAgents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({ROLES.find((r) => r.id === a.role)?.label})
                  </option>
                ))
              )}
            </select>
          )}
          {bridgeForm.fromNet && fromNetAgents.length === 0 && (
            <div className="bridge-builder__notice">No agents in this network</div>
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
            {ecosystems.filter((n) => n.id !== bridgeForm.fromNet).map((n) => {
              const count = agents.filter(a => a.networkId === n.id).length;
              return <option key={n.id} value={n.id}>{n.name} ({count} agents)</option>;
            })}
          </select>
          {bridgeForm.toNet && toNetAgents.length > 0 && (
            <select
              value={bridgeForm.toAgent}
              onChange={(e) => setBridgeForm({ ...bridgeForm, toAgent: e.target.value })}
              style={{ ...inputStyle, border: "1px solid rgba(251,191,36,0.1)", marginTop: 6 }}
            >
              <option value="">Select agent…</option>
              {toNetGroups.length > 0 ? (
                <>
                  {toNetGroups.map((g) => {
                    const memberAgents = toNetAgents.filter(a => g.members.includes(a.id));
                    if (memberAgents.length === 0) return null;
                    return (
                      <optgroup key={g.id} label={`${g.name} (${memberAgents.length})`}>
                        {memberAgents.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({ROLES.find((r) => r.id === a.role)?.label})
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                  {(() => {
                    const groupedIds = new Set(toNetGroups.flatMap(g => g.members));
                    const ungrouped = toNetAgents.filter(a => !groupedIds.has(a.id));
                    if (ungrouped.length === 0) return null;
                    return (
                      <optgroup label="Ungrouped">
                        {ungrouped.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({ROLES.find((r) => r.id === a.role)?.label})
                          </option>
                        ))}
                      </optgroup>
                    );
                  })()}
                </>
              ) : (
                toNetAgents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({ROLES.find((r) => r.id === a.role)?.label})
                  </option>
                ))
              )}
            </select>
          )}
          {bridgeForm.toNet && toNetAgents.length === 0 && (
            <div className="bridge-builder__notice">No agents in this network</div>
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
