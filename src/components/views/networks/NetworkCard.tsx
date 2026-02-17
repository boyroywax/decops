import type { Network, Bridge, Agent, Channel, Group } from "../../../types";
import { ROLES, CHANNEL_TYPES } from "../../../constants";
import {
  Globe, Trash2, Link2,
  ChevronDown, ChevronUp,
} from "lucide-react";

interface NetworkCardProps {
  net: Network;
  bridges: Bridge[];
  ecosystems: Network[];
  workspaceAgents: Agent[];
  workspaceChannels: Channel[];
  workspaceGroups: Group[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  dissolveNetwork: (id: string) => void;
}

export function NetworkCard({
  net, bridges, ecosystems,
  workspaceAgents, workspaceChannels, workspaceGroups,
  isExpanded, onToggleExpand,
  dissolveNetwork,
}: NetworkCardProps) {
  // Filter workspace entities by networkId for live counts
  const networkAgents = workspaceAgents.filter(a => a.networkId === net.id);
  const networkChannels = workspaceChannels.filter(c => c.networkId === net.id);
  const networkGroups = workspaceGroups.filter(g => g.networkId === net.id);
  const netBridges = bridges.filter(
    (b) => b.fromNetworkId === net.id || b.toNetworkId === net.id
  );

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.02)",
        border: `1px solid ${net.color}20`,
        borderRadius: 14,
        overflow: "hidden",
        transition: "all 0.2s",
      }}
    >
      {/* Card Header */}
      <div style={{ padding: 18 }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 12,
        }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: `${net.color}15`,
              border: `1px solid ${net.color}30`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Globe size={18} color={net.color} />
            </div>
            <div>
              <div style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 600,
                fontSize: 14,
                color: "#e4e4e7",
              }}>
                {net.name}
              </div>
              <div style={{ fontSize: 9, color: "#52525b", marginTop: 2 }}>
                {networkAgents.length} agents · {networkChannels.length} ch · {networkGroups.length} groups
                {netBridges.length > 0 && <span style={{ color: "#fbbf24" }}> · {netBridges.length} bridges</span>}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 10, height: 10, borderRadius: "50%",
              background: net.color,
              boxShadow: `0 0 10px ${net.color}60`,
            }} />
          </div>
        </div>

        {/* Agent pills */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
          {networkAgents.slice(0, 5).map((a) => {
            const r = ROLES.find((x) => x.id === a.role);
            return (
              <span
                key={a.id}
                style={{
                  fontSize: 9,
                  padding: "3px 8px",
                  borderRadius: 4,
                  background: (r?.color || "#555") + "10",
                  color: r?.color || "#555",
                  border: `1px solid ${(r?.color || "#555")}15`,
                }}
              >
                {r?.char} {a.name}
              </span>
            );
          })}
          {networkAgents.length > 5 && (
            <span style={{ fontSize: 9, padding: "3px 8px", color: "#52525b" }}>
              +{networkAgents.length - 5}
            </span>
          )}
        </div>

        {/* DID */}
        <div style={{ fontSize: 9, color: "#3f3f46", fontFamily: "monospace", marginBottom: 12, wordBreak: "break-all" }}>
          {net.did}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={onToggleExpand}
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              color: "#71717a",
              padding: "6px 10px",
              borderRadius: 6,
              fontFamily: "inherit",
              fontSize: 10,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            Details
          </button>
          <button
            onClick={() => dissolveNetwork(net.id)}
            style={{
              background: "rgba(239,68,68,0.06)",
              border: "1px solid rgba(239,68,68,0.12)",
              color: "#71717a",
              padding: "6px 10px",
              borderRadius: 6,
              fontFamily: "inherit",
              fontSize: 10,
              cursor: "pointer",
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
            }}
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {/* Expanded Detail */}
      {isExpanded && (
        <div style={{
          borderTop: `1px solid ${net.color}15`,
          padding: 16,
          background: "rgba(0,0,0,0.15)",
        }}>
          <div style={{ fontSize: 10, color: "#71717a", marginBottom: 8, fontWeight: 500 }}>AGENTS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
            {networkAgents.map((a) => {
              const r = ROLES.find((x) => x.id === a.role);
              return (
                <div key={a.id} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  fontSize: 11, color: "#a1a1aa",
                  padding: "4px 8px",
                  background: "rgba(255,255,255,0.02)",
                  borderRadius: 4,
                }}>
                  <span style={{ color: r?.color }}>{r?.icon}</span>
                  <span>{a.name}</span>
                  <span style={{ fontSize: 9, color: "#52525b", marginLeft: "auto" }}>{r?.label}</span>
                </div>
              );
            })}
          </div>

          {networkChannels.length > 0 && (
            <>
              <div style={{ fontSize: 10, color: "#71717a", marginBottom: 8, fontWeight: 500 }}>CHANNELS ({networkChannels.length})</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
                {networkChannels.map((ch) => {
                  const t = CHANNEL_TYPES.find((x) => x.id === ch.type);
                  const fromA = networkAgents.find((a) => a.id === ch.from);
                  const toA = networkAgents.find((a) => a.id === ch.to);
                  return (
                    <span key={ch.id} style={{
                      fontSize: 9, padding: "3px 8px", borderRadius: 4,
                      background: "rgba(167,139,250,0.06)",
                      color: "#a78bfa",
                      border: "1px solid rgba(167,139,250,0.12)",
                    }}>
                      {fromA?.name} → {toA?.name} ({t?.label})
                    </span>
                  );
                })}
              </div>
            </>
          )}

          {netBridges.length > 0 && (
            <>
              <div style={{ fontSize: 10, color: "#71717a", marginBottom: 8, fontWeight: 500 }}>BRIDGES ({netBridges.length})</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {netBridges.map((b) => {
                  const otherNet = ecosystems.find((n) =>
                    n.id === (b.fromNetworkId === net.id ? b.toNetworkId : b.fromNetworkId)
                  );
                  return (
                    <span key={b.id} style={{
                      fontSize: 9, padding: "3px 8px", borderRadius: 4,
                      background: "rgba(251,191,36,0.06)",
                      color: "#fbbf24",
                      border: "1px solid rgba(251,191,36,0.12)",
                    }}>
                      <Link2 size={9} /> ↔ {otherNet?.name || "?"}
                    </span>
                  );
                })}
              </div>
            </>
          )}

          <div style={{ fontSize: 9, color: "#3f3f46", marginTop: 8 }}>
            Created {new Date(net.createdAt).toLocaleDateString()}
          </div>
        </div>
      )}
    </div>
  );
}
