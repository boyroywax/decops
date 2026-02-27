
import { CommandContext } from "../commands/types";

export interface AutomationLog {
    id?: string;
    timestamp: string;
    level: "info" | "warn" | "error";
    message: string;
    details?: any;
}

export interface AutomationRun {
    id: string;
    automationId: string;
    startTime: string;
    endTime?: string;
    status: "running" | "completed" | "failed";
    logs: AutomationLog[];
    results?: any;
    error?: string;
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
    /** Base64 data-URI or URL for a custom icon image */
    icon?: string;
}

export interface CodeAutomationDefinition extends BaseAutomationDefinition {
    type: "code";
    execute: (context: CommandContext, runId: string) => Promise<any>;
}

export interface DeclarativeAutomationDefinition extends BaseAutomationDefinition {
    type: "declarative";
    steps: AutomationStep[];
    mode?: "serial" | "parallel";
    deliverables?: import("../../types").JobDeliverable[];
    storageDefaults?: Record<string, any>;
}

export type AutomationDefinition = CodeAutomationDefinition | DeclarativeAutomationDefinition;

