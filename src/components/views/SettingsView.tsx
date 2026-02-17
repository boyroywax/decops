import { useState, useRef } from "react";
import { Download, Upload, AlertTriangle, Database } from "lucide-react";
import type { Agent, Channel, Group, Message, Network, Bridge } from "../../types";
import "../../styles/components/settings.css";

interface SettingsViewProps {
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
    setEcosystems?: (val: Network[]) => void; // Optional if not all props passed yet
    setBridges?: (val: Bridge[]) => void;
}

export function SettingsView({
    agents,
    channels,
    groups,
    messages,
    ecosystems,
    bridges,
    setAgents,
    setChannels,
    setGroups,
    setMessages,
    setEcosystems,
    setBridges,
}: SettingsViewProps) {
    const [importStatus, setImportStatus] = useState<string>("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- Export ---
    const downloadJSON = (data: any, filename: string) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], {
            type: "application/json",
        });
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
        const data = {
            version: "1.0",
            type: "workspace",
            exportedAt: new Date().toISOString(),
            data: { agents, channels, groups, messages },
        };
        downloadJSON(data, `decops-workspace-${new Date().getTime()}.json`);
    };

    const handleExportEcosystem = () => {
        const data = {
            version: "1.0",
            type: "ecosystem",
            exportedAt: new Date().toISOString(),
            data: { ecosystems, bridges },
        };
        downloadJSON(data, `decops-ecosystem-${new Date().getTime()}.json`);
    };

    const handleFullBackup = () => {
        const data = {
            version: "1.0",
            type: "full-backup",
            exportedAt: new Date().toISOString(),
            data: {
                workspace: { agents, channels, groups, messages },
                ecosystem: { ecosystems, bridges },
            },
        };
        downloadJSON(data, `decops-full-backup-${new Date().getTime()}.json`);
    };

    // --- Import ---
    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

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
        // Reset input
        e.target.value = "";
    };

    const processImport = (json: any) => {
        if (!json.data) {
            setImportStatus("Error: Invalid file format (missing data field)");
            return;
        }

        let count = 0;

        // Handle full backup or individual types
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
            setAgents(json.data.agents || []);
            setChannels(json.data.channels || []);
            setGroups(json.data.groups || []);
            setMessages(json.data.messages || []);
            count++;
        } else if (json.type === "ecosystem" && setEcosystems && setBridges) {
            setEcosystems(json.data.ecosystems || []);
            setBridges(json.data.bridges || []);
            count++;
        } else {
            setImportStatus("Error: Unknown or unsupported file type");
            return;
        }

        setImportStatus(`Success! Loaded data from ${json.type || "file"}.`);
        setTimeout(() => setImportStatus(""), 5000);
    };

    // --- Reset ---
    const handleReset = () => {
        if (
            confirm(
                "Are you sure? This will WIPE ALL DATA from LocalStorage. This action cannot be undone."
            )
        ) {
            localStorage.clear();
            window.location.reload();
        }
    };

    return (
        <div className="settings">
            <h2 className="settings-header">
                <span className="settings-header__icon"><Database size={20} /></span> Data Management
            </h2>

            <div className="settings__grid">
                {/* Export Section */}
                <section className="settings-section">
                    <h3 className="settings-section__title" style={{ color: "var(--color-warning)" }}>
                        <span className="btn-icon"><Download size={18} color="#fbbf24" /></span> Export Data
                    </h3>
                    <p className="section-desc">
                        Download your current workspace or full ecosystem state as a JSON
                        file.
                    </p>
                    <div className="settings__btn-row">
                        <button
                            onClick={handleExportWorkspace}
                            className="btn btn-surface"
                        >
                            Export Workspace
                        </button>
                        <button
                            onClick={handleExportEcosystem}
                            className="btn btn-surface"
                        >
                            Export Ecosystem
                        </button>
                        <button
                            onClick={handleFullBackup}
                            className="btn btn-primary"
                        >
                            Full Backup (.json)
                        </button>
                    </div>
                </section>

                {/* Import Section */}
                <section className="settings-section">
                    <h3 className="settings-section__title" style={{ color: "var(--color-info)" }}>
                        <span className="btn-icon"><Upload size={18} color="#38bdf8" /></span> Import Data
                    </h3>
                    <p className="section-desc">
                        Restore a previous state from a JSON file. This will overwrite
                        current data.
                    </p>
                    <div className="settings__import-row">
                        <button
                            onClick={handleImportClick}
                            className="btn btn-secondary"
                        >
                            Select JSON File...
                        </button>
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            accept=".json"
                            style={{ display: "none" }}
                        />
                        {importStatus && (
                            <span
                                className={`settings__import-status ${importStatus.startsWith("Error") ? "settings__import-status--error" : "settings__import-status--success"}`}
                            >
                                {importStatus}
                            </span>
                        )}
                    </div>
                </section>

                {/* Danger Zone */}
                <section className="settings-section settings-section--danger">
                    <h3 className="settings-section__title" style={{ color: "var(--color-danger)" }}>
                        <span className="btn-icon"><AlertTriangle size={18} color="#ef4444" /></span> Danger Zone
                    </h3>
                    <div className="settings__danger-row">
                        <p className="section-desc section-desc--danger">
                            Clear all data from LocalStorage and reset application to default
                            state.
                        </p>
                        <button
                            onClick={handleReset}
                            className="btn btn-danger-solid"
                        >
                            Reset All Data
                        </button>
                    </div>
                </section>
            </div>
        </div>
    );
}
