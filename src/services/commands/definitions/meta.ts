/**
 * Meta commands — universal, always-available agent tools.
 *
 * These commands form the curated default tool surface exposed to AI agents.
 * Instead of registering every workspace command as a directly-callable tool
 * (which blows past Anthropic's 128-tool cap), agents discover capabilities
 * with `list_available_commands` / `get_command_schema` and execute them via
 * the `create_job` meta-tool.
 *
 *   create_job              — queue any command as a job
 *   list_available_commands — discover commands the agent may run
 *   get_command_schema      — inspect a single command's args
 *   list_toolkits           — enumerate toolkits in the workspace
 */

import { CommandDefinition } from "@/services/commands/types";
import { TOOLKITS } from "@/services/toolkits";
import { registry } from "@/services/commands/registry";
import { libp2pService } from "@/toolkits/libp2p/service";
import { heliaService } from "@/toolkits/helia/service";
import { kuboService } from "@/toolkits/kubo/service";
import { orbitdbService } from "@/toolkits/orbitdb/service";
import { orbitdbServerService } from "@/toolkits/orbitdb-server/service";
import { orchestratorService } from "@/toolkits/orchestrator/service";

/** Commands that must never be invoked via create_job (system / security). */
const SYSTEM_RESERVED = new Set<string>([
  "set_api_key",
  "select_ai_model",
  "reset_workspace",
  "create_job", // no recursion
]);

export const createJobCommand: CommandDefinition = {
  id: "create_job",
  description:
    "Queue any registered workspace command as a job. This is the primary way to take action — first discover commands with workspace RAG (fallback: list_available_commands; optionally inspect with get_command_schema), then call create_job with the chosen commandId and its args. Returns the queued jobId; the tool call waits for the spawned job to complete and returns its result.",
  tags: ["job", "system", "meta"],
  rbac: ["orchestrator", "builder", "researcher", "curator", "validator"],
  args: {
    commandId: {
      name: "commandId",
      type: "string",
      description:
        "ID of the command to run as a job. Must be a registered command (prefer workspace RAG discovery; fallback to list_available_commands).",
      required: true,
    },
    args: {
      name: "args",
      type: "object",
      description:
        "Arguments for the command, matching its declared schema (use get_command_schema to inspect).",
      required: false,
      defaultValue: {},
    },
    description: {
      name: "description",
      type: "string",
      description: "Optional human-readable label for the job.",
      required: false,
    },
  },
  output: "The queued job ID and metadata.",
  outputSchema: { type: "object", additionalProperties: true },
  spawnsChildJobs: true,
  execute: async (args, context) => {
    const commandId = String(args.commandId ?? "").trim();
    if (!commandId) {
      throw new Error("create_job requires a commandId.");
    }
    if (SYSTEM_RESERVED.has(commandId)) {
      throw new Error(`Command "${commandId}" is not allowed via create_job.`);
    }
    const def = registry.get(commandId);
    if (!def) {
      throw new Error(
        `Unknown commandId "${commandId}". Call search_workspace_rag first (fallback: list_available_commands) to discover available commands.`,
      );
    }
    if (def.hidden) {
      throw new Error(`Command "${commandId}" is hidden and cannot be invoked via create_job.`);
    }
    const jobArgs =
      (args.args as Record<string, unknown> | undefined) ??
      ({} as Record<string, unknown>);
    const queued = context.jobs.addJob({
      type: commandId,
      request: jobArgs,
    });
    return {
      jobId: queued.id,
      type: queued.type,
      queued: true,
      description:
        (args.description as string | undefined) ?? def.description,
    };
  },
};

