import { useState, useEffect, useRef } from "react";
import { X, AlertTriangle, Clipboard, Download, Upload, Check, Zap } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useWorkspaceContext } from "../../context/WorkspaceContext";
import { useEcosystemContext } from "../../context/EcosystemContext";
import { useLLM } from "../../context/LLMContext";
import { GemAvatar } from "../shared/GemAvatar";
import { CopyableId } from "../shared/CopyableId";
import "../../styles/components/profile-modal.css";

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const { user } = useAuth();
  const workspace = useWorkspaceContext();
  const ecosystem = useEcosystemContext();
  const llm = useLLM();

  const [status, setStatus] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen || !user) return null;

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
      data: { agents: workspace.agents, channels: workspace.channels, groups: workspace.groups, messages: workspace.messages, networks: ecosystem.ecosystems, bridges: ecosystem.bridges },
    }, `decops-workspace-${Date.now()}.json`);
  };

  const handleFullBackup = () => {
    downloadJSON({
      version: "1.0", type: "full-backup", exportedAt: new Date().toISOString(),
      data: {
        agents: workspace.agents, channels: workspace.channels, groups: workspace.groups, messages: workspace.messages,
        networks: ecosystem.ecosystems, bridges: ecosystem.bridges,
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
      // Support both old nested format and new flat format
      const ws = json.data.workspace || json.data;
      const eco = json.data.ecosystem || json.data;
      workspace.setAgents(ws.agents || []);
      workspace.setChannels(ws.channels || []);
      workspace.setGroups(ws.groups || []);
      workspace.setMessages(ws.messages || []);
      ecosystem.setEcosystems(eco.networks || eco.ecosystems || []);
      ecosystem.setBridges(eco.bridges || []);
    } else if (json.type === "workspace") {
      workspace.setAgents(json.data.agents || []);
      workspace.setChannels(json.data.channels || []);
      workspace.setGroups(json.data.groups || []);
      workspace.setMessages(json.data.messages || []);
      if (json.data.networks || json.data.ecosystems) {
        ecosystem.setEcosystems(json.data.networks || json.data.ecosystems || []);
      }
      if (json.data.bridges) {
        ecosystem.setBridges(json.data.bridges || []);
      }
    } else if (json.type === "ecosystem") {
      // Legacy ecosystem-only imports
      ecosystem.setEcosystems(json.data.networks || json.data.ecosystems || []);
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

  const hasAnyKey = llm.hasProviderKey("anthropic") || llm.hasProviderKey("google");

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

            {/* No API Key Warning → points to LLM Manager */}
            {!hasAnyKey && (
              <div className="profile-api-warning">
                <AlertTriangle size={16} />
                <div>
                  <div className="profile-api-warning-title">No API Keys</div>
                  <div className="profile-api-warning-description">
                    Open the <button className="btn-link" onClick={() => { onClose(); llm.openManager(); }}>LLM Manager</button> to configure API keys and models.
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
                  {user.did
                    ? <CopyableId value={user.did} label="DID" />
                    : <div className="did-display">No DID issued</div>
                  }
                </div>
              </div>
            </section>

            {/* LLM Manager link (replaces old API Key + Model Selection sections) */}
            <section className="profile-section">
              <div className="profile-section-header">
                <Zap size={14} color="#00e5a0" /> AI & Models
              </div>
              <p className="profile-section-description">
                API keys, model selection, per-agent and per-command overrides.
              </p>
              <button
                onClick={() => { onClose(); llm.openManager(); }}
                className="btn btn-primary"
                style={{ width: "100%" }}
              >
                <Zap size={13} /> Open LLM Manager
              </button>
              {hasAnyKey && (
                <div className="profile-key-status" style={{ marginTop: "var(--space-sm)" }}>
                  ● {llm.providers.filter(p => p.apiKey).map(p => p.label).join(", ")} configured
                </div>
              )}
            </section>

            {/* Export */}
            <section className="profile-section">
              <div className="profile-section-header warning">
                <Download size={14} /> Export Data
              </div>
              <div className="profile-actions-row">
                <button onClick={handleExportWorkspace} className="btn btn-ghost">Export Workspace</button>
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
