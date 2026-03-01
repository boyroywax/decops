
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

                // Initialize shared storage from defaults
                const storage: Record<string, any> = { ...(def.storageDefaults || {}) };

                // Wire storage and deliverables into the context for this run
                this.context.storage = storage;
                this.context.addDeliverable = (deliverable) => {
                    const artifact = {
                        id: crypto.randomUUID(),
                        name: deliverable.name,
                        type: deliverable.type,
                        content: deliverable.content,
                        createdAt: Date.now(),
                        tags: [
                            `type:${deliverable.type}`,
                            `source:automation`,
                            `deliverable:${deliverable.key}`,
                            `automation:${automationId}`,
                            ...(deliverable.tags || []),
                        ],
                        source: "automation" as const,
                    };
                    this.context.jobs.importArtifact(artifact);
                    this.log(run, "info", `Deliverable produced: ${deliverable.name}`);
                };

                /** Recursively resolve $storage.key references in step args */
                const resolveStorageRefs = (value: any): any => {
                    if (typeof value === 'string' && value.startsWith('$storage.')) {
                        const key = value.slice('$storage.'.length);
                        return key in storage ? storage[key] : value;
                    }
                    if (Array.isArray(value)) return value.map(resolveStorageRefs);
                    if (value && typeof value === 'object') {
                        const out: any = {};
                        for (const [k, v] of Object.entries(value)) out[k] = resolveStorageRefs(v);
                        return out;
                    }
                    return value;
                };

                const executeStep = async (step: typeof def.steps[0]) => {
                    if (step.condition) {
                        const shouldRun = evaluateCondition(step.condition, this.context, results);
                        if (!shouldRun) {
                            this.log(run, "info", `Skipping step ${step.id} (${step.commandId}): Condition not met`);
                            results.push({ stepId: step.id, commandId: step.commandId, status: "skipped", result: "Condition not met" });
                            return;
                        }
                    }

                    this.log(run, "info", `Executing step: ${step.commandId}`);
                    try {
                        const resolvedArgs = resolveStorageRefs(step.args || {});
                        const stepResult = await registry.execute(step.commandId, resolvedArgs, this.context);
                        results.push({ stepId: step.id, commandId: step.commandId, status: "completed", result: stepResult });
                    } catch (e) {
                        this.log(run, "error", `Step ${step.id} (${step.commandId}) failed: ${e}`);
                        results.push({ stepId: step.id, commandId: step.commandId, status: "failed", result: String(e) });
                        if (def.mode !== "parallel") throw e; // Stop on failure in serial mode
                    }
                };

                if (def.mode === "parallel") {
                    this.log(run, "info", `Running ${def.steps.length} steps in parallel`);
                    await Promise.all(def.steps.map(step => executeStep(step)));
                } else {
                    for (const step of def.steps) {
                        await executeStep(step);
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
