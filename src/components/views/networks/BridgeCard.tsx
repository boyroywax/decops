import type { Network, Bridge, BridgeMessage } from "../../../types";
import { CHANNEL_TYPES } from "../../../constants";
import { ArrowLeftRight, X } from "lucide-react";

interface BridgeCardProps {
  bridge: Bridge;
  ecosystems: Network[];
  bridgeMessages: BridgeMessage[];
  removeBridge: (id: string) => void;
}

export function BridgeCard({ bridge: b, ecosystems, bridgeMessages, removeBridge }: BridgeCardProps) {
  const fNet = ecosystems.find((n) => n.id === b.fromNetworkId);
  const tNet = ecosystems.find((n) => n.id === b.toNetworkId);
  const fA = fNet?.agents.find((a) => a.id === b.fromAgentId);
  const tA = tNet?.agents.find((a) => a.id === b.toAgentId);
  const bmCount = bridgeMessages.filter((m) => m.bridgeId === b.id).length;

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.05)",
        borderRadius: 10,
        padding: 14,
        transition: "all 0.15s",
      }}
    >
      <div style={{ fontSize: 12, color: "#a1a1aa", marginBottom: 4, fontWeight: 500 }}>
        {fA?.name || "?"} <ArrowLeftRight size={10} color="#fbbf24" style={{ margin: "0 4px" }} /> {tA?.name || "?"}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#52525b" }}>
        <span style={{ color: fNet?.color }}>{fNet?.name}</span>
        <span>→</span>
        <span style={{ color: tNet?.color }}>{tNet?.name}</span>
        {bmCount > 0 && <span style={{ color: "#38bdf8", marginLeft: 6 }}>{bmCount} msgs</span>}
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 8, alignItems: "center" }}>
        <span style={{
          fontSize: 9, padding: "2px 8px", borderRadius: 4,
          background: "rgba(56,189,248,0.06)", color: "#38bdf8",
          border: "1px solid rgba(56,189,248,0.1)",
        }}>
          bridge
        </span>
        <span style={{
          fontSize: 9, padding: "2px 8px", borderRadius: 4,
          background: "rgba(251,191,36,0.06)", color: "#fbbf24",
        }}>
          {CHANNEL_TYPES.find((t) => t.id === b.type)?.label || "Data"}
        </span>
        <button
          onClick={() => removeBridge(b.id)}
          style={{
            background: "transparent",
            border: "1px solid rgba(239,68,68,0.12)",
            color: "#52525b",
            padding: "2px 6px",
            borderRadius: 4,
            fontFamily: "inherit",
            fontSize: 9,
            cursor: "pointer",
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
          }}
        >
          <X size={10} />
        </button>
      </div>
      <div style={{ fontSize: 9, color: "#3f3f46", marginTop: 8, fontStyle: "italic" }}>
        Send messages via the Messages page
      </div>
    </div>
  );
}
