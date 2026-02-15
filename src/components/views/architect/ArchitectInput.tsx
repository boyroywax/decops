import type { Dispatch, SetStateAction } from "react";
import { Sparkles } from "lucide-react";
import { GradientIcon } from "../../shared/GradientIcon";
import { SectionTitle, inputStyle } from "../../shared/ui";
import { SCENARIO_PRESETS } from "../../../constants";

interface ArchitectInputProps {
    archPrompt: string;
    setArchPrompt: Dispatch<SetStateAction<string>>;
    archGenerating: boolean;
    archError: string | null;
    generateNetwork: (desc: string) => void;
}

export function ArchitectInput({
    archPrompt,
    setArchPrompt,
    archGenerating,
    archError,
    generateNetwork,
}: ArchitectInputProps) {
    return (
        <>
            <SectionTitle text="Quick Scenarios" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 10, marginBottom: 24 }}>
                {SCENARIO_PRESETS.map((s) => (
                    <button key={s.id} onClick={() => setArchPrompt(s.desc)} style={{
                        background: archPrompt === s.desc ? s.color + "10" : "rgba(255,255,255,0.02)",
                        border: `1px solid ${archPrompt === s.desc ? s.color + "35" : "rgba(255,255,255,0.05)"}`,
                        borderRadius: 10, padding: 14, cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "all 0.15s",
                    }}>
                        <div style={{ fontSize: 18, marginBottom: 6 }}>{s.icon}</div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: archPrompt === s.desc ? s.color : "#d4d4d8", marginBottom: 4 }}>{s.label}</div>
                        <div style={{ fontSize: 9, color: "#52525b", lineHeight: 1.5 }}>{s.desc}</div>
                    </button>
                ))}
            </div>

            <SectionTitle text="Or describe your own network" />
            <textarea
                placeholder="Describe the mesh network you want to build. Be specific about agent roles, how they should collaborate, what kind of decisions need group governance, and what problems they're solving together..."
                value={archPrompt}
                onChange={(e) => setArchPrompt(e.target.value)}
                rows={5}
                style={{ ...inputStyle, border: "1px solid rgba(251,191,36,0.15)", lineHeight: 1.6, marginBottom: 16 }}
            />

            {archError && (
                <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "10px 14px", fontSize: 11, color: "#ef4444", marginBottom: 16 }}>
                    {archError}
                </div>
            )}

            <button
                onClick={() => archPrompt.trim() && generateNetwork(archPrompt.trim())}
                disabled={archGenerating || !archPrompt.trim()}
                style={{
                    background: archGenerating ? "rgba(251,191,36,0.15)" : archPrompt.trim() ? "#fbbf24" : "#3f3f46",
                    color: archGenerating ? "#fbbf24" : "#0a0a0f",
                    border: archGenerating ? "1px solid rgba(251,191,36,0.3)" : "none",
                    padding: "12px 28px", borderRadius: 8, cursor: archGenerating || !archPrompt.trim() ? "not-allowed" : "pointer",
                    fontFamily: "inherit", fontSize: 13, fontWeight: 600,
                    display: "flex", alignItems: "center", gap: 8,
                }}
            >
                {archGenerating && <span style={{ animation: "pulse 1.5s infinite" }}><GradientIcon icon={Sparkles} size={16} gradient={["#fbbf24", "#fcd34d"]} /></span>}
                {archGenerating ? "Architecting mesh network…" : <><GradientIcon icon={Sparkles} size={16} gradient={["#fbbf24", "#fcd34d"]} /> Generate Network</>}
            </button>
        </>
    );
}
