import { useState } from "react";
import { CommandDefinition } from "../../services/commands/types";
import { Play } from "lucide-react";
import "../../styles/components/command-card.css";

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

interface CommandCardProps {
    command: CommandDefinition;
    onRun?: () => void;
}

export function CommandCard({ command, onRun }: CommandCardProps) {
    const [isFlipped, setIsFlipped] = useState(false);
    const [animationState, setAnimationState] = useState<"idle" | "pressing" | "flipping">("idle");
    const color = getCommandColor(command.tags);

    const handleClick = () => {
        if (isFlipped) {
            setAnimationState("flipping");
            setIsFlipped(false);
            setTimeout(() => setAnimationState("idle"), 600);
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

    const handleRunClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onRun?.();
    };

    const getTransform = () => {
        if (isFlipped) return "rotateY(180deg)";
        if (animationState === "pressing") return "scale(0.92) rotateY(-15deg)";
        return "scale(1) rotateY(0deg)";
    };

    const getTransitionClass = () => {
        if (animationState === "pressing") return "cmd-card__inner--pressing";
        if (animationState === "flipping" || isFlipped) return "cmd-card__inner--flipping";
        return "";
    };

    return (
        <div
            onClick={handleClick}
            className={`cmd-card${(isFlipped || animationState !== "idle") ? " cmd-card--elevated" : ""}`}
        >
            <div className={`cmd-card__inner ${getTransitionClass()}`} style={{ transform: getTransform() }}>
                {/* Front */}
                <div className="cmd-card__front" style={{
                    background: `linear-gradient(145deg, rgba(255,255,255,0.03) 0%, ${color}05 100%)`,
                    border: `1px solid ${color}30`,
                }}>
                    <div>
                        <div className="cmd-card__front-header">
                            <div className="cmd-card__name" style={{ color }}>
                                <span className="cmd-card__slash">/</span>
                                {command.id}
                            </div>
                            <div className="cmd-card__header-right">
                                {onRun && (
                                    <button
                                        onClick={handleRunClick}
                                        className="cmd-card__run-btn"
                                        style={{
                                            background: `${color}20`,
                                            border: `1px solid ${color}40`,
                                            color,
                                        }}
                                        title="Run Command"
                                    >
                                        <Play size={10} fill={color} />
                                    </button>
                                )}
                                <div className="cmd-card__type-badge" style={{
                                    color,
                                    border: `1px solid ${color}20`,
                                    background: `${color}10`,
                                }}>
                                    CMD
                                </div>
                            </div>
                        </div>
                        <div className="cmd-card__description">
                            {command.description}
                        </div>
                    </div>
                    <div className="cmd-card__tags">
                        {command.tags.map(tag => (
                            <span key={tag} className="cmd-card__tag" style={{
                                background: `${color}10`,
                                border: `1px solid ${color}10`,
                                color,
                            }}>
                                #{tag}
                            </span>
                        ))}
                    </div>
                </div>

                {/* Back */}
                <div className="cmd-card__back" style={{
                    border: `1px solid ${color}50`,
                    boxShadow: `0 0 15px ${color}10`,
                }}>
                    <div className="cmd-card__config-header">
                        <span>Configuration</span>
                        <span style={{ color }}>●</span>
                    </div>

                    <div className="cmd-card__args-list">
                        {Object.values(command.args).map(arg => (
                            <div key={arg.name} className="cmd-card__arg-row">
                                <div className="cmd-card__arg-name-group">
                                    <span className="cmd-card__arg-name">{arg.name}</span>
                                    {arg.required !== false && <span className="cmd-card__arg-required">*</span>}
                                </div>
                                <code className="cmd-card__arg-type">{arg.type}</code>
                            </div>
                        ))}
                    </div>

                    <div className="cmd-card__footer">
                        {onRun && (
                            <button
                                onClick={handleRunClick}
                                className="cmd-card__back-run-btn"
                                style={{
                                    background: `${color}20`,
                                    border: `1px solid ${color}40`,
                                    color,
                                }}
                            >
                                <Play size={10} fill={color} /> Run Command
                            </button>
                        )}
                        {!onRun && (
                            <>
                                <div className="cmd-card__output-label">Output</div>
                                <div className="cmd-card__output-text">
                                    {command.output}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>

    );
}
