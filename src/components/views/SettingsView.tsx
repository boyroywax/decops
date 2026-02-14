import { useState, useRef } from "react";
import type { Agent, Channel, Group, Message, Network, Bridge } from "../../types";

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
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
            <h2
                style={{
                    fontSize: 24,
                    fontWeight: 600,
                    marginBottom: 24,
                    fontFamily: "'Space Grotesk', sans-serif",
                    color: "#e4e4e7",
                }}
            >
                Data Management
            </h2>

            <div style={{ display: "grid", gap: 24 }}>
                {/* Export Section */}
                <section
                    style={{
                        background: "#18181b",
                        padding: 24,
                        borderRadius: 12,
                        border: "1px solid #27272a",
                    }}
                >
                    <h3
                        style={{
                            fontSize: 18,
                            marginBottom: 16,
                            color: "#fbbf24",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                        }}
                    >
                        <span>⭳</span> Export Data
                    </h3>
                    <p style={{ color: "#a1a1aa", fontSize: 14, marginBottom: 20 }}>
                        Download your current workspace or full ecosystem state as a JSON
                        file.
                    </p>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <button
                            onClick={handleExportWorkspace}
                            style={{
                                padding: "8px 16px",
                                background: "#27272a",
                                border: "1px solid #3f3f46",
                                color: "#e4e4e7",
                                borderRadius: 6,
                                cursor: "pointer",
                                fontFamily: "inherit",
                            }}
                        >
                            Export Workspace
                        </button>
                        <button
                            onClick={handleExportEcosystem}
                            style={{
                                padding: "8px 16px",
                                background: "#27272a",
                                border: "1px solid #3f3f46",
                                color: "#e4e4e7",
                                borderRadius: 6,
                                cursor: "pointer",
                                fontFamily: "inherit",
                            }}
                        >
                            Export Ecosystem
                        </button>
                        <button
                            onClick={handleFullBackup}
                            style={{
                                padding: "8px 16px",
                                background: "#00e5a0",
                                border: "none",
                                color: "#000",
                                fontWeight: 600,
                                borderRadius: 6,
                                cursor: "pointer",
                                fontFamily: "inherit",
                            }}
                        >
                            Full Backup (.json)
                        </button>
                    </div>
                </section>

                {/* Import Section */}
                <section
                    style={{
                        background: "#18181b",
                        padding: 24,
                        borderRadius: 12,
                        border: "1px solid #27272a",
                    }}
                >
                    <h3
                        style={{
                            fontSize: 18,
                            marginBottom: 16,
                            color: "#38bdf8",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                        }}
                    >
                        <span>⭱</span> Import Data
                    </h3>
                    <p style={{ color: "#a1a1aa", fontSize: 14, marginBottom: 20 }}>
                        Restore a previous state from a JSON file. This will overwrite
                        current data.
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <button
                            onClick={handleImportClick}
                            style={{
                                padding: "8px 16px",
                                background: "#3f3f46",
                                border: "none",
                                color: "#fff",
                                borderRadius: 6,
                                cursor: "pointer",
                                fontFamily: "inherit",
                            }}
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
                                style={{
                                    fontSize: 14,
                                    color: importStatus.startsWith("Error") ? "#ef4444" : "#00e5a0",
                                }}
                            >
                                {importStatus}
                            </span>
                        )}
                    </div>
                </section>

                {/* Danger Zone */}
                <section
                    style={{
                        background: "rgba(239,68,68,0.05)",
                        padding: 24,
                        borderRadius: 12,
                        border: "1px solid rgba(239,68,68,0.2)",
                    }}
                >
                    <h3
                        style={{
                            fontSize: 18,
                            marginBottom: 16,
                            color: "#ef4444",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                        }}
                    >
                        <span>⚠</span> Danger Zone
                    </h3>
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                        }}
                    >
                        <p style={{ color: "#fca5a5", fontSize: 14, margin: 0 }}>
                            Clear all data from LocalStorage and reset application to default
                            state.
                        </p>
                        <button
                            onClick={handleReset}
                            style={{
                                padding: "8px 16px",
                                background: "#ef4444",
                                border: "none",
                                color: "#fff",
                                borderRadius: 6,
                                cursor: "pointer",
                                fontWeight: 600,
                                fontFamily: "inherit",
                            }}
                        >
                            Reset All Data
                        </button>
                    </div>
                </section>
            </div>
        </div>
    );
}
