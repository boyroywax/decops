import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { ANTHROPIC_MODELS } from "../../constants";
import { getSelectedModel, setSelectedModel } from "../../services/ai";
import { GemAvatar } from "../shared/GemAvatar";

export function ProfileView() {
    const { user } = useAuth();
    const [apiKey, setApiKey] = useState("");
    const [showKey, setShowKey] = useState(false);
    const [status, setStatus] = useState("");
    const [selectedModelId, setSelectedModelId] = useState(getSelectedModel());
    const [hasKey, setHasKey] = useState(false);

    useEffect(() => {
        const storedKey = localStorage.getItem("anthropic_api_key");
        if (storedKey) {
            setApiKey(storedKey);
            setHasKey(true);
        }
    }, []);

    const handleSaveKey = () => {
        if (apiKey.trim()) {
            localStorage.setItem("anthropic_api_key", apiKey.trim());
            setHasKey(true);
            setStatus("API Key saved successfully!");
            setTimeout(() => setStatus(""), 3000);
        } else {
            localStorage.removeItem("anthropic_api_key");
            setHasKey(false);
            setStatus("API Key removed.");
            setTimeout(() => setStatus(""), 3000);
        }
    };

    const handleSelectModel = (modelId: string) => {
        setSelectedModelId(modelId);
        setSelectedModel(modelId);
        setStatus(`Model switched to ${ANTHROPIC_MODELS.find(m => m.id === modelId)?.label}`);
        setTimeout(() => setStatus(""), 3000);
    };

    const copyDid = () => {
        if (user?.did) {
            navigator.clipboard.writeText(user.did);
            setStatus("DID copied to clipboard!");
            setTimeout(() => setStatus(""), 3000);
        }
    };

    const tierColors: Record<string, string> = {
        recommended: "#00e5a0",
        premium: "#a78bfa",
        fast: "#fbbf24",
        standard: "#38bdf8",
    };

    const tierLabels: Record<string, string> = {
        recommended: "RECOMMENDED",
        premium: "PREMIUM",
        fast: "FAST",
        standard: "STANDARD",
    };

    if (!user) return <div style={{ padding: 24 }}>Loading profile...</div>;

    return (
        <div style={{ maxWidth: 800 }}>
            <h2 className="settings-header" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <GemAvatar seed={user.email || user.username || "user"} size={36} />
                Profile & Settings
            </h2>

            <div style={{ display: "grid", gap: 24 }}>
                {/* Missing API Key Warning */}
                {!hasKey && (
                    <div style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "14px 18px",
                        background: "rgba(251,191,36,0.08)",
                        border: "1px solid rgba(251,191,36,0.25)",
                        borderRadius: "var(--radius-xl)",
                        color: "#fbbf24",
                        fontSize: 13,
                        fontFamily: "var(--font-mono)",
                    }}>
                        <span style={{ fontSize: 18 }}>⚠️</span>
                        <div>
                            <div style={{ fontWeight: 600, marginBottom: 2 }}>No API Key Configured</div>
                            <div style={{ fontSize: 11, color: "rgba(251,191,36,0.7)" }}>
                                Agent AI features require an Anthropic API key. Add one below to enable mesh generation and agent messaging.
                            </div>
                        </div>
                    </div>
                )}

                {/* User Info Card */}
                <section className="settings-section">
                    <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 24 }}>
                        <GemAvatar seed={user.email || user.username || "user"} size={80} />
                        <div>
                            <h3 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 4px 0" }}>{user.profile?.name || user.email}</h3>
                            <div style={{ color: "var(--text-subtle)", fontFamily: "var(--font-mono)", fontSize: 13 }}>{user.email}</div>
                            {user.hasEmailRegistrationCredential && (
                                <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 8, background: "rgba(0,229,160,0.1)", color: "#00e5a0", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 500 }}>
                                    <span>✓</span> Verified Email Credential
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ display: "grid", gap: 16 }}>
                        <div>
                            <label style={{ display: "block", fontSize: 12, color: "var(--text-subtle)", marginBottom: 6, fontFamily: "var(--font-mono)" }}>Decentralized ID (DID)</label>
                            <div style={{ display: "flex", gap: 8 }}>
                                <div style={{ flex: 1, padding: "10px 12px", background: "var(--bg-input)", borderRadius: "var(--radius-lg)", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)", border: "1px solid var(--border-default)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {user.did || "No DID issued yet"}
                                </div>
                                <button onClick={copyDid} className="btn btn-secondary" title="Copy DID">
                                    📋
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                {/* API Keys Configuration */}
                <section className="settings-section">
                    <h3 className="section-title" style={{ color: "var(--text-primary)" }}>
                        <span className="btn-icon">🔑</span> API Configuration
                    </h3>
                    <p className="section-desc">
                        Provide your Anthropic API key to power agent capabilities. Stored locally in your browser — never sent to any server except Anthropic.
                    </p>

                    <div style={{ marginBottom: 16 }}>
                        <label style={{ display: "block", fontSize: 12, color: "var(--text-primary)", marginBottom: 6, fontWeight: 500 }}>
                            Anthropic API Key
                        </label>
                        <div style={{ display: "flex", gap: 8 }}>
                            <div style={{ flex: 1, position: "relative" }}>
                                <input
                                    type={showKey ? "text" : "password"}
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    placeholder="sk-ant-..."
                                    style={{
                                        width: "100%",
                                        padding: "10px 12px",
                                        background: "var(--bg-input)",
                                        border: `1px solid ${hasKey ? "rgba(0,229,160,0.3)" : "var(--border-default)"}`,
                                        borderRadius: "var(--radius-lg)",
                                        color: "white",
                                        fontFamily: "var(--font-mono)",
                                        fontSize: 13,
                                        boxSizing: "border-box"
                                    }}
                                />
                                <button
                                    onClick={() => setShowKey(!showKey)}
                                    style={{
                                        position: "absolute",
                                        right: 8,
                                        top: "50%",
                                        transform: "translateY(-50%)",
                                        background: "none",
                                        border: "none",
                                        color: "var(--text-subtle)",
                                        cursor: "pointer",
                                        fontSize: 12
                                    }}
                                >
                                    {showKey ? "Hide" : "Show"}
                                </button>
                            </div>
                            <button onClick={handleSaveKey} className="btn btn-primary" style={{ minWidth: 80 }}>
                                Save
                            </button>
                        </div>
                        {status && <div style={{ marginTop: 8, fontSize: 12, color: status.includes("removed") ? "var(--color-warning)" : "var(--color-accent)" }}>{status}</div>}
                        {hasKey && (
                            <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#00e5a0" }}>
                                <span>●</span> Key configured — AI features active
                            </div>
                        )}
                        {!hasKey && (
                            <p style={{ marginTop: 8, fontSize: 11, color: "var(--text-subtle)" }}>
                                Required for agents using Claude models. Get yours at{" "}
                                <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-info)", textDecoration: "none" }}>
                                    console.anthropic.com
                                </a>
                            </p>
                        )}
                    </div>
                </section>

                {/* Model Selection */}
                <section className="settings-section">
                    <h3 className="section-title" style={{ color: "var(--text-primary)" }}>
                        <span className="btn-icon">🤖</span> Model Selection
                    </h3>
                    <p className="section-desc">
                        Choose the Claude model for agent conversations and mesh generation. Models differ in speed, cost, and capability.
                    </p>

                    <div style={{ display: "grid", gap: 10 }}>
                        {ANTHROPIC_MODELS.map((model) => {
                            const isSelected = selectedModelId === model.id;
                            const tierColor = tierColors[model.tier] || "#71717a";
                            return (
                                <button
                                    key={model.id}
                                    onClick={() => handleSelectModel(model.id)}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 14,
                                        padding: "14px 16px",
                                        background: isSelected
                                            ? `linear-gradient(135deg, ${tierColor}08 0%, ${tierColor}04 100%)`
                                            : "rgba(255,255,255,0.015)",
                                        border: `1px solid ${isSelected ? `${tierColor}40` : "var(--border-subtle)"}`,
                                        borderRadius: "var(--radius-xl)",
                                        cursor: "pointer",
                                        textAlign: "left",
                                        transition: "all 0.2s ease",
                                        position: "relative",
                                        overflow: "hidden",
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!isSelected) e.currentTarget.style.borderColor = "var(--border-medium)";
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!isSelected) e.currentTarget.style.borderColor = "var(--border-subtle)";
                                    }}
                                >
                                    {/* Radio indicator */}
                                    <div style={{
                                        width: 18, height: 18, borderRadius: "50%",
                                        border: `2px solid ${isSelected ? tierColor : "var(--text-ghost)"}`,
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        flexShrink: 0,
                                        transition: "all 0.2s ease",
                                    }}>
                                        {isSelected && (
                                            <div style={{
                                                width: 8, height: 8, borderRadius: "50%",
                                                background: tierColor,
                                            }} />
                                        )}
                                    </div>

                                    {/* Model info */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                                            <span style={{
                                                fontSize: 13, fontWeight: 600, color: isSelected ? "var(--text-primary)" : "var(--text-secondary)",
                                                fontFamily: "var(--font-display)",
                                            }}>
                                                {model.label}
                                            </span>
                                            <span style={{
                                                fontSize: 9, fontWeight: 600, letterSpacing: "0.05em",
                                                padding: "2px 6px", borderRadius: 3,
                                                background: `${tierColor}18`,
                                                color: tierColor,
                                                fontFamily: "var(--font-mono)",
                                            }}>
                                                {tierLabels[model.tier]}
                                            </span>
                                        </div>
                                        <div style={{
                                            fontSize: 11, color: "var(--text-subtle)",
                                            fontFamily: "var(--font-mono)",
                                        }}>
                                            {model.desc}
                                        </div>
                                    </div>

                                    {/* Model ID */}
                                    <div style={{
                                        fontSize: 10, color: "var(--text-ghost)",
                                        fontFamily: "var(--font-mono)",
                                        flexShrink: 0,
                                    }}>
                                        {model.id.length > 24 ? model.id.slice(0, 22) + "…" : model.id}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </section>
            </div>
        </div>
    );
}
