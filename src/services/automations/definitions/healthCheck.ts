
import { AutomationDefinition } from "../types";
import { CommandContext } from "../../commands/types";
import { pingAgentCommand } from "../../commands/definitions/agent";

export const healthCheckAutomation: AutomationDefinition = {
    type: "code",
    id: "health_check",
    name: "System Health Check",
    description: "Periodically pings all agents to ensure they are online and responsive. Queues repair jobs for unresponsive agents.",
    tags: ["health", "system", "maintenance"],
    schedule: "every 5m",

    execute: async (context: CommandContext, runId: string) => {
        const { agents, addLog } = context.workspace;
        const { jobs } = context;

        const report = {
            total: agents.length,
            online: 0,
            offline: 0,
            failures: [] as any[]
        };

        addLog(`[HealthCheck] Pinging ${agents.length} agents...`);

        for (const agent of agents) {
            try {
                // We manually execute the ping command logic here or call it if it were exposed as a service function.
                // Since commands are definitions, we can re-use the execute logic if we construct the right args.
                // But simpler is to call the logic directly if possible, or just invoke the command via a command runner if we had one.
                // For now, let's manually invoke the ping command's execute since we have it imported.

                await pingAgentCommand.execute({ agentId: agent.id }, context);
                report.online++;
            } catch (err) {
                report.offline++;
                report.failures.push({
                    agentId: agent.id,
                    name: agent.name,
                    error: err instanceof Error ? err.message : String(err)
                });
            }
        }

        // Analysis
        if (report.offline > 0) {
            addLog(`[HealthCheck] ⚠️ Found ${report.offline} unresponsive agents.`);

            // Queue a job to fix/investigate
            jobs.addJob({
                type: "investigate_agent_failures", // Hypothetical job type, or we could use a generic 'task'
                request: {
                    failures: report.failures,
                    source: "health_check_automation",
                    runId
                }
            });
            addLog(`[HealthCheck] Queued investigation job.`);
        } else {
            addLog(`[HealthCheck] All systems nominal.`);
        }

        return report;
    }
};
