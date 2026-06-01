interface ToolkitPlaybookEntry {
  name: string;
  useWhen: string[];
  avoidWhen?: string[];
  workflow: string[];
}

const PLAYBOOK: Record<string, ToolkitPlaybookEntry> = {
  "workspace-rag": {
    name: "Workspace RAG",
    useWhen: [
      "You need semantic recall of workspace state beyond exact keyword matches.",
      "The user asks for prior decisions, old topology details, or indirectly phrased context.",
    ],
    avoidWhen: [
      "You only need immediate state already present in the current workspace snapshot.",
    ],
    workflow: [
      "Check workspace_rag_status before high-stakes actions.",
      "If stale/dirty, run index_workspace_rag, then use search_workspace_rag with focused query terms.",
      "Use search hits to ground create_job plans and final answers.",
    ],
  },
  jobs: {
    name: "Jobs",
    useWhen: [
      "The request has more than one operation, side effects, or dependencies.",
      "The user wants repeatable execution, visibility, or cancellation support.",
    ],
    workflow: [
      "Discover commandId via search_workspace_rag first; use list_available_commands only if RAG does not resolve a reliable command name.",
      "Use create_job for one-shot operations and queue_new_job for explicit multi-step plans.",
      "Model data flow with storageDefaults + output mappings + input bindings.",
    ],
  },
  "agent-management": {
    name: "Agent Management",
    useWhen: [
      "Creating specialists, updating agent prompts, or assigning capabilities.",
      "Adjusting team composition before running workflows.",
    ],
    workflow: [
      "Create or update agents first, then bind toolkits, then wire channels/groups.",
      "Prefer minimal toolkit assignment per role (least privilege).",
    ],
  },
  ecosystem: {
    name: "Ecosystem",
    useWhen: [
      "Changing topology: networks, bridges, channels, cross-network communication.",
      "Investigating communication paths or governance boundaries.",
    ],
    workflow: [
      "Establish networks/bridges before delegating cross-network jobs.",
      "Validate entities with list commands before destructive changes.",
    ],
  },
  infrastructure: {
    name: "Infrastructure",
    useWhen: [
      "Starting/stopping runtime services, connectivity setup, or node operations.",
    ],
    workflow: [
      "Run read-only probes first, then apply state-changing actions.",
      "When multiple infra steps are needed, package into a job with clear checkpoints.",
    ],
  },
  artifacts: {
    name: "Artifacts",
    useWhen: [
      "Producing durable outputs: plans, reports, manifests, extracted results.",
    ],
    workflow: [
      "Declare deliverables in jobs and map step outputs intentionally.",
      "Reference artifacts by id/tag for follow-up jobs instead of rewriting data.",
    ],
  },
  "collective-memory": {
    name: "Collective Memory",
    useWhen: [
      "Capturing durable decisions/preferences and reusing cross-conversation context.",
    ],
    workflow: [
      "Recall before non-trivial planning when prior choices might exist.",
      "Remember concise, self-contained facts after meaningful outcomes.",
    ],
  },
  studio: {
    name: "Studio",
    useWhen: [
      "The user asks to visually build/inspect jobs or automations.",
    ],
    workflow: [
      "Shape metadata and steps first, then bind inputs/outputs/storage, then add triggers.",
    ],
  },
  "workspace-mgmt": {
    name: "Workspace Management",
    useWhen: [
      "Creating/switching/exporting workspace scope and setup concerns.",
    ],
    workflow: [
      "Confirm target workspace identity before mutating operations.",
      "Export before large refactors or destructive actions.",
    ],
  },
};

interface BuildGuideOptions {
  maxToolkits?: number;
}

export function buildToolkitUsageGuide(toolkitIds: string[], opts: BuildGuideOptions = {}): string {
  const maxToolkits = Math.max(1, Math.min(12, opts.maxToolkits ?? 6));
  const normalized = Array.from(new Set(toolkitIds.filter(Boolean)));
  const entries = normalized
    .map((id) => ({ id, entry: PLAYBOOK[id] }))
    .filter((x): x is { id: string; entry: ToolkitPlaybookEntry } => !!x.entry)
    .slice(0, maxToolkits);

  if (entries.length === 0) return "";

  return [
    "TOOLKIT OPERATOR PLAYBOOK:",
    ...entries.flatMap(({ id, entry }) => {
      const lines: string[] = [
        `- ${entry.name} (${id})`,
        `  Use when: ${entry.useWhen.join(" ")}`,
        `  Workflow: ${entry.workflow.join(" ")}`,
      ];
      if (entry.avoidWhen && entry.avoidWhen.length > 0) {
        lines.push(`  Avoid when: ${entry.avoidWhen.join(" ")}`);
      }
      return lines;
    }),
  ].join("\n");
}

export const JOB_CREATION_PLAYBOOK = `JOB EXECUTION PLAYBOOK:
- 1) Identify that a tool/command needs to run.
- 2) Search workspace RAG for the relevant tools/commands and current context.
- 3) Select the needed commands and create one job with a flat serial step list whenever possible.
- 4) Execute the job and wait for output.
- 5) If there is an error, diagnose it and rerun the job if possible.
- Prefer the simplest job shape that matches the work. Use create_job for a single command, and use queue_new_job only when a serial multi-step job is genuinely needed.
- Treat operational tool calls as command invocations executed through jobs, not prose narration.
- Always include clear step names/descriptions so the output is easy to review.`;

export const WORKSPACE_RAG_PLAYBOOK = `WORKSPACE RAG PLAYBOOK:
- Use RAG as command discovery + planning input before mutations: search first, then job execution.
- For ambiguous or historical questions, call workspace_rag_status and ensure index freshness.
- If stale/dirty, index_workspace_rag before planning or executing critical changes.
- Use search_workspace_rag with targeted terms to gather supporting context.
- Use retrieval context to refine job arguments, not as unquestioned truth.
- If retrieval conflicts with live workspace state, trust live state and re-index.`;
