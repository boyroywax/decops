import { Hexagon } from "lucide-react";
import { GradientIcon } from "../../shared/GradientIcon";
import type { DeployProgress } from "../../../types";

interface ArchitectDeployingProps {
    deployProgress: DeployProgress;
}

export function ArchitectDeploying({ deployProgress }: ArchitectDeployingProps) {
    return (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 16, animation: "pulse 1.5s infinite" }}><GradientIcon icon={Hexagon} size={40} gradient={["#f472b6", "#ec4899"]} /></div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 600, color: "#fbbf24", marginBottom: 8 }}>Deploying Mesh Network</div>
            <div style={{ fontSize: 11, color: "#71717a", marginBottom: 20 }}>{deployProgress.step}</div>
            <div style={{ maxWidth: 300, margin: "0 auto", background: "rgba(255,255,255,0.04)", borderRadius: 6, height: 6, overflow: "hidden" }}>
                <div style={{
                    height: "100%", background: "#fbbf24", borderRadius: 6,
                    width: `${deployProgress.total > 0 ? (deployProgress.count / deployProgress.total) * 100 : 0}%`,
                    transition: "width 0.3s",
                }} />
            </div>
            <div style={{ fontSize: 10, color: "#52525b", marginTop: 8 }}>{deployProgress.count} / {deployProgress.total}</div>
        </div>
    );
}
