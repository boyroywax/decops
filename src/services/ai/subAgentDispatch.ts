import type { CognitionSubAgentPlot } from "@/toolkits/cognition/types";

export interface DispatchEnvelope {
  dispatchId?: string;
  plotId?: string;
  directive?: string;
  expectedFormat?: string;
}

export interface DispatchCandidate {
  via: string;
  target: string;
  message: string;
  envelope: DispatchEnvelope;
}

export interface DispatchResultEnvelope {
  dispatchId?: string;
  status?: string;
  summary?: string;
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "then", "when", "where", "into", "about", "after", "before", "must", "should", "agent", "sub", "task", "need", "needs",
]);

export function parseDispatchEnvelope(message: string): DispatchEnvelope {
  const lines = message.split(/\r?\n/).map((line) => line.trim());
  const out: DispatchEnvelope = {};
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.startsWith("dispatch-id:")) out.dispatchId = line.slice(12).trim();
    if (lower.startsWith("plot:")) out.plotId = line.slice(5).trim();
    if (lower.startsWith("directive:")) out.directive = line.slice(10).trim();
    if (lower.startsWith("expected-format:")) out.expectedFormat = line.slice(16).trim();
  }
  return out;
}

export function parseDispatchResultEnvelope(message: string): DispatchResultEnvelope | null {
  if (!message.includes("[SUB-AGENT RESULT]")) return null;
  const lines = message.split(/\r?\n/).map((line) => line.trim());
  const out: DispatchResultEnvelope = {};
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.startsWith("dispatch-id:")) out.dispatchId = line.slice(12).trim();
    if (lower.startsWith("status:")) out.status = line.slice(7).trim();
    if (lower.startsWith("summary:")) out.summary = line.slice(8).trim();
  }
  return out;
}

function buildCandidate(via: string, target: string, message: string): DispatchCandidate | null {
  if (!target || !message) return null;
  return {
    via,
    target,
    message,
    envelope: parseDispatchEnvelope(message),
  };
}

export function extractDispatchCandidate(name: string, input: Record<string, unknown>): DispatchCandidate | null {
  if (name === "send_message") {
    const target = typeof input.to_agent_id === "string"
      ? input.to_agent_id
      : typeof input.agentId === "string"
        ? input.agentId
        : "";
    const message = typeof input.message === "string" ? input.message : "";
    return buildCandidate("send_message", target, message);
  }

  if (name === "broadcast_message") {
    const target = typeof input.group_id === "string" ? input.group_id : "";
    const message = typeof input.message === "string" ? input.message : "";
    return buildCandidate("broadcast_message", target, message);
  }

  if (name === "create_job") {
    const commandId = typeof input.commandId === "string" ? input.commandId : "";
    const args = (input.args && typeof input.args === "object") ? input.args as Record<string, unknown> : null;
    if ((commandId === "send_message" || commandId === "broadcast_message") && args) {
      const candidate = extractDispatchCandidate(commandId, args);
      return candidate ? { ...candidate, via: `create_job:${commandId}` } : null;
    }
  }

  if (name === "queue_new_job") {
    const steps = Array.isArray(input.steps) ? input.steps as Array<Record<string, unknown>> : [];
    for (const step of steps) {
      const commandId = typeof step.commandId === "string" ? step.commandId : "";
      const args = (step.args && typeof step.args === "object") ? step.args as Record<string, unknown> : null;
      if ((commandId === "send_message" || commandId === "broadcast_message") && args) {
        const hit = extractDispatchCandidate(commandId, args);
        if (hit) return { ...hit, via: `queue_new_job:${commandId}` };
      }
    }
  }

  return null;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
}

function extractMeaningfulTokens(condition: string): string[] {
  const normalized = normalize(condition);
  if (!normalized) return [];
  return normalized
    .split(" ")
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token));
}

export function matchesPlotTrigger(plot: CognitionSubAgentPlot, userMessage: string): boolean {
  const condition = plot.triggerCondition?.trim() || "";
  if (!condition) return false;

  const c = condition.toLowerCase();
  if (c === "always" || c === "any" || c === "always dispatch") return true;

  const normalizedUser = normalize(userMessage);
  if (!normalizedUser) return false;

  const tokens = extractMeaningfulTokens(condition);
  if (tokens.length === 0) {
    const needle = normalize(condition);
    return needle.length >= 3 && normalizedUser.includes(needle);
  }

  const matches = tokens.filter((token) => normalizedUser.includes(token)).length;
  const required = Math.max(1, Math.ceil(tokens.length * 0.5));
  return matches >= required;
}