export const listAvailableCommandsCommand: CommandDefinition = {
  id: "list_available_commands",
  description:
    "FALLBACK ONLY. Do not call this first. Discover commands via `search_workspace_rag` (the workspace RAG index contains every command, its description, and arg schema and returns ranked semantic matches). Call `list_available_commands` ONLY if RAG search has failed to surface a relevant command after at least one attempt, or if you need a deterministic alphabetical enumeration filtered by toolkit. Returns id, description, toolkit, and a short arg summary.",
  tags: ["meta", "discovery", "query"],
  rbac: ["orchestrator", "builder", "researcher", "curator", "validator"],
  args: {
    toolkitId: {
      name: "toolkitId",
      type: "string",
      description: "Optional toolkit ID to filter by.",
      required: false,
    },
    search: {
      name: "search",
      type: "string",
      description:
        "Optional case-insensitive substring filter on command id or description.",
      required: false,
    },
  },
  output: "Array of command summaries.",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async (args) => {
    const toolkitId = args.toolkitId as string | undefined;
    const search = (args.search as string | undefined)?.toLowerCase();

    let allowed: Set<string> | null = null;
    if (toolkitId) {
      const tk = TOOLKITS.find((t) => t.id === toolkitId);
      if (!tk) throw new Error(`Unknown toolkitId "${toolkitId}".`);
      allowed = new Set(tk.commands);
    }

    const toolkitByCmd = new Map<string, string>();
    for (const tk of TOOLKITS) {
      for (const cmd of tk.commands) {
        if (!toolkitByCmd.has(cmd)) toolkitByCmd.set(cmd, tk.id);
      }
    }

    const commands = registry
      .getAll()
      .filter((c) => !c.hidden && !SYSTEM_RESERVED.has(c.id))
      .filter((c) => (allowed ? allowed.has(c.id) : true))
      .filter(
        (c) =>
          !search ||
          c.id.toLowerCase().includes(search) ||
          c.description.toLowerCase().includes(search),
      )
      .map((c) => ({
        id: c.id,
        description: c.description,
        toolkit: toolkitByCmd.get(c.id) ?? null,
        argsSummary: Object.values(c.args).map((a) => ({
          name: a.name,
          type: a.type,
          required: a.required ?? true,
        })),
      }));

    return { count: commands.length, commands };
  },
};

export const getCommandSchemaCommand: CommandDefinition = {
  id: "get_command_schema",
  description:
    "Return the full argument schema for one command (use after list_available_commands when you need types, defaults, or enum values to build create_job args).",
  tags: ["meta", "discovery", "query"],
  rbac: ["orchestrator", "builder", "researcher", "curator", "validator"],
  args: {
    commandId: {
      name: "commandId",
      type: "string",
      description: "The command ID to inspect.",
      required: true,
    },
  },
  output: "Full schema for the named command.",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async (args) => {
    const commandId = String(args.commandId ?? "").trim();
    const def = registry.get(commandId);
    if (!def) throw new Error(`Unknown commandId "${commandId}".`);
    return {
      id: def.id,
      description: def.description,
      tags: def.tags,
      output: def.output,
      args: Object.values(def.args).map((a) => ({
        name: a.name,
        type: a.type,
        required: a.required ?? true,
        description: a.description,
        defaultValue: a.defaultValue,
        enum: a.enum,
      })),
    };
  },
};

export const listToolkitsCommand: CommandDefinition = {
  id: "list_toolkits",
  description:
    "List all registered toolkits with id, name, description, category, status, and command count. Use this to discover which toolkits are available to enable on an agent.",
  tags: ["meta", "toolkit", "discovery", "query"],
  rbac: ["orchestrator", "builder", "researcher", "curator", "validator"],
  args: {},
  output: "Array of toolkit summaries.",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async () => {
    return {
      count: TOOLKITS.length,
      toolkits: TOOLKITS.map((tk) => ({
        id: tk.id,
        name: tk.name,
        description: tk.description,
        category: tk.category,
        status: tk.status,
        commandCount: tk.commands.length,
      })),
    };
  },
};

// ── query_workspace ───────────────────────────────────────────────────────
//
// Unified read-only snapshot of workspace metrics. Agents call this once
// to orient themselves instead of chaining list_agents + list_channels +
// list_queue + list_networks + … which would otherwise burn rounds and
// blow context. The `sections` arg lets callers narrow the payload.

