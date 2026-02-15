import { useState } from "react";
import { CommandDefinition } from "../../services/commands/types";

const getCommandColor = (tags: string[]) => {
    if (tags.includes("architect")) return "#fb923c"; // Orange
    if (tags.includes("data")) return "#3b82f6"; // Blue (Primary)
    if (tags.includes("ecosystem")) return "#38bdf8"; // Cyan
    if (tags.includes("agent")) return "#00e5a0"; // Green
    if (tags.includes("channel")) return "#a78bfa"; // Purple
    if (tags.includes("messaging")) return "#f472b6"; // Pink
    if (tags.includes("topology")) return "#38bdf8"; // Cyan/Blue
    if (tags.includes("group")) return "#f472b6"; // Pink coverage
    if (tags.includes("system")) return "#94a3b8"; // Slate
    if (tags.includes("artifact")) return "#fbbf24"; // Amber/Yellow
    if (tags.includes("modification")) return "#ef4444"; // Red
    return "#71717a"; // Default
};

export function CommandCard({ command }: { command: CommandDefinition }) {
    const [isFlipped, setIsFlipped] = useState(false);
    const [animationState, setAnimationState] = useState<"idle" | "pressing" | "flipping">("idle");
    const color = getCommandColor(command.tags);

    const handleClick = () => {
        if (isFlipped) {
            setIsFlipped(false);
            setAnimationState("idle");
            return;
        }
        if (animationState !== "idle") return;
        setAnimationState("pressing");
        setTimeout(() => {
            setIsFlipped(true);
            setAnimationState("flipping");
            setTimeout(() => setAnimationState("idle"), 600);
        }, 200);
    };

    const getTransform = () => {
        if (isFlipped) return "rotateY(180deg)";
        if (animationState === "pressing") return "scale(0.92) rotateY(-15deg)";
        return "scale(1) rotateY(0deg)";
    };

    return (
        <div
            onClick={handleClick}
            style={{
                perspective: "1200px",
                height: 180,
                cursor: "pointer",
                zIndex: isFlipped || animationState !== "idle" ? 10 : 1,
                position: "relative",
                boxSizing: "border-box",
            }}
        >
            <div style={{
                position: "relative",
                width: "100%",
                height: "100%",
                transition: animationState === "pressing" ? "transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)" : "transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)",
                transformStyle: "preserve-3d",
                transform: getTransform(),
                boxSizing: "border-box",
            }}>
                {/* Front */}
                <div style={{
                    position: "absolute",
                    width: "100%",
                    height: "100%",
                    backfaceVisibility: "hidden",
                    background: `linear-gradient(145deg, rgba(255,255,255,0.03) 0%, ${color}05 100%)`,
                    border: `1px solid ${color}30`,
                    borderRadius: 12,
                    padding: 16,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
                    boxSizing: "border-box",
                }}>
                    <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 12 }}>
                            <div style={{
                                fontFamily: "'Space Grotesk', sans-serif",
                                fontWeight: 600,
                                fontSize: 13,
                                color: color,
                                display: "flex", alignItems: "center", gap: 6
                            }}>
                                <span style={{ fontSize: 10, opacity: 0.6 }}>/</span>
                                {command.id}
                            </div>
                            <div style={{
                                fontSize: 10,
                                color: color,
                                border: `1px solid ${color}20`,
                                borderRadius: 4,
                                padding: "2px 6px",
                                background: `${color}10`
                            }}>
                                CMD
                            </div>
                        </div>
                        <div style={{ fontSize: 11, color: "#a1a1aa", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                            {command.description}
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
                        {command.tags.map(tag => (
                            <span key={tag} style={{
                                fontSize: 9,
                                background: `${color}10`,
                                border: `1px solid ${color}10`,
                                borderRadius: 4,
                                padding: "2px 6px",
                                color: color
                            }}>
                                #{tag}
                            </span>

                        ))}
                    </div>
                </div>

                {/* Back */}
                <div style={{
                    position: "absolute",
                    width: "100%",
                    height: "100%",
                    backfaceVisibility: "hidden",
                    background: "#09090b",
                    border: `1px solid ${color}50`,
                    borderRadius: 12,
                    padding: 16,
                    transform: "rotateY(180deg)",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    boxShadow: `0 0 15px ${color}10`,
                    boxSizing: "border-box",
                }}>
                    <div style={{
                        fontSize: 9,
                        color: "#71717a",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        marginBottom: 10,
                        borderBottom: "1px solid rgba(255,255,255,0.06)",
                        paddingBottom: 6,
                        display: "flex", justifyContent: "space-between"
                    }}>
                        <span>Configuration</span>
                        <span style={{ color: color }}>●</span>
                    </div>

                    <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 6, paddingRight: 4 }}>
                        {Object.values(command.args).map(arg => (
                            <div key={arg.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                    <span style={{ color: "#e4e4e7" }}>{arg.name}</span>
                                    {arg.required !== false && <span style={{ color: "#ef4444", fontSize: 12, lineHeight: 0.5 }}>*</span>}
                                </div>
                                <code style={{ color: "#52525b", fontSize: 9, background: "rgba(255,255,255,0.03)", padding: "1px 4px", borderRadius: 3 }}>{arg.type}</code>
                            </div>
                        ))}
                    </div>

                    <div style={{ marginTop: 12, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <div style={{ fontSize: 9, color: "#52525b", marginBottom: 4 }}>Output</div>
                        <div style={{ fontSize: 10, color: "#a1a1aa", lineHeight: 1.4 }}>
                            {command.output}
                        </div>
                    </div>
                </div>
            </div>
        </div>

    );
}
