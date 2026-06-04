import type { Agent } from "@/types";
import type { JobArtifact } from "@/types";
import type {
  AgentCognitionProfileManifest,
  CognitionProtocolRenderResult,
  CognitionNode,
  CognitionEdge,
  CognitionSubAgentPlot,
} from "./types";

const STORAGE_KEY = "decops.agent-cognition.profiles.v1";
export const COGNITION_PROFILE_ARTIFACT_TAG = "cognition:profile";
export const COGNITION_PROFILE_SCHEMA = "agent-cognition-profile";

function nowIso(): string {
  return new Date().toISOString();
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function cloneManifest(manifest: AgentCognitionProfileManifest): AgentCognitionProfileManifest {
  return JSON.parse(JSON.stringify(manifest)) as AgentCognitionProfileManifest;
}

function normalizePlot(plot: CognitionSubAgentPlot): CognitionSubAgentPlot {
  return {
    ...plot,
    enabled: !!plot.enabled,
    triggerStage: plot.triggerStage || "any",
    triggerCondition: plot.triggerCondition || "",
    target: plot.target || "",
    directiveTemplate: plot.directiveTemplate || "",
    contextFields: Array.isArray(plot.contextFields) ? plot.contextFields.filter(Boolean) : [],
    resultPattern: {
      expectedFormat: plot.resultPattern?.expectedFormat || "summary",
      requiredOutputs: Array.isArray(plot.resultPattern?.requiredOutputs)
        ? plot.resultPattern.requiredOutputs.filter(Boolean)
        : [],
      successCriteria: plot.resultPattern?.successCriteria || "",
      failureSignal: plot.resultPattern?.failureSignal || "",
    },
  };
}

function normalizeManifest(manifest: AgentCognitionProfileManifest): AgentCognitionProfileManifest {
  return {
    ...manifest,
    spec: {
      ...manifest.spec,
      subAgentPlots: Array.isArray((manifest.spec as any).subAgentPlots)
        ? ((manifest.spec as any).subAgentPlots as CognitionSubAgentPlot[]).map(normalizePlot)
        : [],
    },
  };
}

function makeDefaultLinearProfile(): AgentCognitionProfileManifest {
  const createdAt = nowIso();
  const nodes: CognitionNode[] = [
    {
      id: "intent",
      title: "Intent Analysis",
      stage: "intent-analysis",
      objective: "Clarify what the user wants, constraints, and success criteria.",
      prompts: [
        "Restate the user goal in one sentence.",
        "Call out constraints, assumptions, and blockers.",
        "Decide whether tool execution is required.",
      ],
      outputFields: ["confidence", "needsTools", "plan"],
    },
    {
      id: "plan",
      title: "Planning",
      stage: "planning",
      objective: "Define the smallest useful sequence of actions.",
      prompts: [
        "Prefer one flat serial plan unless dependencies force branching.",
        "Name the next concrete command or job.",
      ],
      outputFields: ["nextAction", "expectedSignal"],
    },
    {
      id: "execute",
      title: "Tool Execution",
      stage: "tool-execution",
      objective: "Run the selected command/tool with explicit arguments.",
      prompts: [
        "Emit one real tool call when tools are needed.",
        "Avoid narration-only execution claims.",
        "A tool call is never the end of the turn; it must be followed by assessment.",
      ],
      outputFields: ["command", "args"],
    },
    {
      id: "assess",
      title: "Result Assessment",
      stage: "result-assessment",
      objective: "Compare observed results against expected signal.",
      prompts: [
        "Cite the key field from the tool result.",
        "Mark mismatch as ERROR or UNEXPECTED.",
      ],
      outputFields: ["assessment", "next"],
    },
    {
      id: "adapt",
      title: "Adaptation",
      stage: "adaptation",
      objective: "Adjust the plan when results diverge from expectations.",
      prompts: [
        "Change args or command based on evidence.",
        "Retry once with a concrete correction, then report failure.",
      ],
      outputFields: ["correction", "retryDecision"],
    },
    {
      id: "complete",
      title: "Completion",
      stage: "completion",
      objective: "Stop when prompt intent is satisfied and summarize outcome.",
      prompts: [
        "Return concise final answer with concrete outputs.",
        "Do not continue loop if user goal is satisfied.",
      ],
      outputFields: ["finalSummary"],
    },
  ];
  const edges: CognitionEdge[] = [
    { from: "intent", to: "plan", condition: "needsTools = yes OR structured reasoning required" },
    { from: "intent", to: "complete", condition: "needsTools = no AND direct answer is sufficient" },
    { from: "plan", to: "execute", condition: "next action selected" },
    { from: "execute", to: "assess", condition: "tool result received" },
    { from: "assess", to: "complete", condition: "result matches plan and prompt satisfied" },
    { from: "assess", to: "adapt", condition: "ERROR or UNEXPECTED result" },
    { from: "adapt", to: "execute", condition: "corrective action available" },
    { from: "adapt", to: "complete", condition: "no safe corrective action available" },
  ];

  return {
    kind: "v0",
    schema: "agent-cognition-profile",
    metadata: {
      name: "Linear Delivery Loop",
      labels: { mode: "linear" },
      annotations: {
        description: "Default decops cognition loop: analyze, plan, execute, assess, adapt, complete.",
        owner: "decops",
      },
      timestamps: { createdAt, updatedAt: createdAt },
    },
    spec: {
      profileId: "linear-v1",
      version: "1.0.0",
      nodes,
      edges,
      strictLoop: true,
      subAgentPlots: [],
    },
  };
}

function makeDefaultAdaptiveProfile(): AgentCognitionProfileManifest {
  const createdAt = nowIso();
  return {
    kind: "v0",
    schema: "agent-cognition-profile",
    metadata: {
      name: "Adaptive Consensus Loop",
      labels: { mode: "adaptive" },
      annotations: {
        description: "Adaptive profile for uncertain tasks with frequent reassessment.",
        owner: "decops",
      },
      timestamps: { createdAt, updatedAt: createdAt },
    },
    spec: {
      profileId: "adaptive-v1",
      version: "1.0.0",
      strictLoop: false,
      nodes: [
        {
          id: "intent",
          title: "Intent Analysis",
          stage: "intent-analysis",
          objective: "Extract goal, constraints, and unknowns.",
          prompts: [
            "Identify uncertainty early.",
            "Prefer discovery actions before mutation when confidence is low.",
          ],
          outputFields: ["confidence", "unknowns", "needsTools"],
        },
        {
          id: "plan",
          title: "Hypothesis Planning",
          stage: "planning",
          objective: "Form a testable next-step hypothesis.",
          prompts: [
            "Choose the smallest action that can confirm or reject the hypothesis.",
          ],
          outputFields: ["hypothesis", "nextAction"],
        },
        {
          id: "execute",
          title: "Action",
          stage: "tool-execution",
          objective: "Execute selected action or discovery query.",
          prompts: ["Use concrete arguments and avoid speculative narration."],
          outputFields: ["command", "args"],
        },
        {
          id: "assess",
          title: "Feedback Assessment",
          stage: "result-assessment",
          objective: "Update confidence and route next action from evidence.",
          prompts: [
            "Cite evidence fields from tool result.",
            "If uncertainty remains high, route back to planning.",
          ],
          outputFields: ["assessment", "confidence", "next"],
        },
        {
          id: "complete",
          title: "Completion",
          stage: "completion",
          objective: "Conclude when acceptance criteria are satisfied.",
          prompts: ["Summarize evidence and outcome in concise form."],
          outputFields: ["finalSummary"],
        },
      ],
      edges: [
        { from: "intent", to: "plan", condition: "default" },
        { from: "plan", to: "execute", condition: "hypothesis selected" },
        { from: "execute", to: "assess", condition: "action returns" },
        { from: "assess", to: "plan", condition: "confidence remains low OR unresolved unknowns" },
        { from: "assess", to: "complete", condition: "prompt satisfied with sufficient confidence" },
      ],
      subAgentPlots: [],
    },
  };
}

function defaultProfiles(): AgentCognitionProfileManifest[] {
  return [makeDefaultLinearProfile(), makeDefaultAdaptiveProfile()];
}

function parseStoredProfiles(raw: string | null): AgentCognitionProfileManifest[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const manifests = parsed.filter((item): item is AgentCognitionProfileManifest => {
      const m = item as AgentCognitionProfileManifest;
      return !!m && m.kind === "v0" && m.schema === "agent-cognition-profile" && !!m.spec?.profileId;
    });
    return manifests.length > 0 ? manifests : null;
  } catch {
    return null;
  }
}

