
import { CommandContext } from "../commands/types";
import { AutomationDefinition, AutomationRun } from "./types";
import { getAutomation } from "./registry";
import { chatWithWorkspace, ChatMessage } from "../ai";

export class AutomationRunner {
    private context: CommandContext;

    constructor(context: CommandContext) {
        this.context = context;
    }

    async run(automationId: string): Promise<AutomationRun> {
        const def = getAutomation(automationId);
        if (!def) {
            throw new Error(`Automation ${automationId} not found`);
        }

        const runId = crypto.randomUUID();
        const run: AutomationRun = {
            id: runId,
            automationId,
            startTime: new Date().toISOString(),
            status: "running",
            logs: [],
        };

        try {
            // Log start
            this.log(run, "info", `Starting automation: ${def.name}`);

            let result;
            if (def.type === "code") {
                // Execute the automation's logic
                result = await def.execute(this.context, runId);
            } else if (def.type === "declarative") {
                const { registry } = await import("../commands/registry");
                const results: any[] = [];

                // Helper for simple condition evaluation
                const evaluateCondition = (condition: string, context: CommandContext, previousSteps: any[]) => {
                    try {
                        const stepMap = previousSteps.reduce((acc, s) => {
                            acc[s.stepId] = s;
                            return acc;
                        }, {} as any);
                        // eslint-disable-next-line no-new-func
                        const fn = new Function('steps', 'context', `return ${condition}`);
                        return fn(stepMap, context);
                    } catch (e) {
                        this.log(run, "warn", `Condition evaluation failed: ${condition}. Error: ${e}`);
                        return false;
                    }
                };

                for (const step of def.steps) {
                    if (step.condition) {
                        const shouldRun = evaluateCondition(step.condition, this.context, results);
                        if (!shouldRun) {
                            this.log(run, "info", `Skipping step ${step.id} (${step.commandId}): Condition not met`);
                            results.push({ stepId: step.id, commandId: step.commandId, status: "skipped", result: "Condition not met" });
                            continue;
                        }
                    }

                    this.log(run, "info", `Executing step: ${step.commandId}`);
                    try {
                        const stepResult = await registry.execute(step.commandId, step.args, this.context);
                        results.push({ stepId: step.id, commandId: step.commandId, status: "completed", result: stepResult });
                    } catch (e) {
                        this.log(run, "error", `Step ${step.id} (${step.commandId}) failed: ${e}`);
                        throw e; // Stop automation on failure
                    }
                }
                result = results;
            }

            run.results = result;
            run.status = "completed";
            run.endTime = new Date().toISOString();
            this.log(run, "info", "Automation completed successfully");

        } catch (error) {
            run.status = "failed";
            run.endTime = new Date().toISOString();
            const msg = error instanceof Error ? error.message : String(error);
            this.log(run, "error", `Automation failed: ${msg}`);
        }

        return run;
    }

    private log(run: AutomationRun, level: "info" | "warn" | "error", message: string) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            message
        };
        run.logs.push(logEntry);
        // Also log to system log
        this.context.workspace.addLog(`[Auto:${run.automationId}] ${message}`);
    }
}
