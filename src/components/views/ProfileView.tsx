import { useState, useEffect, useRef } from "react";
import { AlertTriangle, Clipboard, Key, Bot, Download, Upload, Check } from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import { useAuth } from "../../context/AuthContext";
import { ANTHROPIC_MODELS } from "../../constants";
import { getSelectedModel, setSelectedModel } from "../../services/ai";
import { GemAvatar } from "../shared/GemAvatar";
import type { Agent, Channel, Group, Message, Network, Bridge } from "../../types";

interface ProfileViewProps {
    agents: Agent[];
    channels: Channel[];
    groups: Group[];
    messages: Message[];
    ecosystems: Network[];
    bridges: Bridge[];
    setAgents: (val: Agent[]) => void;
    setChannels: (val: Channel[]) => void;
    setGroups: (val: Group[]) => void;
    setMessages: (val: Message[]) => void;
    setEcosystems?: (val: Network[]) => void;
    setBridges?: (val: Bridge[]) => void;
}

export function ProfileView({
    agents, channels, groups, messages, ecosystems, bridges,
    setAgents, setChannels, setGroups, setMessages, setEcosystems, setBridges,
}: ProfileViewProps) {
    const { user } = useAuth();
    const [apiKey, setApiKey] = useState("");
    const [showKey, setShowKey] = useState(false);
    const [status, setStatus] = useState("");
    const [selectedModelId, setSelectedModelId] = useState(getSelectedModel());
    const [hasKey, setHasKey] = useState(false);
    const [importStatus, setImportStatus] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);

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

    // --- Data Management ---
    const downloadJSON = (data: any, filename: string) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleExportWorkspace = () => {
        downloadJSON({
            version: "1.0", type: "workspace", exportedAt: new Date().toISOString(),
            data: { agents, channels, groups, messages },
        }, `decops-workspace-${Date.now()}.json`);
    };

    const handleExportEcosystem = () => {
        downloadJSON({
            version: "1.0", type: "ecosystem", exportedAt: new Date().toISOString(),
            data: { ecosystems, bridges },
        }, `decops-ecosystem-${Date.now()}.json`);
    };

    const handleFullBackup = () => {
        downloadJSON({
            version: "1.0", type: "full-backup", exportedAt: new Date().toISOString(),
            data: { workspace: { agents, channels, groups, messages }, ecosystem: { ecosystems, bridges } },
        }, `decops-full-backup-${Date.now()}.json`);
    };

    const handleImportClick = () => fileInputRef.current?.click();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                processImport(json);
            } catch (err) {
                setImportStatus("Error: Invalid JSON file");
                console.error(err);
            }
        };
        reader.readAsText(file);
        e.target.value = "";
    };

    const processImport = (json: any) => {
        if (!json.data) { setImportStatus("Error: Invalid file format (missing data field)"); return; }
        let count = 0;
        if (json.type === "full-backup") {
            if (json.data.workspace) {
                setAgents(json.data.workspace.agents || []);
                setChannels(json.data.workspace.channels || []);
                setGroups(json.data.workspace.groups || []);
                setMessages(json.data.workspace.messages || []);
                count++;
            }
            if (json.data.ecosystem && setEcosystems && setBridges) {
                setEcosystems(json.data.ecosystem.ecosystems || []);
                setBridges(json.data.ecosystem.bridges || []);
                count++;
            }
        } else if (json.type === "workspace") {
            setAgents(json.data.agents || []); setChannels(json.data.channels || []);
            setGroups(json.data.groups || []); setMessages(json.data.messages || []);
            count++;
        } else if (json.type === "ecosystem" && setEcosystems && setBridges) {
            setEcosystems(json.data.ecosystems || []); setBridges(json.data.bridges || []);
            count++;
        } else { setImportStatus("Error: Unknown or unsupported file type"); return; }
        setImportStatus(`Success! Loaded data from ${json.type || "file"}.`);
        setTimeout(() => setImportStatus(""), 5000);
    };

    const handleReset = () => {
        if (confirm("Are you sure? This will WIPE ALL DATA from LocalStorage. This action cannot be undone.")) {
            localStorage.clear();
            window.location.reload();
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

    if (!user) return <div className="profile__loading">Loading profile...</div>;

    return (
        <div className="profile">
            <h2 className="settings-header">
                <GemAvatar seed={user.email || "user"} size={36} />
                Profile & Settings
            </h2>

            <div className="profile__grid">
                {/* Missing API Key Warning */}
                {!hasKey && (
                    <div className="profile__api-warning">
                        <AlertTriangle size={18} />
                        <div>
                            <div className="profile__api-warning-title">No API Key Configured</div>
                            <div className="profile__api-warning-desc">
                                Agent AI features require an Anthropic API key. Add one below to enable mesh generation and agent messaging.
                            </div>
                        </div>
                    </div>
                )}

                {/* User Info Card */}
                <section className="settings-section">
                    <div className="profile__user-row">
                        <GemAvatar seed={user.email || "user"} size={80} />
                        <div>
                            <h3 className="profile__user-name">{user.profile?.name || user.email}</h3>
                            <div className="profile__user-email">{user.email}</div>
                            {user.hasEmailRegistrationCredential && (
                                <div className="profile__verified-badge">
                                    <Check size={10} /> Verified Email Credential
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="profile__did-grid">
                        <div>
                            <label className="profile__did-label">Decentralized ID (DID)</label>
                            <div className="profile__did-row">
                                <div className="profile__did-value">
                                    {user.did || "No DID issued yet"}
                                </div>
                                <button onClick={copyDid} className="btn btn-secondary" title="Copy DID">
                                    <Clipboard size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                {/* API Keys Configuration */}
                <section className="settings-section">
                    <h3 className="section-title section-title--primary">
                        <span className="btn-icon"><Key size={18} color="#00e5a0" /></span> API Configuration
                    </h3>
                    <p className="section-desc">
                        Provide your Anthropic API key to power agent capabilities. Stored locally in your browser — never sent to any server except Anthropic.
                    </p>

                    <div className="profile__api-field">
                        <label className="profile__api-label">
                            Anthropic API Key
                        </label>
                        <div className="profile__api-input-row">
                            <div className="profile__api-input-wrapper">
                                <input
                                    type={showKey ? "text" : "password"}
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    placeholder="sk-ant-..."
                                    className={`profile__api-input${hasKey ? " profile__api-input--active" : ""}`}
                                />
                                <button
                                    onClick={() => setShowKey(!showKey)}
                                    className="profile__api-toggle"
                                >
                                    {showKey ? "Hide" : "Show"}
                                </button>
                            </div>
                            <button onClick={handleSaveKey} className="btn btn-primary profile__api-save">
                                Save
                            </button>
                        </div>
                        {status && <div className={`profile__api-status ${status.includes("removed") ? "profile__api-status--warning" : "profile__api-status--success"}`}>{status}</div>}
                        {hasKey && (
                            <div className="profile__key-active">
                                <span>●</span> Key configured — AI features active
                            </div>
                        )}
                        {!hasKey && (
                            <p className="profile__key-hint">
                                Required for agents using Claude models. Get yours at{" "}
                                <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer">
                                    console.anthropic.com
                                </a>
                            </p>
                        )}
                    </div>
                </section>

                {/* Model Selection */}
                <section className="settings-section">
                    <h3 className="section-title section-title--primary">
                        <span className="btn-icon"><Bot size={18} color="#a78bfa" /></span> Model Selection
                    </h3>
                    <p className="section-desc">
                        Choose the Claude model for agent conversations and mesh generation. Models differ in speed, cost, and capability.
                    </p>

                    <div className="profile__model-grid">
                        {ANTHROPIC_MODELS.map((model) => {
                            const isSelected = selectedModelId === model.id;
                            const tierColor = tierColors[model.tier] || "#71717a";
                            return (
                                <button
                                    key={model.id}
                                    onClick={() => handleSelectModel(model.id)}
                                    className="profile__model-card"
                                    style={{
                                        background: isSelected
                                            ? `linear-gradient(135deg, ${tierColor}08 0%, ${tierColor}04 100%)`
                                            : undefined,
                                        borderColor: isSelected ? `${tierColor}40` : undefined,
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!isSelected) e.currentTarget.style.borderColor = "var(--border-medium)";
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!isSelected) e.currentTarget.style.borderColor = isSelected ? `${tierColor}40` : "";
                                    }}
                                >
                                    {/* Radio indicator */}
                                    <div
                                        className="profile__model-radio"
                                        style={{ borderColor: isSelected ? tierColor : undefined }}
                                    >
                                        {isSelected && (
                                            <div className="profile__model-radio-dot" style={{ background: tierColor }} />
                                        )}
                                    </div>

                                    {/* Model info */}
                                    <div className="profile__model-info">
                                        <div className="profile__model-label-row">
                                            <span className={`profile__model-name${isSelected ? " profile__model-name--selected" : ""}`}>
                                                {model.label}
                                            </span>
                                            <span
                                                className="profile__model-tier"
                                                style={{ background: `${tierColor}18`, color: tierColor }}
                                            >
                                                {tierLabels[model.tier]}
                                            </span>
                                        </div>
                                        <div className="profile__model-desc">
                                            {model.desc}
                                        </div>
                                    </div>

                                    {/* Model ID */}
                                    <div className="profile__model-id">
                                        {model.id.length > 24 ? model.id.slice(0, 22) + "…" : model.id}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </section>

                {/* Export Data */}
                <section className="settings-section">
                    <h3 className="section-title section-title--warning">
                        <span className="btn-icon"><Download size={18} color="#fbbf24" /></span> Export Data
                    </h3>
                    <p className="section-desc">
                        Download your current workspace or full ecosystem state as a JSON file.
                    </p>
                    <div className="profile__export-row">
                        <button onClick={handleExportWorkspace} className="btn btn-surface">Export Workspace</button>
                        <button onClick={handleExportEcosystem} className="btn btn-surface">Export Ecosystem</button>
                        <button onClick={handleFullBackup} className="btn btn-primary profile__backup-btn--dark">Full Backup (.json)</button>
                    </div>
                </section>

                {/* Import Data */}
                <section className="settings-section">
                    <h3 className="section-title section-title--info">
                        <span className="btn-icon"><Upload size={18} color="#38bdf8" /></span> Import Data
                    </h3>
                    <p className="section-desc">
                        Restore a previous state from a JSON file. This will overwrite current data.
                    </p>
                    <div className="profile__import-row">
                        <button onClick={handleImportClick} className="btn btn-secondary">Select JSON File...</button>
                        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" className="hidden" />
                        {importStatus && (
                            <span className={`profile__import-status ${importStatus.startsWith("Error") ? "profile__import-status--error" : "profile__import-status--success"}`}>
                                {importStatus}
                            </span>
                        )}
                    </div>
                </section>

                {/* Danger Zone */}
                <section className="settings-section settings-section--danger">
                    <h3 className="section-title section-title--danger">
                        <span className="btn-icon"><AlertTriangle size={18} color="#ef4444" /></span> Danger Zone
                    </h3>
                    <div className="profile__danger-row">
                        <p className="section-desc section-desc--danger">
                            Clear all data from LocalStorage and reset application to default state.
                        </p>
                        <button onClick={handleReset} className="btn btn-danger-solid">Reset All Data</button>
                    </div>
                </section>
            </div>
        </div>
    );
}
