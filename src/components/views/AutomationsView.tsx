
import { useState, useMemo } from "react";
import { useAutomations } from "../../context/AutomationsContext";
import { AutomationCard } from "../automations/AutomationCard";
import { AutomationLogViewer } from "../automations/AutomationLogViewer";
import type { AutomationRun } from "../../services/automations/types";

import { AutomationBuilder } from "../automations/AutomationBuilder";

export function AutomationsView() {
    const { automations, runs, runAutomation } = useAutomations();
    const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    // Get the latest run for each automation
    const lastRuns = useMemo(() => {
        const map = new Map<string, AutomationRun>();
        runs.forEach(run => {
            const existing = map.get(run.automationId);
            if (!existing || run.startTime > existing.startTime) {
                map.set(run.automationId, run);
            }
        });
        return map;
    }, [runs]);

    // Check which are currently running
    const runningIds = useMemo(() => {
        return new Set(runs.filter(r => r.status === "running").map(r => r.automationId));
    }, [runs]);

    const handleRun = async (id: string) => {
        try {
            await runAutomation(id);
        } catch (e) {
            console.error("Failed to run automation", e);
        }
    };

    const selectedRun = runs.find(r => r.id === selectedRunId) || null;

    if (isCreating) {
        return <AutomationBuilder onClose={() => setIsCreating(false)} />;
    }

    return (
        <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, fontFamily: "var(--font-display)" }}>Automations</h1>
                    <p style={{ color: "#a1a1aa", marginTop: 8 }}>Manage and monitor automated workflows.</p>
                </div>
                <button
                    onClick={() => setIsCreating(true)}
                    style={{
                        padding: "8px 16px",
                        background: "#2563eb",
                        color: "white",
                        border: "none",
                        borderRadius: 6,
                        fontWeight: 500,
                        cursor: "pointer"
                    }}
                >
                    + New Automation
                </button>
            </div>

            <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                gap: 20
            }}>
                {automations.map(def => (
                    <AutomationCard
                        key={def.id}
                        automation={def}
                        lastRun={lastRuns.get(def.id)}
                        isRunning={runningIds.has(def.id)}
                        onRun={handleRun}
                        onViewLogs={(id) => {
                            // Find the latest run for this automation to show logs
                            // Or show a list of runs? For now, show latest.
                            const latest = lastRuns.get(id);
                            if (latest) setSelectedRunId(latest.id);
                        }}
                    />
                ))}
            </div>

            {selectedRunId && (
                <AutomationLogViewer
                    run={selectedRun}
                    onClose={() => setSelectedRunId(null)}
                />
            )}
        </div>
    );
}
