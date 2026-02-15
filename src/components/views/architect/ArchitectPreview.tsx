import { Hexagon, ArrowLeftRight, Sparkles } from "lucide-react";
import { GradientIcon } from "../../shared/GradientIcon";
import { SectionTitle } from "../../shared/ui";
import { ROLES, CHANNEL_TYPES, GOVERNANCE_MODELS } from "../../../constants";
import type { MeshConfig } from "../../../types";

interface ArchitectPreviewProps {
    archPreview: MeshConfig;
    deployNetwork: () => void;
    resetArchitect: () => void;
}

export function ArchitectPreview({ archPreview, deployNetwork, resetArchitect }: ArchitectPreviewProps) {
    return (
        <div>
            <div style={{ background: "rgba(251,191,36,0.04)", border: "1px solid rgba(251,191,36,0.12)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#fbbf24" }}><GradientIcon icon={Sparkles} size={16} gradient={["#fbbf24", "#fcd34d"]} /> Network Blueprint</div>
                    <div style={{ fontSize: 10, color: "#52525b" }}>
                        {archPreview.agents.length} agents · {archPreview.channels.length} channels · {archPreview.groups?.length || 0} groups · {archPreview.exampleMessages?.length || 0} messages
                    </div>
                </div>

                <SectionTitle text="Agents" />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10, marginBottom: 20 }}>
                    {archPreview.agents.map((a, i) => {
                        const role = ROLES.find(r => r.id === a.role) || ROLES[0];
                        return (
                            <div key={i} style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${role.color}20`, borderRadius: 8, padding: 12 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                    <span style={{ fontSize: 14 }}>{role.icon}</span>
                                    <div>
                                        <div style={{ fontSize: 12, fontWeight: 500 }}>{a.name}</div>
                                        <div style={{ fontSize: 9, color: role.color }}>{role.label}</div>
                                    </div>
                                </div>
                                <div style={{ fontSize: 9, color: "#a1a1aa", lineHeight: 1.5, maxHeight: 54, overflow: "hidden" }}>{a.prompt}</div>
                            </div>
                        );
                    })}
                </div>

                <SectionTitle text="Channels" />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
                    {archPreview.channels.map((c, i) => {
                        const from = archPreview.agents[c.from];
                        const to = archPreview.agents[c.to];
                        const cType = CHANNEL_TYPES.find(t => t.id === c.type) || CHANNEL_TYPES[0];
                        if (!from || !to) return null;
                        return (
                            <div key={i} style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(167,139,250,0.15)", borderRadius: 6, padding: "8px 12px", fontSize: 10 }}>
                                <span style={{ color: "#d4d4d8" }}>{from.name}</span>
                                <span style={{ color: "#52525b", margin: "0 6px" }}><ArrowLeftRight size={12} color="#52525b" /></span>
                                <span style={{ color: "#d4d4d8" }}>{to.name}</span>
                                <span style={{ color: "#a78bfa", marginLeft: 8 }}>{cType.icon} {cType.label}</span>
                            </div>
                        );
                    })}
                </div>

                {archPreview.groups && archPreview.groups.length > 0 && (
                    <>
                        <SectionTitle text="Groups" />
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
                            {archPreview.groups.map((g, i) => {
                                const gov = GOVERNANCE_MODELS.find(m => m.id === g.governance) || GOVERNANCE_MODELS[0];
                                return (
                                    <div key={i} style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(244,114,182,0.15)", borderRadius: 8, padding: 12, minWidth: "min(200px, 100%)" }}>
                                        <div style={{ fontSize: 12, fontWeight: 500, color: "#f472b6", marginBottom: 4 }}><GradientIcon icon={Hexagon} size={16} gradient={["#f472b6", "#ec4899"]} /> {g.name}</div>
                                        <div style={{ fontSize: 9, color: "#71717a", marginBottom: 6 }}>{gov.icon} {gov.label}</div>
                                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                            {g.members.map((idx) => {
                                                const a = archPreview.agents[idx];
                                                if (!a) return null;
                                                return <span key={idx} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "rgba(255,255,255,0.04)", color: "#a1a1aa" }}>{a.name}</span>;
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}

                {archPreview.exampleMessages && archPreview.exampleMessages.length > 0 && (
                    <>
                        <SectionTitle text="Example Messages (will trigger AI responses)" />
                        {archPreview.exampleMessages.map((em, i) => {
                            const ch = archPreview.channels[em.channelIdx];
                            const from = ch ? archPreview.agents[ch.from] : null;
                            const to = ch ? archPreview.agents[ch.to] : null;
                            if (!from || !to) return null;
                            return (
                                <div key={i} style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 6, padding: "10px 12px", marginBottom: 8 }}>
                                    <div style={{ fontSize: 9, color: "#52525b", marginBottom: 4 }}>{from.name} → {to.name}</div>
                                    <div style={{ fontSize: 11, color: "#d4d4d8", lineHeight: 1.5 }}>{em.message}</div>
                                </div>
                            );
                        })}
                    </>
                )}
            </div>

            <div style={{ display: "flex", gap: 12 }}>
                <button onClick={deployNetwork} style={{
                    background: "#fbbf24", color: "#0a0a0f", border: "none",
                    padding: "12px 28px", borderRadius: 8, cursor: "pointer",
                    fontFamily: "inherit", fontSize: 13, fontWeight: 600,
                }}><GradientIcon icon={Hexagon} size={16} gradient={["#f472b6", "#ec4899"]} /> Deploy Network</button>
                <button onClick={resetArchitect} style={{
                    background: "transparent", border: "1px solid rgba(255,255,255,0.08)",
                    color: "#71717a", padding: "12px 20px", borderRadius: 8, cursor: "pointer",
                    fontFamily: "inherit", fontSize: 12,
                }}>Discard</button>
            </div>
        </div>
    );
}
