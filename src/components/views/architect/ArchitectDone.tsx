import { Globe, Bot, Sparkles } from "lucide-react";
import { useWorkspaceContext } from "../../../context/WorkspaceContext";
import type { ViewId } from "../../../types";

interface ArchitectDoneProps {
    setView: (v: ViewId) => void;
    resetArchitect: () => void;
}

export function ArchitectDone({ setView, resetArchitect }: ArchitectDoneProps) {
    const { agents, channels, groups, messages } = useWorkspaceContext();

    return (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 600, color: "#00e5a0", marginBottom: 8 }}>Network Deployed</div>
            <div style={{ fontSize: 11, color: "#71717a", marginBottom: 24 }}>
                {agents.length} agents · {channels.length} channels · {groups.length} groups · {messages.length} messages
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                <button onClick={() => setView("network")} style={{ background: "rgba(0,229,160,0.12)", border: "1px solid rgba(0,229,160,0.25)", color: "#00e5a0", padding: "10px 20px", borderRadius: 8, fontFamily: "inherit", fontSize: 11, cursor: "pointer" }}>◈ View Network</button>
                <button onClick={() => setView("ecosystem")} style={{ background: "rgba(56,189,248,0.12)", border: "1px solid rgba(56,189,248,0.25)", color: "#38bdf8", padding: "10px 20px", borderRadius: 8, fontFamily: "inherit", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><Globe size={14} /> Save to Ecosystem</button>
                <button onClick={() => setView("agents")} style={{ background: "rgba(0,229,160,0.08)", border: "1px solid rgba(0,229,160,0.15)", color: "#00e5a0", padding: "10px 20px", borderRadius: 8, fontFamily: "inherit", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><Bot size={14} /> Browse Agents</button>
                <button onClick={resetArchitect} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#71717a", padding: "10px 20px", borderRadius: 8, fontFamily: "inherit", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><Sparkles size={14} /> Build Another</button>
            </div>
        </div>
    );
}