function loadProfiles(): AgentCognitionProfileManifest[] {
  if (typeof localStorage === "undefined") return defaultProfiles();
  const stored = parseStoredProfiles(localStorage.getItem(STORAGE_KEY));
  if (!stored) {
    const seeded = defaultProfiles();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }
  const byId = new Map<string, AgentCognitionProfileManifest>();
  for (const profile of [...defaultProfiles(), ...stored]) {
    byId.set(profile.spec.profileId, profile);
  }
  return Array.from(byId.values());
}

function saveProfiles(profiles: AgentCognitionProfileManifest[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

function validateManifest(manifest: AgentCognitionProfileManifest): void {
  if (manifest.kind !== "v0") throw new Error("cognition profile kind must be 'v0'");
  if (manifest.schema !== COGNITION_PROFILE_SCHEMA) throw new Error("cognition profile schema must be 'agent-cognition-profile'");
  if (!manifest.spec.profileId || manifest.spec.profileId.trim().length < 3) {
    throw new Error("cognition profileId must be at least 3 characters");
  }
  if (!Array.isArray(manifest.spec.nodes) || manifest.spec.nodes.length < 2) {
    throw new Error("cognition profile must include at least 2 nodes");
  }
  if (!Array.isArray(manifest.spec.edges) || manifest.spec.edges.length < 1) {
    throw new Error("cognition profile must include at least 1 edge");
  }
  if (!Array.isArray(manifest.spec.subAgentPlots)) {
    throw new Error("cognition profile subAgentPlots must be an array");
  }

  const nodeIds = manifest.spec.nodes.map((n) => n.id).filter(Boolean);
  if (unique(nodeIds).length !== nodeIds.length) {
    throw new Error("cognition profile nodes must have unique ids");
  }

  const known = new Set(nodeIds);
  for (const edge of manifest.spec.edges) {
    if (!known.has(edge.from) || !known.has(edge.to)) {
      throw new Error(`cognition edge references unknown node: ${edge.from} -> ${edge.to}`);
    }
    if (!edge.condition || edge.condition.trim().length === 0) {
      throw new Error("cognition edge condition is required");
    }
  }

  const plotIds = manifest.spec.subAgentPlots.map((p) => p.id).filter(Boolean);
  if (unique(plotIds).length !== plotIds.length) {
    throw new Error("cognition sub-agent plots must have unique ids");
  }

  for (const plot of manifest.spec.subAgentPlots) {
    if (!plot.name || !plot.name.trim()) {
      throw new Error("cognition sub-agent plot name is required");
    }
    if (!plot.triggerCondition || !plot.triggerCondition.trim()) {
      throw new Error(`cognition sub-agent plot ${plot.id || plot.name} requires triggerCondition`);
    }
    if (!plot.directiveTemplate || !plot.directiveTemplate.trim()) {
      throw new Error(`cognition sub-agent plot ${plot.id || plot.name} requires directiveTemplate`);
    }
    if (!plot.target || !plot.target.trim()) {
      throw new Error(`cognition sub-agent plot ${plot.id || plot.name} requires target`);
    }
  }
}

function parseManifestContent(content: string | undefined): AgentCognitionProfileManifest | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content) as AgentCognitionProfileManifest;
    if (!parsed || parsed.kind !== "v0" || parsed.schema !== COGNITION_PROFILE_SCHEMA) return null;
    return parsed;
  } catch {
    return null;
  }
}

