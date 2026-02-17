import { useState, useEffect, useRef } from "react";
import { X, AlertTriangle, Clipboard, Key, Bot, Download, Upload, Check } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useWorkspaceContext } from "../../context/WorkspaceContext";
import { useEcosystemContext } from "../../context/EcosystemContext";
import { ANTHROPIC_MODELS } from "../../constants";
import { getSelectedModel, setSelectedModel } from "../../services/ai";
import { GemAvatar } from "../shared/GemAvatar";

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const { user } = useAuth();
  const workspace = useWorkspaceContext();
  const ecosystem = useEcosystemContext();

  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState("");
  const [selectedModelId, setSelectedModelId] = useState(getSelectedModel());
  const [hasKey, setHasKey] = useState(false);
  const [importStatus, setImportStatus] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const storedKey = localStorage.getItem("anthropic_api_key");
    if (storedKey) { setApiKey(storedKey); setHasKey(true); }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen || !user) return null;

  const handleSaveKey = () => {
    if (apiKey.trim()) {
      localStorage.setItem("anthropic_api_key", apiKey.trim());
      setHasKey(true);
      setStatus("API Key saved successfully!");
    } else {
      localStorage.removeItem("anthropic_api_key");
      setHasKey(false);
      setStatus("API Key removed.");
    }
    setTimeout(() => setStatus(""), 3000);
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
      setStatus("DID copied!");
      setTimeout(() => setStatus(""), 3000);
    }
  };

  const downloadJSON = (data: any, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportWorkspace = () => {
    downloadJSON({
      version: "1.0", type: "workspace", exportedAt: new Date().toISOString(),
      data: { agents: workspace.agents, channels: workspace.channels, groups: workspace.groups, messages: workspace.messages },
    }, `decops-workspace-${Date.now()}.json`);
  };

  const handleExportEcosystem = () => {
    downloadJSON({
      version: "1.0", type: "ecosystem", exportedAt: new Date().toISOString(),
      data: { ecosystems: ecosystem.ecosystems, bridges: ecosystem.bridges },
    }, `decops-ecosystem-${Date.now()}.json`);
  };

  const handleFullBackup = () => {
    downloadJSON({
      version: "1.0", type: "full-backup", exportedAt: new Date().toISOString(),
      data: {
        workspace: { agents: workspace.agents, channels: workspace.channels, groups: workspace.groups, messages: workspace.messages },
        ecosystem: { ecosystems: ecosystem.ecosystems, bridges: ecosystem.bridges },
      },
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
      } catch { setImportStatus("Error: Invalid JSON file"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const processImport = (json: any) => {
    if (!json.data) { setImportStatus("Error: Invalid file format"); return; }
    if (json.type === "full-backup") {
      if (json.data.workspace) {
        workspace.setAgents(json.data.workspace.agents || []);
        workspace.setChannels(json.data.workspace.channels || []);
        workspace.setGroups(json.data.workspace.groups || []);
        workspace.setMessages(json.data.workspace.messages || []);
      }
      if (json.data.ecosystem) {
        ecosystem.setEcosystems(json.data.ecosystem.ecosystems || []);
        ecosystem.setBridges(json.data.ecosystem.bridges || []);
      }
    } else if (json.type === "workspace") {
      workspace.setAgents(json.data.agents || []);
      workspace.setChannels(json.data.channels || []);
      workspace.setGroups(json.data.groups || []);
      workspace.setMessages(json.data.messages || []);
    } else if (json.type === "ecosystem") {
      ecosystem.setEcosystems(json.data.ecosystems || []);
      ecosystem.setBridges(json.data.bridges || []);
    } else { setImportStatus("Error: Unknown file type"); return; }
    setImportStatus(`Loaded from ${json.type || "file"}`);
    setTimeout(() => setImportStatus(""), 5000);
  };

  const handleReset = () => {
    if (confirm("Are you sure? This will WIPE ALL DATA. This cannot be undone.")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  const tierColors: Record<string, string> = {
    recommended: "#00e5a0", premium: "#a78bfa", fast: "#fbbf24", standard: "#38bdf8",
  };
  const tierLabels: Record<string, string> = {
    recommended: "RECOMMENDED", premium: "PREMIUM", fast: "FAST", standard: "STANDARD",
  };

  return (
    <div
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: "fadeIn 0.15s ease-out",
      }}
    >
      <div style={{
        background: "#0f0f14",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
        width: "min(640px, calc(100vw - 48px))",
        maxHeight: "calc(100vh - 64px)",
        overflow: "hidden",
        display: "flex", flexDirection: "column",
        boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
      }}>
        {/* Header */}
        <div style={{
          padding: "20px 24px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <GemAvatar seed={user.email || "user"} size={36} />
            <div>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16 }}>
                {user.profile?.name || user.email}
              </div>
              <div style={{ fontSize: 11, color: "#71717a" }}>{user.email}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8, width: 32, height: 32, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", color: "#71717a",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div style={{ flex: 1, overflow: "auto", padding: "20px 24px 24px" }}>
          <div style={{ display: "grid", gap: 20 }}>

            {/* API Key Warning */}
            {!hasKey && (
              <div style={{
                display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)",
                borderRadius: 10, color: "#fbbf24", fontSize: 12,
              }}>
                <AlertTriangle size={16} />
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>No API Key</div>
                  <div style={{ fontSize: 10, color: "rgba(251,191,36,0.7)" }}>
                    Agent AI features require an Anthropic API key.
                  </div>
                </div>
              </div>
            )}

            {/* Identity */}
            <section style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, fontSize: 13, fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif" }}>
                <Clipboard size={14} color="#00e5a0" /> Identity
              </div>
              {user.hasEmailRegistrationCredential && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 12, background: "rgba(0,229,160,0.1)", color: "#00e5a0", padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 500 }}>
                  <Check size={10} /> Verified Email
                </div>
              )}
              <div>
                <label style={{ display: "block", fontSize: 10, color: "#71717a", marginBottom: 4, fontFamily: "'DM Mono', monospace" }}>DID</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{
                    flex: 1, padding: "8px 10px", background: "rgba(0,0,0,0.3)", borderRadius: 6,
                    fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#a1a1aa",
                    border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {user.did || "No DID issued"}
                  </div>
                  <button onClick={copyDid} style={{
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 6, padding: "6px 10px", cursor: "pointer", color: "#71717a",
                  }}>
                    <Clipboard size={12} />
                  </button>
                </div>
              </div>
            </section>

            {/* API Key */}
            <section style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 13, fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif" }}>
                <Key size={14} color="#00e5a0" /> API Configuration
              </div>
              <p style={{ fontSize: 10, color: "#71717a", marginBottom: 14, lineHeight: 1.5 }}>
                Anthropic API key for agent capabilities. Stored locally.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <input
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-ant-..."
                    style={{
                      width: "100%", padding: "8px 10px",
                      background: "rgba(0,0,0,0.3)", border: `1px solid ${hasKey ? "rgba(0,229,160,0.3)" : "rgba(255,255,255,0.06)"}`,
                      borderRadius: 6, color: "white", fontFamily: "'DM Mono', monospace", fontSize: 12, boxSizing: "border-box",
                    }}
                  />
                  <button onClick={() => setShowKey(!showKey)} style={{
                    position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", color: "#52525b", cursor: "pointer", fontSize: 10,
                  }}>
                    {showKey ? "Hide" : "Show"}
                  </button>
                </div>
                <button onClick={handleSaveKey} style={{
                  background: "#00e5a0", color: "#0a0a0f", border: "none",
                  padding: "8px 16px", borderRadius: 6, cursor: "pointer",
                  fontFamily: "inherit", fontSize: 11, fontWeight: 500, minWidth: 60,
                }}>
                  Save
                </button>
              </div>
              {status && <div style={{ marginTop: 6, fontSize: 11, color: status.includes("removed") ? "#fbbf24" : "#00e5a0" }}>{status}</div>}
              {hasKey && <div style={{ marginTop: 6, fontSize: 10, color: "#00e5a0" }}>● Key configured</div>}
              {!hasKey && (
                <p style={{ marginTop: 6, fontSize: 10, color: "#52525b" }}>
                  Get yours at{" "}
                  <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" style={{ color: "#38bdf8", textDecoration: "none" }}>console.anthropic.com</a>
                </p>
              )}
            </section>

            {/* Model Selection */}
            <section style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 13, fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif" }}>
                <Bot size={14} color="#a78bfa" /> Model Selection
              </div>
              <p style={{ fontSize: 10, color: "#71717a", marginBottom: 14, lineHeight: 1.5 }}>
                Claude model for agent conversations and mesh generation.
              </p>
              <div style={{ display: "grid", gap: 8 }}>
                {ANTHROPIC_MODELS.map((model) => {
                  const isSelected = selectedModelId === model.id;
                  const tierColor = tierColors[model.tier] || "#71717a";
                  return (
                    <button
                      key={model.id}
                      onClick={() => handleSelectModel(model.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "10px 14px",
                        background: isSelected ? `${tierColor}08` : "rgba(255,255,255,0.015)",
                        border: `1px solid ${isSelected ? `${tierColor}40` : "rgba(255,255,255,0.05)"}`,
                        borderRadius: 8, cursor: "pointer", textAlign: "left", transition: "all 0.15s",
                      }}
                    >
                      <div style={{
                        width: 16, height: 16, borderRadius: "50%",
                        border: `2px solid ${isSelected ? tierColor : "#52525b"}`,
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      }}>
                        {isSelected && <div style={{ width: 6, height: 6, borderRadius: "50%", background: tierColor }} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: isSelected ? "#e4e4e7" : "#a1a1aa", fontFamily: "'Space Grotesk', sans-serif" }}>
                            {model.label}
                          </span>
                          <span style={{
                            fontSize: 8, fontWeight: 600, letterSpacing: "0.05em",
                            padding: "1px 5px", borderRadius: 3,
                            background: `${tierColor}18`, color: tierColor,
                          }}>
                            {tierLabels[model.tier]}
                          </span>
                        </div>
                        <div style={{ fontSize: 10, color: "#52525b" }}>{model.desc}</div>
                      </div>
                      <div style={{ fontSize: 9, color: "#3f3f46", fontFamily: "'DM Mono', monospace", flexShrink: 0 }}>
                        {model.id.length > 20 ? model.id.slice(0, 18) + "…" : model.id}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Export */}
            <section style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 13, fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif", color: "#fbbf24" }}>
                <Download size={14} /> Export Data
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                <button onClick={handleExportWorkspace} style={btnStyle}>Export Workspace</button>
                <button onClick={handleExportEcosystem} style={btnStyle}>Export Ecosystem</button>
                <button onClick={handleFullBackup} style={{ ...btnStyle, background: "#00e5a0", color: "#0a0a0f", borderColor: "transparent", fontWeight: 500 }}>Full Backup</button>
              </div>
            </section>

            {/* Import */}
            <section style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 13, fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif", color: "#38bdf8" }}>
                <Upload size={14} /> Import Data
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
                <button onClick={handleImportClick} style={btnStyle}>Select JSON File...</button>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" style={{ display: "none" }} />
                {importStatus && (
                  <span style={{ fontSize: 11, color: importStatus.startsWith("Error") ? "#ef4444" : "#00e5a0" }}>{importStatus}</span>
                )}
              </div>
            </section>

            {/* Danger Zone */}
            <section style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 10, padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 13, fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif", color: "#ef4444" }}>
                <AlertTriangle size={14} /> Danger Zone
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <p style={{ fontSize: 10, color: "rgba(239,68,68,0.7)", margin: 0 }}>
                  Wipe all LocalStorage and reset.
                </p>
                <button onClick={handleReset} style={{
                  background: "#ef4444", color: "white", border: "none",
                  padding: "8px 16px", borderRadius: 6, cursor: "pointer",
                  fontFamily: "inherit", fontSize: 11, fontWeight: 600,
                }}>
                  Reset All
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "#e4e4e7",
  padding: "8px 14px",
  borderRadius: 6,
  cursor: "pointer",
  fontFamily: "'DM Mono', monospace",
  fontSize: 11,
};
