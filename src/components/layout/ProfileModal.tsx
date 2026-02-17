import { useState, useEffect, useRef } from "react";
import { X, AlertTriangle, Clipboard, Key, Bot, Download, Upload, Check } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useWorkspaceContext } from "../../context/WorkspaceContext";
import { useEcosystemContext } from "../../context/EcosystemContext";
import { ANTHROPIC_MODELS } from "../../constants";
import { getSelectedModel, setSelectedModel } from "../../services/ai";
import { GemAvatar } from "../shared/GemAvatar";
import "../../styles/components/profile-modal.css";

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
      className="profile-modal-backdrop"
    >
      <div className="profile-modal">
        {/* Header */}
        <div className="profile-modal-header">
          <div className="profile-modal-user">
            <GemAvatar seed={user.email || "user"} size={36} />
            <div>
              <div className="profile-modal-user-name">
                {user.profile?.name || user.email}
              </div>
              <div className="profile-modal-user-email">{user.email}</div>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon">
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="profile-modal-body">
          <div className="profile-modal-sections">

            {/* API Key Warning */}
            {!hasKey && (
              <div className="profile-api-warning">
                <AlertTriangle size={16} />
                <div>
                  <div className="profile-api-warning-title">No API Key</div>
                  <div className="profile-api-warning-description">
                    Agent AI features require an Anthropic API key.
                  </div>
                </div>
              </div>
            )}

            {/* Identity */}
            <section className="profile-section">
              <div className="profile-section-header">
                <Clipboard size={14} color="#00e5a0" /> Identity
              </div>
              {user.hasEmailRegistrationCredential && (
                <div className="profile-verified-badge">
                  <Check size={10} /> Verified Email
                </div>
              )}
              <div>
                <label className="label">DID</label>
                <div className="profile-form-row">
                  <div className="did-display">
                    {user.did || "No DID issued"}
                  </div>
                  <button onClick={copyDid} className="btn-icon">
                    <Clipboard size={12} />
                  </button>
                </div>
              </div>
            </section>

            {/* API Key */}
            <section className="profile-section">
              <div className="profile-section-header">
                <Key size={14} color="#00e5a0" /> API Configuration
              </div>
              <p className="profile-section-description">
                Anthropic API key for agent capabilities. Stored locally.
              </p>
              <div className="profile-form-row">
                <div className="profile-form-input-wrapper">
                  <input
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-ant-..."
                    className={`input ${hasKey ? 'input-success' : ''}`}
                  />
                  <button onClick={() => setShowKey(!showKey)} className="profile-form-toggle">
                    {showKey ? "Hide" : "Show"}
                  </button>
                </div>
                <button onClick={handleSaveKey} className="btn btn-primary">
                  Save
                </button>
              </div>
              {status && <div className={`profile-status ${status.includes("removed") ? "warning" : "success"}`}>{status}</div>}
              {hasKey && <div className="profile-key-status">● Key configured</div>}
              {!hasKey && (
                <p className="profile-hint">
                  Get yours at{" "}
                  <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer">console.anthropic.com</a>
                </p>
              )}
            </section>

            {/* Model Selection */}
            <section className="profile-section">
              <div className="profile-section-header">
                <Bot size={14} color="#a78bfa" /> Model Selection
              </div>
              <p className="profile-section-description">
                Claude model for agent conversations and mesh generation.
              </p>
              <div className="profile-model-grid">
                {ANTHROPIC_MODELS.map((model) => {
                  const isSelected = selectedModelId === model.id;
                  const tierColor = tierColors[model.tier] || "#71717a";
                  return (
                    <button
                      key={model.id}
                      onClick={() => handleSelectModel(model.id)}
                      className={`profile-model-btn ${isSelected ? 'selected' : ''}`}
                      style={isSelected ? { background: `${tierColor}08` } : undefined}
                    >
                      <div className={`profile-model-radio ${isSelected ? 'selected' : ''}`} style={isSelected ? { borderColor: tierColor } : undefined}>
                        {isSelected && <div className="profile-model-radio-inner" style={{ background: tierColor }} />}
                      </div>
                      <div className="profile-model-info">
                        <div className="profile-model-header">
                          <span className={`profile-model-name ${isSelected ? 'selected' : ''}`}>
                            {model.label}
                          </span>
                          <span 
                            className="profile-model-tier"
                            style={{ background: `${tierColor}18`, color: tierColor }}
                          >
                            {tierLabels[model.tier]}
                          </span>
                        </div>
                        <div className="profile-model-desc">{model.desc}</div>
                      </div>
                      <div className="profile-model-id">
                        {model.id.length > 20 ? model.id.slice(0, 18) + "…" : model.id}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Export */}
            <section className="profile-section">
              <div className="profile-section-header warning">
                <Download size={14} /> Export Data
              </div>
              <div className="profile-actions-row">
                <button onClick={handleExportWorkspace} className="btn btn-ghost">Export Workspace</button>
                <button onClick={handleExportEcosystem} className="btn btn-ghost">Export Ecosystem</button>
                <button onClick={handleFullBackup} className="btn btn-primary">Full Backup</button>
              </div>
            </section>

            {/* Import */}
            <section className="profile-section">
              <div className="profile-section-header info">
                <Upload size={14} /> Import Data
              </div>
              <div className="flex items-center gap-lg mt-xl">
                <button onClick={handleImportClick} className="btn btn-ghost">Select JSON File...</button>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" className="hidden" />
                {importStatus && (
                  <span className={`profile-status ${importStatus.startsWith("Error") ? "error" : "success"}`}>{importStatus}</span>
                )}
              </div>
            </section>

            {/* Danger Zone */}
            <section className="profile-section profile-section-danger">
              <div className="profile-section-header danger">
                <AlertTriangle size={14} /> Danger Zone
              </div>
              <div className="profile-danger-content">
                <p className="profile-danger-description">
                  Wipe all LocalStorage and reset.
                </p>
                <button onClick={handleReset} className="btn btn-danger-solid">
                  Reset All
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