function renderProtocol(profile: AgentCognitionProfileManifest): string {
  const nodeLines = profile.spec.nodes.map((node, idx) => {
    const promptLine = node.prompts.length > 0
      ? node.prompts.map((p) => `- ${p}`).join("\n")
      : "- No prompts configured.";
    return [
      `${idx + 1}. ${node.title} (${node.stage})`,
      `Objective: ${node.objective}`,
      `Prompts:\n${promptLine}`,
      `Output fields: ${node.outputFields.join(", ") || "none"}`,
    ].join("\n");
  });

  const edgeLines = profile.spec.edges.map((edge) => {
    return `- ${edge.from} -> ${edge.to} when ${edge.condition}`;
  });

  const subAgentLines = profile.spec.subAgentPlots.length > 0
    ? profile.spec.subAgentPlots.map((plot, idx) => [
      `${idx + 1}. ${plot.name} (${plot.enabled ? "enabled" : "disabled"})`,
      `Trigger: stage=${plot.triggerStage}, when ${plot.triggerCondition}`,
      `Dispatch target: ${plot.target}`,
      `Directive template: ${plot.directiveTemplate}`,
      `Context fields: ${plot.contextFields.join(", ") || "none"}`,
      `Result pattern: format=${plot.resultPattern.expectedFormat}; required=${plot.resultPattern.requiredOutputs.join(", ") || "none"}`,
      `Success criteria: ${plot.resultPattern.successCriteria || "n/a"}`,
      `Failure signal: ${plot.resultPattern.failureSignal || "n/a"}`,
    ].join("\n"))
    : ["- No sub-agent plots configured."];

  return [
    `AGENT COGNITION PROTOCOL (profile: ${profile.metadata.name} / ${profile.spec.profileId})`,
    `Mode: ${profile.metadata.labels.mode} | Strict loop: ${profile.spec.strictLoop ? "yes" : "no"}`,
    "",
    "Mind-map nodes:",
    ...nodeLines,
    "",
    "Transitions:",
    ...edgeLines,
    "",
    "Sub-agent dispatch plots:",
    ...subAgentLines,
    "",
    "Execution contract:",
    "- Start each turn with one fenced ```thinking block.",
    "- If tools are needed, emit one real tool call after the thinking block.",
    "- After each tool result, emit a second ```thinking block with Assess and Next.",
    "- Never end the turn immediately after a tool call; every tool call requires an assessment step before completion.",
    "- Evaluate enabled sub-agent plots after assessment/adaptation and dispatch only when trigger conditions match.",
    "- Every sub-agent dispatch must include a clear directive and expected result pattern before execution.",
    "- REQUIRED dispatch envelope format:",
    "  [SUB-AGENT DISPATCH]",
    "  dispatch-id: <unique id>",
    "  plot: <plot-id>",
    "  directive: <clear directive>",
    "  expected-format: <format>",
    "- Never narrate fake tool calls or fabricate tool results.",
    profile.spec.strictLoop
      ? "- Follow transitions strictly; only conclude when completion criteria are met."
      : "- You may short-circuit to completion when evidence clearly satisfies the prompt.",
  ].join("\n");
}

