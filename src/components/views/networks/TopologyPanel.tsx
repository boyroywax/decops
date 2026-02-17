import type { Network, Bridge } from "../../../types";
import { Layers } from "lucide-react";
import { EcosystemCanvas } from "../../canvas/EcosystemCanvas";

interface TopologyPanelProps {
  ecosystems: Network[];
  bridges: Bridge[];
  activeBridges: Set<string>;
}

export function TopologyPanel({ ecosystems, bridges, activeBridges }: TopologyPanelProps) {
  if (ecosystems.length >= 2) {
    return (
      <div style={{
        background: "rgba(0,0,0,0.3)",
        border: "1px solid rgba(56,189,248,0.08)",
        borderRadius: 14,
        height: "calc(100vh - 260px)",
        overflow: "hidden",
      }}>
        <EcosystemCanvas networks={ecosystems} bridges={bridges} activeBridges={activeBridges} />
      </div>
    );
  }

  return (
    <div style={{
      textAlign: "center",
      padding: 60,
      color: "#3f3f46",
      border: "1px dashed rgba(56,189,248,0.1)",
      borderRadius: 14,
      height: 300,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      <div>
        <Layers size={28} color="#3f3f46" style={{ marginBottom: 8 }} />
        <div style={{ fontSize: 12, marginBottom: 8, color: "#52525b" }}>
          Topology requires at least 2 networks
        </div>
        <div style={{ fontSize: 11, color: "#3f3f46" }}>
          Save or create networks to visualize the ecosystem topology.
        </div>
      </div>
    </div>
  );
}
