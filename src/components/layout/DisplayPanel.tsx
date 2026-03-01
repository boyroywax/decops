import { useState, useEffect, useRef } from "react";
import { X, Monitor, Sun, Moon, Sunrise, ChevronsUp, ChevronsDown, PanelBottom, PanelLeft, PanelRight, Paintbrush, Plus, Trash2, Palette, Wrench, Image } from "lucide-react";
import { useTheme, type Theme, type ChatPosition, type GraphicsPreset, GRAPHICS_PRESETS } from "../../context/ThemeContext";
import { clearPortraitCache } from "../../services/portraitCache";
import { getPortraitOptions, setPortraitOptions } from "../../services/imageGen";
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
    const { theme, setTheme, chatPosition, setChatPosition, graphicsStyle, setGraphicsStyle, allGraphicsPresets, addCustomPreset, removeCustomPreset } = useTheme();
    const [isResizing, setIsResizing] = useState(false);
    const startYRef = useRef(0);
    const startHeightRef = useRef(0);

    // Custom preset creation form
    const [showCustomForm, setShowCustomForm] = useState(false);
    const [customLabel, setCustomLabel] = useState("");
    const [customDesc, setCustomDesc] = useState("");
    const [customPortrait, setCustomPortrait] = useState("");
    const [customBadge, setCustomBadge] = useState("");
    const [cacheCleared, setCacheCleared] = useState(false);

    // Portrait toggle state
    const [showTools, setShowTools] = useState(() => getPortraitOptions().showTools);
    const [showBackground, setShowBackground] = useState(() => getPortraitOptions().showBackground);

    const handleToggle = async (key: "showTools" | "showBackground", value: boolean) => {
        if (key === "showTools") setShowTools(value);
        else setShowBackground(value);
        setPortraitOptions({ [key]: value });
        await clearPortraitCache();
        setCacheCleared(true);
        setTimeout(() => setCacheCleared(false), 2000);
    };

    const handleAddCustom = () => {
        if (!customLabel.trim() || !customPortrait.trim()) return;
        const id = addCustomPreset({
            label: customLabel.trim(),
            desc: customDesc.trim() || "Custom style",
            portraitPrefix: customPortrait.trim() + " ",
            badgePrefix: customBadge.trim() ? customBadge.trim() + " " : customPortrait.trim() + " ",
        });
        setGraphicsStyle(id);
        setCustomLabel("");
        setCustomDesc("");
        setCustomPortrait("");
        setCustomBadge("");
        setShowCustomForm(false);
    };

    const handleStyleChange = async (id: string) => {
        setGraphicsStyle(id);
        // Clear the portrait cache so images regenerate with the new style
        await clearPortraitCache();
        setCacheCleared(true);
        setTimeout(() => setCacheCleared(false), 2000);
    };

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

                {/* ── Graphics Section ── */}
                <div className="display-panel__section">
                    <div className="display-panel__section-header">
                        <div className="display-panel__section-title"><Palette size={10} /> Graphics Style</div>
                        <button
                            onClick={() => setShowCustomForm(!showCustomForm)}
                            className={`display-panel__add-btn${showCustomForm ? " display-panel__add-btn--active" : ""}`}
                            title={showCustomForm ? "Cancel" : "Add custom style"}
                        >
                            {showCustomForm ? <X size={10} /> : <Plus size={10} />}
                        </button>
                    </div>

                    {cacheCleared && (
                        <div className="display-panel__cache-toast">Image cache cleared — portraits will regenerate with the new style</div>
                    )}

                    {/* Custom preset form */}
                    {showCustomForm && (
                        <div className="display-panel__custom-form">
                            <input
                                placeholder="Style name"
                                value={customLabel}
                                onChange={(e) => setCustomLabel(e.target.value)}
                                className="input input-accent display-panel__custom-input"
                            />
                            <input
                                placeholder="Short description"
                                value={customDesc}
                                onChange={(e) => setCustomDesc(e.target.value)}
                                className="input input-accent display-panel__custom-input"
                            />
                            <textarea
                                placeholder="Portrait style prompt (e.g. 'Watercolor painting portrait, soft brush strokes, pastel tones...')"
                                value={customPortrait}
                                onChange={(e) => setCustomPortrait(e.target.value)}
                                rows={2}
                                className="input input-accent display-panel__custom-textarea"
                            />
                            <textarea
                                placeholder="Badge style prompt (optional — defaults to portrait prompt)"
                                value={customBadge}
                                onChange={(e) => setCustomBadge(e.target.value)}
                                rows={2}
                                className="input input-accent display-panel__custom-textarea"
                            />
                            <button
                                onClick={handleAddCustom}
                                disabled={!customLabel.trim() || !customPortrait.trim()}
                                className={`btn-primary display-panel__custom-submit${!customLabel.trim() || !customPortrait.trim() ? " btn-disabled" : ""}`}
                            >
                                <Plus size={10} /> Add Style
                            </button>
                        </div>
                    )}

                    {/* Preset grid */}
                    <div className="display-panel__graphics-grid">
                        {allGraphicsPresets.map(p => {
                            const isActive = graphicsStyle === p.id;
                            return (
                                <button
                                    key={p.id}
                                    className={`display-panel__graphics-btn${isActive ? " display-panel__graphics-btn--active" : ""}`}
                                    onClick={() => handleStyleChange(p.id)}
                                >
                                    <Paintbrush size={14} className="display-panel__graphics-icon" />
                                    <span className="display-panel__graphics-label">{p.label}</span>
                                    <span className="display-panel__graphics-desc">{p.desc}</span>
                                    {!p.builtin && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); removeCustomPreset(p.id); }}
                                            className="display-panel__graphics-delete"
                                            title="Remove custom style"
                                        >
                                            <Trash2 size={8} />
                                        </button>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ── Portrait Options Section ── */}
                <div className="display-panel__section">
                    <div className="display-panel__section-title"><Image size={10} /> Portrait Options</div>
                    <div className="display-panel__toggles">
                        <label className="display-panel__toggle-row">
                            <div className="display-panel__toggle-info">
                                <Wrench size={12} className="display-panel__toggle-icon" />
                                <div>
                                    <span className="display-panel__toggle-label">Role Tools &amp; Props</span>
                                    <span className="display-panel__toggle-desc">Show role-themed items (magnifying glass, shields, etc.)</span>
                                </div>
                            </div>
                            <button
                                role="switch"
                                aria-checked={showTools}
                                className={`display-panel__switch${showTools ? " display-panel__switch--on" : ""}`}
                                onClick={() => handleToggle("showTools", !showTools)}
                            >
                                <span className="display-panel__switch-knob" />
                            </button>
                        </label>
                        <label className="display-panel__toggle-row">
                            <div className="display-panel__toggle-info">
                                <Image size={12} className="display-panel__toggle-icon" />
                                <div>
                                    <span className="display-panel__toggle-label">Thematic Background</span>
                                    <span className="display-panel__toggle-desc">Show environment scenes instead of solid color</span>
                                </div>
                            </div>
                            <button
                                role="switch"
                                aria-checked={showBackground}
                                className={`display-panel__switch${showBackground ? " display-panel__switch--on" : ""}`}
                                onClick={() => handleToggle("showBackground", !showBackground)}
                            >
                                <span className="display-panel__switch-knob" />
                            </button>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    );
}
