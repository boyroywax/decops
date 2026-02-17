
import { CommandContext } from "../commands/types";

export interface AutomationLog {
    timestamp: string;
    level: "info" | "warn" | "error";
    message: string;
}

export interface AutomationRun {
    id: string;
    automationId: string;
    startTime: string;
    endTime?: string;
    status: "running" | "completed" | "failed";
    logs: AutomationLog[];
    results?: any;
}

export interface AutomationStep {
    id: string;
    commandId: string;
    args: Record<string, any>;
    condition?: string;
}

export interface BaseAutomationDefinition {
    id: string;
    name: string;
    description: string;
    tags: string[];
    schedule?: string;
}

export interface CodeAutomationDefinition extends BaseAutomationDefinition {
    type: "code";
    execute: (context: CommandContext, runId: string) => Promise<any>;
}

export interface DeclarativeAutomationDefinition extends BaseAutomationDefinition {
    type: "declarative";
    steps: AutomationStep[];
}

export type AutomationDefinition = CodeAutomationDefinition | DeclarativeAutomationDefinition;

