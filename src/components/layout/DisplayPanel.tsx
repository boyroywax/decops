import { useState, useEffect, useRef } from "react";
import { X, Monitor, Sun, Moon, Sunrise, ChevronsUp, ChevronsDown, PanelBottom, PanelLeft, PanelRight } from "lucide-react";
import { useTheme, type Theme, type ChatPosition } from "../../context/ThemeContext";
import "../../styles/components/display-panel.css";

interface DisplayPanelProps {
    onClose: () => void;
    height: number;
    setHeight: (h: number) => void;
    isExpanded: boolean;
    onToggleExpand: () => void;
}

const THEMES: { id: Theme; label: string; icon: typeof Sun; desc: string }[] = [
    { id: "dark", label: "Dark", icon: Moon, desc: "Default dark interface" },
    { id: "light", label: "Light", icon: Sun, desc: "Bright, high-contrast" },
    { id: "solar", label: "Solar", icon: Sunrise, desc: "Warm amber tones" },
];

const CHAT_POSITIONS: { id: ChatPosition; label: string; icon: typeof PanelBottom; desc: string }[] = [
    { id: "bottom", label: "Bottom", icon: PanelBottom, desc: "Below content" },
    { id: "left",   label: "Left",   icon: PanelLeft,   desc: "Left sidebar" },
    { id: "right",  label: "Right",  icon: PanelRight,  desc: "Right sidebar" },
];

export function DisplayPanel({ onClose, height, setHeight, isExpanded, onToggleExpand }: DisplayPanelProps) {
    const { theme, setTheme, chatPosition, setChatPosition } = useTheme();
    const [isResizing, setIsResizing] = useState(false);
    const startYRef = useRef(0);
    const startHeightRef = useRef(0);

    /* ── Resize logic (same as other panels) ── */
    const startResizing = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
        startYRef.current = e.clientY;
        startHeightRef.current = height;
    };

    useEffect(() => {
        if (!isResizing) return;
        const resize = (e: MouseEvent) => {
            const delta = startYRef.current - e.clientY;
            setHeight(Math.max(200, Math.min(window.innerHeight - 93, startHeightRef.current + delta)));
        };
        const stop = () => setIsResizing(false);
        window.addEventListener("mousemove", resize);
        window.addEventListener("mouseup", stop);
        return () => { window.removeEventListener("mousemove", resize); window.removeEventListener("mouseup", stop); };
    }, [isResizing, setHeight]);

    return (
        <div className={`display-panel${isResizing ? " display-panel--resizing" : ""}`} style={{ height }}>
            {/* Resize Handle */}
            <div onMouseDown={startResizing} className="display-panel__resize-handle">
                <div className="display-panel__resize-grip" />
            </div>

            {/* Header */}
            <div className="display-panel__header">
                <div className="display-panel__header-left">
                    <span className="display-panel__title">
                        <Monitor size={10} /> DISPLAY
                    </span>
                </div>
                <div className="display-panel__header-actions">
                    <button
                        onClick={onToggleExpand}
                        className="display-panel__expand-btn"
                        title={isExpanded ? "Collapse panel" : "Expand panel"}
                    >
                        {isExpanded ? <ChevronsDown size={14} /> : <ChevronsUp size={14} />}
                    </button>
                    <button onClick={onClose} className="display-panel__close-btn" title="Close display">
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Body */}
            <div className="display-panel__body">
                {/* ── Theme Section ── */}
                <div className="display-panel__section">
                    <div className="display-panel__section-title">Theme</div>
                    <div className="display-panel__theme-grid">
                        {THEMES.map(t => {
                            const Icon = t.icon;
                            const isActive = theme === t.id;
                            return (
                                <button
                                    key={t.id}
                                    className={`display-panel__theme-btn${isActive ? " display-panel__theme-btn--active" : ""}`}
                                    onClick={() => setTheme(t.id)}
                                >
                                    <Icon size={18} className="display-panel__theme-icon" />
                                    <span className="display-panel__theme-label">{t.label}</span>
                                    <span className="display-panel__theme-desc">{t.desc}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ── Chat Position Section ── */}
                <div className="display-panel__section">
                    <div className="display-panel__section-title">Chat Position</div>
                    <div className="display-panel__theme-grid">
                        {CHAT_POSITIONS.map(p => {
                            const Icon = p.icon;
                            const isActive = chatPosition === p.id;
                            return (
                                <button
                                    key={p.id}
                                    className={`display-panel__theme-btn${isActive ? " display-panel__theme-btn--active" : ""}`}
                                    onClick={() => setChatPosition(p.id)}
                                >
                                    <Icon size={18} className="display-panel__theme-icon" />
                                    <span className="display-panel__theme-label">{p.label}</span>
                                    <span className="display-panel__theme-desc">{p.desc}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