function findCognitionBinding(agent: Agent): { profileId?: string } | null {
  const binding = (agent.toolkits || []).find((b) => b.toolkitId === "agent-cognition");
  if (!binding || !binding.config || typeof binding.config !== "object") return null;
  const cfg = binding.config as Record<string, unknown>;
  return {
    profileId: typeof cfg.profileId === "string" ? cfg.profileId : undefined,
  };
}

class AgentCognitionService {
  listProfiles(): AgentCognitionProfileManifest[] {
    return loadProfiles().map((p) => cloneManifest(normalizeManifest(p)));
  }

  getProfile(profileId: string): AgentCognitionProfileManifest | null {
    const hit = loadProfiles().find((p) => p.spec.profileId === profileId) ?? null;
    return hit ? normalizeManifest(hit) : null;
  }

  upsertProfile(manifest: AgentCognitionProfileManifest): AgentCognitionProfileManifest {
    const normalizedInput = normalizeManifest(manifest);
    validateManifest(normalizedInput);
    const now = nowIso();
    const normalized: AgentCognitionProfileManifest = {
      ...normalizedInput,
      metadata: {
        ...normalizedInput.metadata,
        timestamps: {
          createdAt: normalizedInput.metadata.timestamps?.createdAt || now,
          updatedAt: now,
        },
      },
    };
    const profiles = loadProfiles();
    const next = profiles.filter((p) => p.spec.profileId !== normalized.spec.profileId);
    next.push(normalized);
    saveProfiles(next);
    return cloneManifest(normalized);
  }

