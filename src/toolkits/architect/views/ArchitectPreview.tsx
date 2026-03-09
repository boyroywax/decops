import { Hexagon, ArrowLeftRight, Sparkles, Globe, GitBranch } from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
import { SectionTitle } from "@/components/shared/ui";
import { ROLES, CHANNEL_TYPES, GOVERNANCE_MODELS, NETWORK_COLORS } from "@/constants";
import type { MeshConfig } from "@/types";

interface ArchitectPreviewProps {
    archPreview: MeshConfig;
    deployNetwork: () => void;
    resetArchitect: () => void;
}

export function ArchitectPreview({ archPreview, deployNetwork, resetArchitect }: ArchitectPreviewProps) {
    const networkCount = archPreview.networks?.length || 0;
    const bridgeCount = archPreview.bridges?.length || 0;

    return (
        <div>
            <div style={{ background: "rgba(251,191,36,0.04)", border: "1px solid rgba(251,191,36,0.12)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#fbbf24" }}><GradientIcon icon={Sparkles} size={16} gradient={["#fbbf24", "#fcd34d"]} /> {networkCount > 1 ? "Ecosystem" : "Network"} Blueprint</div>
                    <div style={{ fontSize: 10, color: "#52525b" }}>
                        {networkCount > 0 && `${networkCount} network${networkCount !== 1 ? "s" : ""} · `}
                        {archPreview.agents.length} agents · {archPreview.channels.length} channels · {archPreview.groups?.length || 0} groups
                        {bridgeCount > 0 && ` · ${bridgeCount} bridge${bridgeCount !== 1 ? "s" : ""}`}
                    </div>
                </div>

                {/* Networks */}
                {archPreview.networks && archPreview.networks.length > 0 && (
                    <>
                        <SectionTitle text="Networks" />
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, marginBottom: 20 }}>
                            {archPreview.networks.map((n, i) => {
                                const color = NETWORK_COLORS[i % NETWORK_COLORS.length];
                                const agentCount = n.agents?.length || 0;
                                return (
                                    <div key={i} style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${color}30`, borderRadius: 8, padding: 12 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                                            <Globe size={14} color={color} />
                                            <div style={{ fontSize: 12, fontWeight: 500, color }}>{n.name}</div>
                                        </div>
                                        {n.description && <div style={{ fontSize: 9, color: "#a1a1aa", lineHeight: 1.4, marginBottom: 4 }}>{n.description}</div>}
                                        <div style={{ fontSize: 9, color: "#71717a" }}>{agentCount} agent{agentCount !== 1 ? "s" : ""}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}

                <SectionTitle text="Agents" />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10, marginBottom: 20 }}>
                    {archPreview.agents.map((a, i) => {
                        const role = ROLES.find(r => r.id === a.role) || ROLES[0];
                        const networkIdx = archPreview.networks?.findIndex(n => n.agents?.includes(i)) ?? -1;
                        const networkColor = networkIdx >= 0 ? NETWORK_COLORS[networkIdx % NETWORK_COLORS.length] : undefined;
                        const networkName = networkIdx >= 0 ? archPreview.networks![networkIdx].name : undefined;
                        return (
                            <div key={i} style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${role.color}20`, borderRadius: 8, padding: 12 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                    <span style={{ fontSize: 14 }}>{role.icon}</span>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 12, fontWeight: 500 }}>{a.name}</div>
                                        <div style={{ fontSize: 9, color: role.color }}>{role.label}</div>
                                    </div>
                                    {networkName && (
                                        <div style={{ fontSize: 8, padding: "2px 6px", borderRadius: 4, background: `${networkColor}15`, color: networkColor, display: "flex", alignItems: "center", gap: 3 }}>
                                            <Globe size={9} color={networkColor} /> {networkName}
                                        </div>
                                    )}
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

                {archPreview.bridges && archPreview.bridges.length > 0 && (
                    <>
                        <SectionTitle text="Bridges" />
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
                            {archPreview.bridges.map((b, i) => {
                                const fromNet = archPreview.networks?.[b.fromNetwork];
                                const toNet = archPreview.networks?.[b.toNetwork];
                                const fromAgent = archPreview.agents[b.fromAgent];
                                const toAgent = archPreview.agents[b.toAgent];
                                const fromColor = NETWORK_COLORS[b.fromNetwork % NETWORK_COLORS.length];
                                const toColor = NETWORK_COLORS[b.toNetwork % NETWORK_COLORS.length];
                                const cType = CHANNEL_TYPES.find(t => t.id === b.type) || CHANNEL_TYPES[0];
                                if (!fromNet || !toNet || !fromAgent || !toAgent) return null;
                                return (
                                    <div key={i} style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(251,191,36,0.15)", borderRadius: 8, padding: 12, minWidth: "min(260px, 100%)" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 10 }}>
                                            <div style={{ textAlign: "center" }}>
                                                <div style={{ color: fromColor, fontWeight: 500, fontSize: 10 }}>{fromNet.name}</div>
                                                <div style={{ color: "#a1a1aa", fontSize: 9 }}>{fromAgent.name}</div>
                                            </div>
                                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                                                <GitBranch size={12} color="#fbbf24" />
                                                <span style={{ fontSize: 8, color: "#71717a" }}>{cType.label}</span>
                                            </div>
                                            <div style={{ textAlign: "center" }}>
                                                <div style={{ color: toColor, fontWeight: 500, fontSize: 10 }}>{toNet.name}</div>
                                                <div style={{ color: "#a1a1aa", fontSize: 9 }}>{toAgent.name}</div>
                                            </div>
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
                }}><GradientIcon icon={Hexagon} size={16} gradient={["#f472b6", "#ec4899"]} /> Deploy Ecosystem</button>
                <button onClick={resetArchitect} style={{
                    background: "transparent", border: "1px solid rgba(255,255,255,0.08)",
                    color: "#71717a", padding: "12px 20px", borderRadius: 8, cursor: "pointer",
                    fontFamily: "inherit", fontSize: 12,
                }}>Discard</button>
            </div>
        </div>
    );
}
