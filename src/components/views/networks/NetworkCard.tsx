import type { Network, Bridge } from "../../../types";
import { ROLES, CHANNEL_TYPES } from "../../../constants";
import {
  Globe, Download, Trash2, Link2,
  ChevronDown, ChevronUp, Star,
} from "lucide-react";

interface NetworkCardProps {
  net: Network;
  bridges: Bridge[];
  ecosystems: Network[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  loadNetwork: (id: string) => void;
  dissolveNetwork: (id: string) => void;
  isActive?: boolean;
  onSetActive?: () => void;
}

export function NetworkCard({
  net, bridges, ecosystems,
  isExpanded, onToggleExpand,
  loadNetwork, dissolveNetwork,
  isActive, onSetActive,
}: NetworkCardProps) {
  const netBridges = bridges.filter(
    (b) => b.fromNetworkId === net.id || b.toNetworkId === net.id
  );

  return (
    <div
      style={{
        background: isActive ? `${net.color}08` : "rgba(255,255,255,0.02)",
        border: `1px solid ${isActive ? net.color + '40' : net.color + '20'}`,
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
                {net.agents.length} agents · {net.channels.length} ch · {net.groups.length} groups
                {netBridges.length > 0 && <span style={{ color: "#fbbf24" }}> · {netBridges.length} bridges</span>}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {isActive && (
              <span style={{
                fontSize: 8,
                padding: "2px 6px",
                borderRadius: 4,
                background: `${net.color}18`,
                color: net.color,
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}>
                Active
              </span>
            )}
            <div style={{
              width: 10, height: 10, borderRadius: "50%",
              background: net.color,
              boxShadow: `0 0 10px ${net.color}60`,
            }} />
          </div>
        </div>

        {/* Agent pills */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
          {net.agents.slice(0, 5).map((a) => {
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
          {net.agents.length > 5 && (
            <span style={{ fontSize: 9, padding: "3px 8px", color: "#52525b" }}>
              +{net.agents.length - 5}
            </span>
          )}
        </div>

        {/* DID */}
        <div style={{ fontSize: 9, color: "#3f3f46", fontFamily: "monospace", marginBottom: 12, wordBreak: "break-all" }}>
          {net.did}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 6 }}>
          {onSetActive && (
            <button
              onClick={onSetActive}
              style={{
                background: isActive ? `${net.color}18` : "rgba(255,255,255,0.03)",
                border: `1px solid ${isActive ? net.color + '35' : 'rgba(255,255,255,0.06)'}`,
                color: isActive ? net.color : "#71717a",
                padding: "6px 14px",
                borderRadius: 6,
                fontFamily: "inherit",
                fontSize: 10,
                cursor: "pointer",
                fontWeight: isActive ? 600 : 500,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Star size={11} fill={isActive ? net.color : "none"} /> {isActive ? "Active" : "Set Active"}
            </button>
          )}
          <button
            onClick={() => loadNetwork(net.id)}
            style={{
              background: `${net.color}10`,
              border: `1px solid ${net.color}25`,
              color: net.color,
              padding: "6px 14px",
              borderRadius: 6,
              fontFamily: "inherit",
              fontSize: 10,
              cursor: "pointer",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Download size={11} /> Load
          </button>
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
            {net.agents.map((a) => {
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

          {net.channels.length > 0 && (
            <>
              <div style={{ fontSize: 10, color: "#71717a", marginBottom: 8, fontWeight: 500 }}>CHANNELS ({net.channels.length})</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
                {net.channels.map((ch) => {
                  const t = CHANNEL_TYPES.find((x) => x.id === ch.type);
                  const fromA = net.agents.find((a) => a.id === ch.from);
                  const toA = net.agents.find((a) => a.id === ch.to);
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