  deleteProfile(profileId: string): boolean {
    if (profileId === "linear-v1" || profileId === "adaptive-v1") return false;
    const current = loadProfiles();
    const next = current.filter((p) => p.spec.profileId !== profileId);
    if (next.length === current.length) return false;
    saveProfiles(next);
    return true;
  }

  resolveProfileForAgent(agent: Agent): AgentCognitionProfileManifest {
    const binding = findCognitionBinding(agent);
    const selected = binding?.profileId;
    if (selected) {
      const hit = this.getProfile(selected);
      if (hit) return hit;
    }
    return this.getProfile("linear-v1") || makeDefaultLinearProfile();
  }

  renderProtocolForProfile(profileId: string): CognitionProtocolRenderResult {
    const profile = this.getProfile(profileId);
    if (!profile) throw new Error(`Unknown cognition profile: ${profileId}`);
    return {
      profileId: profile.spec.profileId,
      profileName: profile.metadata.name,
      strictLoop: profile.spec.strictLoop,
      text: renderProtocol(profile),
    };
  }

  renderProtocolForAgent(agent: Agent): CognitionProtocolRenderResult {
    const profile = this.resolveProfileForAgent(agent);
    return {
      profileId: profile.spec.profileId,
      profileName: profile.metadata.name,
      strictLoop: profile.spec.strictLoop,
      text: renderProtocol(profile),
    };
  }

  buildProfileArtifact(input: {
    profile: AgentCognitionProfileManifest;
    name?: string;
    description?: string;
    tags?: string[];
    source?: JobArtifact["source"];
  }): JobArtifact {
    const profileId = input.profile.spec.profileId;
    const now = Date.now();
    const artifactName = input.name || `${profileId}.cognition-profile.json`;
    return {
      id: crypto.randomUUID(),
      name: artifactName,
      type: "json",
      content: JSON.stringify(input.profile, null, 2),
      tags: Array.from(new Set([
        "type:json",
        COGNITION_PROFILE_ARTIFACT_TAG,
        `cognition:profile-id:${profileId}`,
        ...(input.tags || []),
      ])),
      createdAt: now,
      description: input.description || `Agent cognition profile export: ${profileId}`,
      source: input.source || "command",
    };
  }

  isCognitionProfileArtifact(artifact: JobArtifact): boolean {
    if (artifact.type !== "json") return false;
    if (artifact.tags?.includes(COGNITION_PROFILE_ARTIFACT_TAG)) return true;
    return !!parseManifestContent(artifact.content);
  }

  upsertProfileFromArtifact(artifact: JobArtifact): AgentCognitionProfileManifest {
    const parsed = parseManifestContent(artifact.content);
    if (!parsed) {
      throw new Error(`Artifact ${artifact.name} is not a valid cognition profile manifest`);
    }
    return this.upsertProfile(parsed);
  }
}

export const agentCognitionService = new AgentCognitionService();