type WorkspaceQuerySection =
  | "summary"
  | "agents"
  | "channels"
  | "groups"
  | "messages"
  | "jobs"
  | "ecosystem"
  | "artifacts"
  | "toolkits"
  | "stack"
  | "orchestrator";

const ALL_SECTIONS: WorkspaceQuerySection[] = [
  "summary",
  "agents",
  "channels",
  "groups",
  "messages",
  "jobs",
  "ecosystem",
  "artifacts",
  "toolkits",
  "stack",
  "orchestrator",
];

function countBy<T>(items: T[], key: (item: T) => string | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = key(item) ?? "unknown";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** Defensively snapshot a singleton service — returns null if the service
 *  throws (uninitialized / SSR / test stub). */
function safeSnapshot<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

export const queryWorkspaceCommand: CommandDefinition = {
  id: "query_workspace",
  description:
    "Return a read-only snapshot of workspace metrics: agents, channels, groups, recent messages, job queue state, ecosystem networks/bridges, artifacts, and toolkit counts. Pass `sections` to narrow the payload (default: all). Use this to orient yourself before planning multi-step work.",
  tags: ["meta", "query", "discovery", "metrics"],
  rbac: ["orchestrator", "builder", "researcher", "curator", "validator"],
  args: {
    sections: {
      name: "sections",
      type: "array",
      description:
        "Sections to include. One or more of: summary, agents, channels, groups, messages, jobs, ecosystem, artifacts, toolkits, stack, orchestrator. Defaults to all. The 'stack' section returns libp2p / helia / kubo / orbitdb / orbitdb-server node inventories; 'orchestrator' returns L.O.H.K. stack profiles, their linked manifest, status, drift, and recent operation results.",
      required: false,
    },
    messageLimit: {
      name: "messageLimit",
      type: "number",
      description: "Max recent messages to include when 'messages' section is requested. Default 20.",
      required: false,
      defaultValue: 20,
    },
    jobLimit: {
      name: "jobLimit",
      type: "number",
      description: "Max jobs to include when 'jobs' section is requested. Default 20.",
      required: false,
      defaultValue: 20,
    },
  },
  output: "Workspace snapshot object keyed by requested sections.",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async (args, context) => {
    const requested = Array.isArray(args.sections) && (args.sections as unknown[]).length > 0
      ? (args.sections as string[]).filter((s): s is WorkspaceQuerySection =>
          (ALL_SECTIONS as string[]).includes(s),
        )
      : ALL_SECTIONS;
    const want = (s: WorkspaceQuerySection) => requested.includes(s);

    const agents = context.workspace.getAgents?.() ?? context.workspace.agents;
    const channels = context.workspace.getChannels?.() ?? context.workspace.channels;
    const groups = context.workspace.getGroups?.() ?? context.workspace.groups;
    const messages = context.workspace.getMessages?.() ?? context.workspace.messages;
    const queue = context.jobs.getQueue();
    const catalog = context.jobs.getCatalog();
    const artifacts = context.jobs.allArtifacts ?? [];
    const networks = context.ecosystem?.networks ?? [];
    const bridges = context.ecosystem?.bridges ?? [];
    const activeNetworkId = context.ecosystem?.activeNetworkId ?? null;

    const messageLimit = Number(args.messageLimit ?? 20) || 20;
    const jobLimit = Number(args.jobLimit ?? 20) || 20;

    const result: Record<string, unknown> = {};

    if (want("summary")) {
      const libp2pNodes = safeSnapshot(() => libp2pService.snapshot())?.nodes ?? [];
      const heliaNodes = safeSnapshot(() => heliaService.snapshot())?.nodes ?? [];
      const kuboNodes = safeSnapshot(() => kuboService.snapshot())?.nodes ?? [];
      const orbitdbNodes = safeSnapshot(() => orbitdbService.snapshot())?.nodes ?? [];
      const orbitdbServerNodes = safeSnapshot(() => orbitdbServerService.snapshot())?.nodes ?? [];
      const orchestratorNodes = safeSnapshot(() => orchestratorService.snapshot())?.nodes ?? [];
      result.summary = {
        agentCount: agents.length,
        channelCount: channels.length,
        groupCount: groups.length,
        messageCount: messages.length,
        queueDepth: queue.length,
        runningJobs: queue.filter((j) => j.status === "running").length,
        awaitingInputJobs: queue.filter((j) => j.status === "awaiting-input").length,
        failedJobs: queue.filter((j) => j.status === "failed").length,
        catalogCount: catalog.length,
        artifactCount: artifacts.length,
        networkCount: networks.length,
        bridgeCount: bridges.length,
        toolkitCount: TOOLKITS.length,
        queuePaused: context.jobs.isPaused,
        activeChannel: context.workspace.activeChannel ?? null,
        activeNetworkId,
        stack: {
          libp2pNodes: libp2pNodes.length,
          libp2pRunning: libp2pNodes.filter((n) => n.status === "running").length,
          heliaNodes: heliaNodes.length,
          heliaRunning: heliaNodes.filter((n) => n.status === "running").length,
          kuboNodes: kuboNodes.length,
          kuboConnected: kuboNodes.filter((n) => n.status === "connected").length,
          orbitdbNodes: orbitdbNodes.length,
          orbitdbRunning: orbitdbNodes.filter((n) => n.status === "running").length,
          orbitdbServerNodes: orbitdbServerNodes.length,
          orbitdbServerConnected: orbitdbServerNodes.filter((n) => n.status === "connected").length,
        },
        orchestrator: {
          stackCount: orchestratorNodes.length,
          healthy: orchestratorNodes.filter((n) => n.status === "healthy").length,
          drifted: orchestratorNodes.filter((n) => n.status === "drifted" || n.status === "error").length,
          pendingDrift: orchestratorNodes.reduce((sum, n) => sum + (n.pendingDrift ?? 0), 0),
        },
      };
    }

    if (want("agents")) {
      result.agents = {
        count: agents.length,
        byRole: countBy(agents, (a) => a.role),
        byStatus: countBy(agents, (a) => a.runtimeStatus ?? a.status),
        items: agents.map((a) => ({
          id: a.id,
          name: a.name,
          role: a.role,
          status: a.status,
          runtimeStatus: a.runtimeStatus,
          networkId: a.networkId,
          toolkitCount: a.toolkits?.length ?? 0,
          lastActivityAt: a.lastActivityAt,
        })),
      };
    }

    if (want("channels")) {
      result.channels = {
        count: channels.length,
        items: channels.map((c) => ({
          id: c.id,
          from: c.from,
          to: c.to,
          type: c.type,
          mode: c.mode,
          networkId: c.networkId,
        })),
      };
    }

    if (want("groups")) {
      result.groups = {
        count: groups.length,
        items: groups.map((g) => ({
          id: g.id,
          name: g.name,
          memberCount: (g as { members?: unknown[] }).members?.length ?? 0,
        })),
      };
    }

    if (want("messages")) {
      const recent = messages.slice(-messageLimit);
      result.messages = {
        total: messages.length,
        returned: recent.length,
        items: recent,
      };
    }

    if (want("jobs")) {
      const recent = queue.slice(-jobLimit);
      result.jobs = {
        queueDepth: queue.length,
        paused: context.jobs.isPaused,
        byStatus: countBy(queue, (j) => j.status),
        byType: countBy(queue, (j) => j.type),
        recent: recent.map((j) => ({
          id: j.id,
          type: j.type,
          status: j.status,
          createdAt: j.createdAt,
          completedAt: (j as { completedAt?: number }).completedAt,
        })),
        catalogCount: catalog.length,
        catalog: catalog.map((d) => ({ id: d.id, name: d.name, mode: d.mode })),
      };
    }

    if (want("ecosystem")) {
      result.ecosystem = {
        activeNetworkId,
        networkCount: networks.length,
        bridgeCount: bridges.length,
        networks: networks.map((n) => ({
          id: n.id,
          name: n.name,
          memberCount: (n as { members?: unknown[] }).members?.length ?? 0,
        })),
        bridges: bridges.map((b) => ({
          id: b.id,
          fromNetworkId: b.fromNetworkId,
          toNetworkId: b.toNetworkId,
          fromAgentId: b.fromAgentId,
          toAgentId: b.toAgentId,
        })),
      };
    }

    if (want("artifacts")) {
      result.artifacts = {
        count: artifacts.length,
        byType: countBy(artifacts, (a) => (a as { type?: string }).type),
        items: artifacts.slice(-jobLimit).map((a) => ({
          id: a.id,
          name: (a as { name?: string }).name,
          type: (a as { type?: string }).type,
          jobId: (a as { jobId?: string }).jobId,
        })),
      };
    }

    if (want("toolkits")) {
      result.toolkits = {
        count: TOOLKITS.length,
        byCategory: countBy(TOOLKITS, (tk) => tk.category),
        byStatus: countBy(TOOLKITS, (tk) => tk.status),
      };
    }

    if (want("stack")) {
      const libp2pSnap = safeSnapshot(() => libp2pService.snapshot());
      const heliaSnap = safeSnapshot(() => heliaService.snapshot());
      const kuboSnap = safeSnapshot(() => kuboService.snapshot());
      const orbitdbSnap = safeSnapshot(() => orbitdbService.snapshot());
      const orbitdbServerSnap = safeSnapshot(() => orbitdbServerService.snapshot());

      const libp2pNodes = (libp2pSnap?.nodes ?? []) as Array<{
        nodeId: string; label: string; status: string; peerId: string | null;
        listenAddrs?: string[]; multiaddrs?: string[];
        peers?: unknown[]; topics?: string[];
      }>;
      const heliaNodes = (heliaSnap?.nodes ?? []) as Array<{
        nodeId: string; label: string; status: string; peerId: string | null;
        libp2pNodeId: string | null; entries?: unknown[];
      }>;
      const kuboNodes = (kuboSnap?.nodes ?? []) as Array<{
        nodeId: string; label: string; status: string; endpoint: string;
        peer?: { id?: string } | null; entries?: unknown[]; pinnedCount?: number; totalBytes?: number;
      }>;
      const orbitdbNodes = (orbitdbSnap?.nodes ?? []) as Array<{
        nodeId: string; label: string; status: string; peerId: string | null;
        heliaNodeId: string | null; identityId: string | null;
        databases?: Array<{ address: string; name: string; type: string }>;
      }>;
      const orbitdbServerNodes = (orbitdbServerSnap?.nodes ?? []) as Array<{
        nodeId: string; label: string; status: string; endpoint: string;
        peer?: { id?: string } | null;
        databases?: Array<{ address?: string; name?: string; type?: string }>;
        swarmPeers?: unknown[];
      }>;

      result.stack = {
        libp2p: {
          activeId: libp2pSnap?.activeId ?? null,
          count: libp2pNodes.length,
          running: libp2pNodes.filter((n) => n.status === "running").length,
          byStatus: countBy(libp2pNodes, (n) => n.status),
          nodes: libp2pNodes.map((n) => ({
            id: n.nodeId,
            label: n.label,
            status: n.status,
            peerId: n.peerId,
            multiaddrCount: n.multiaddrs?.length ?? 0,
            listenAddrCount: n.listenAddrs?.length ?? 0,
            peerCount: n.peers?.length ?? 0,
            topicCount: n.topics?.length ?? 0,
          })),
        },
        helia: {
          activeId: heliaSnap?.activeId ?? null,
          count: heliaNodes.length,
          running: heliaNodes.filter((n) => n.status === "running").length,
          byStatus: countBy(heliaNodes, (n) => n.status),
          nodes: heliaNodes.map((n) => ({
            id: n.nodeId,
            label: n.label,
            status: n.status,
            peerId: n.peerId,
            libp2pNodeId: n.libp2pNodeId,
            entryCount: n.entries?.length ?? 0,
          })),
        },
        kubo: {
          activeId: kuboSnap?.activeId ?? null,
          count: kuboNodes.length,
          connected: kuboNodes.filter((n) => n.status === "connected").length,
          byStatus: countBy(kuboNodes, (n) => n.status),
          nodes: kuboNodes.map((n) => ({
            id: n.nodeId,
            label: n.label,
            status: n.status,
            endpoint: n.endpoint,
            peerId: n.peer?.id ?? null,
            entryCount: n.entries?.length ?? 0,
            pinnedCount: n.pinnedCount ?? 0,
            totalBytes: n.totalBytes ?? 0,
          })),
        },
        orbitdb: {
          activeId: orbitdbSnap?.activeId ?? null,
          count: orbitdbNodes.length,
          running: orbitdbNodes.filter((n) => n.status === "running").length,
          byStatus: countBy(orbitdbNodes, (n) => n.status),
          nodes: orbitdbNodes.map((n) => ({
            id: n.nodeId,
            label: n.label,
            status: n.status,
            peerId: n.peerId,
            heliaNodeId: n.heliaNodeId,
            identityId: n.identityId,
            databaseCount: n.databases?.length ?? 0,
            databases: (n.databases ?? []).map((d) => ({
              address: d.address,
              name: d.name,
              type: d.type,
            })),
          })),
        },
        orbitdbServer: {
          activeId: orbitdbServerSnap?.activeId ?? null,
          count: orbitdbServerNodes.length,
          connected: orbitdbServerNodes.filter((n) => n.status === "connected").length,
          byStatus: countBy(orbitdbServerNodes, (n) => n.status),
          nodes: orbitdbServerNodes.map((n) => ({
            id: n.nodeId,
            label: n.label,
            status: n.status,
            endpoint: n.endpoint,
            peerId: n.peer?.id ?? null,
            databaseCount: n.databases?.length ?? 0,
            swarmPeerCount: n.swarmPeers?.length ?? 0,
            databases: (n.databases ?? []).map((d) => ({
              address: d.address,
              name: d.name,
              type: d.type,
            })),
          })),
        },
      };
    }

    if (want("orchestrator")) {
      const orchSnap = safeSnapshot(() => orchestratorService.snapshot());
      const orchNodes = (orchSnap?.nodes ?? []) as Array<{
        nodeId: string; label: string; status: string;
        manifestArtifactId: string | null;
        manifestName?: string; manifestVersion?: string;
        error?: string;
        lastAppliedAt?: string; lastReconcileAt?: string;
        pendingDrift: number;
        results: Array<{
          target: string; specId: string; runtimeNodeId?: string;
          action: string; ok: boolean; error?: string; at: string;
        }>;
      }>;
      result.orchestrator = {
        activeId: orchSnap?.activeId ?? null,
        count: orchNodes.length,
        byStatus: countBy(orchNodes, (n) => n.status),
        healthy: orchNodes.filter((n) => n.status === "healthy").length,
        drifted: orchNodes.filter((n) => n.status === "drifted" || n.status === "error").length,
        pendingDrift: orchNodes.reduce((sum, n) => sum + (n.pendingDrift ?? 0), 0),
        stacks: orchNodes.map((n) => ({
          id: n.nodeId,
          label: n.label,
          status: n.status,
          manifestArtifactId: n.manifestArtifactId,
          manifestName: n.manifestName,
          manifestVersion: n.manifestVersion,
          error: n.error,
          lastAppliedAt: n.lastAppliedAt,
          lastReconcileAt: n.lastReconcileAt,
          pendingDrift: n.pendingDrift,
          resultCount: n.results.length,
          failedResults: n.results.filter((r) => !r.ok).length,
          recentResults: n.results.slice(0, 10).map((r) => ({
            target: r.target,
            specId: r.specId,
            runtimeNodeId: r.runtimeNodeId,
            action: r.action,
            ok: r.ok,
            error: r.error,
            at: r.at,
          })),
        })),
      };
    }

    return result;
  },
};

/** Convenience export — the meta commands as an array. */
export const metaCommands: CommandDefinition[] = [
  createJobCommand,
  listAvailableCommandsCommand,
  getCommandSchemaCommand,
  listToolkitsCommand,
  queryWorkspaceCommand,
];
