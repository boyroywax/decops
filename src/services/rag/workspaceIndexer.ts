import type { WorkspaceContext } from "@/services/ai/prompts";
import { TOOLKITS } from "@/services/toolkits";
import { registry as commandRegistry } from "@/services/commands/registry";
import { embedText } from "./embeddings";
import { ragVectorStore, type RagVectorRecord } from "./vectorStore";
import { getWorkspaceRagPolicy } from "./policy";
import { navigatorService } from "@/toolkits/navigator/service";

export interface RagDocument {
  id: string;
  workspaceId: string;
  entityType: string;
  entityId: string;
  tags: string[];
  text: string;
  updatedAt: string;
}

export interface WorkspaceIndexStatus {
  workspaceId: string;
  indexed: boolean;
  upToDate: boolean;
  dirty: boolean;
  lastIndexedAt: number | null;
  stalenessMs: number | null;
  estimatedDocuments: number;
}

const fingerprintByWorkspace = new Map<string, string>();
const dirtyByWorkspace = new Map<string, boolean>();
const lastIndexedAtByWorkspace = new Map<string, number>();
const lastMessageCountByWorkspace = new Map<string, number>();
const pendingTimerByWorkspace = new Map<string, ReturnType<typeof setTimeout>>();
const pendingContextByWorkspace = new Map<string, WorkspaceContext>();
const inFlightIndexByWorkspace = new Map<string, Promise<void>>();
let navigatorSubscriptionInstalled = false;

function normalizeWorkspaceId(workspaceId?: string | null): string {
  return workspaceId || "default-workspace";
}

function buildSummaryDoc(ctx: WorkspaceContext, workspaceId: string, timestamp: string): RagDocument {
  const agentNames = ctx.agents.slice(0, 30).map((a) => a.name).join(", ");
  const groupNames = ctx.groups.slice(0, 20).map((g) => g.name).join(", ");
  const networkNames = ctx.networks.slice(0, 20).map((n) => n.name).join(", ");
  const toolkitNames = TOOLKITS.slice(0, 30).map((t) => t.name).join(", ");
  const commandCount = commandRegistry.getAll().filter((c) => !c.hidden).length;

  return {
    id: `ws:${workspaceId}:summary`,
    workspaceId,
    entityType: "workspace_summary",
    entityId: workspaceId,
    tags: ["workspace", "summary"],
    updatedAt: timestamp,
    text: [
      `Workspace summary for ${workspaceId}.`,
      `Agents: ${ctx.agents.length}. Agent names: ${agentNames || "none"}.`,
      `Channels: ${ctx.channels.length}. Groups: ${ctx.groups.length}.`,
      `Networks: ${ctx.networks.length}. Bridges: ${ctx.bridges.length}.`,
      `Recent jobs: ${ctx.jobs.slice(-5).map((j) => `${j.type}:${j.status}`).join(", ") || "none"}.`,
      `Toolkits: ${TOOLKITS.length}. Toolkit names: ${toolkitNames || "none"}.`,
      `Available commands: ${commandCount}.`,
      `Bridges: ${ctx.bridges.length}.`,
      `Group names: ${groupNames || "none"}. Network names: ${networkNames || "none"}.`,
    ].join("\n"),
  };
}

function asUuidAlias(id: string): string {
  return id;
}

function buildEcosystemTopologyDoc(ctx: WorkspaceContext, workspaceId: string, timestamp: string): RagDocument {
  const networkById = new Map(ctx.networks.map((n) => [n.id, n]));
  const agentById = new Map(ctx.agents.map((a) => [a.id, a]));

  const bridgeLines = ctx.bridges.length > 0
    ? ctx.bridges.map((b) => {
      const fromNet = networkById.get(b.fromNetworkId);
      const toNet = networkById.get(b.toNetworkId);
      const fromAgent = agentById.get(b.fromAgentId);
      const toAgent = agentById.get(b.toAgentId);
      return `Bridge ${b.id} (uuid ${asUuidAlias(b.id)}): ${fromNet?.name || b.fromNetworkId}(${b.fromNetworkId})/${fromAgent?.name || b.fromAgentId}(${b.fromAgentId}) -> ${toNet?.name || b.toNetworkId}(${b.toNetworkId})/${toAgent?.name || b.toAgentId}(${b.toAgentId}), type=${b.type}, offset=${b.offset}.`;
    }).join("\n")
    : "No bridges.";

  const networkLines = ctx.networks.length > 0
    ? ctx.networks.map((n) => `Network ${n.name} id=${n.id} uuid=${asUuidAlias(n.id)} did=${n.did}. nestedAgents=${n.agents.length}, nestedChannels=${n.channels.length}, nestedGroups=${n.groups.length}, nestedMessages=${n.messages.length}.`)
    : ["No networks."];

  return {
    id: `ws:${workspaceId}:ecosystem:topology`,
    workspaceId,
    entityType: "ecosystem_topology",
    entityId: workspaceId,
    tags: ["ecosystem", "topology", "bridge", "network", "uuid", "id"],
    updatedAt: timestamp,
    text: [
      `Ecosystem topology for workspace ${workspaceId}.`,
      `Networks (${ctx.networks.length}):`,
      ...networkLines,
      `Bridges (${ctx.bridges.length}):`,
      bridgeLines,
    ].join("\n"),
  };
}

function buildIdentityLookupDocs(ctx: WorkspaceContext, workspaceId: string, timestamp: string): RagDocument[] {
  const docs: RagDocument[] = [];
  const networkById = new Map(ctx.networks.map((n) => [n.id, n]));
  const agentById = new Map(ctx.agents.map((a) => [a.id, a]));

  for (const a of ctx.agents) {
    docs.push({
      id: `ws:${workspaceId}:lookup:agent:${a.id}`,
      workspaceId,
      entityType: "identity_lookup",
      entityId: `agent:${a.id}`,
      tags: ["lookup", "agent", "id", "uuid", "did"],
      updatedAt: timestamp,
      text: `Lookup agent: name=${a.name}; id=${a.id}; uuid=${asUuidAlias(a.id)}; did=${a.did}; role=${a.role}; networkId=${a.networkId || "none"}.`,
    });
  }

  for (const n of ctx.networks) {
    docs.push({
      id: `ws:${workspaceId}:lookup:network:${n.id}`,
      workspaceId,
      entityType: "identity_lookup",
      entityId: `network:${n.id}`,
      tags: ["lookup", "network", "id", "uuid", "did"],
      updatedAt: timestamp,
      text: `Lookup network: name=${n.name}; id=${n.id}; uuid=${asUuidAlias(n.id)}; did=${n.did}; agentCount=${n.agents.length}; channelCount=${n.channels.length}; groupCount=${n.groups.length}.`,
    });
  }

  for (const g of ctx.groups) {
    docs.push({
      id: `ws:${workspaceId}:lookup:group:${g.id}`,
      workspaceId,
      entityType: "identity_lookup",
      entityId: `group:${g.id}`,
      tags: ["lookup", "group", "id", "uuid", "did"],
      updatedAt: timestamp,
      text: `Lookup group: name=${g.name}; id=${g.id}; uuid=${asUuidAlias(g.id)}; did=${g.did}; governance=${g.governance}; networkId=${g.networkId || "none"}; networkIds=${(g.networkIds || []).join(", ") || "none"}; members=${g.members.join(", ") || "none"}.`,
    });
  }

  for (const c of ctx.channels) {
    const from = agentById.get(c.from);
    const to = agentById.get(c.to);
    const net = networkById.get(c.networkId || "");
    docs.push({
      id: `ws:${workspaceId}:lookup:channel:${c.id}`,
      workspaceId,
      entityType: "identity_lookup",
      entityId: `channel:${c.id}`,
      tags: ["lookup", "channel", "id", "uuid", "endpoint"],
      updatedAt: timestamp,
      text: `Lookup channel: id=${c.id}; uuid=${asUuidAlias(c.id)}; type=${c.type}; mode=${c.mode || "n/a"}; fromId=${c.from}; fromName=${from?.name || "unknown"}; toId=${c.to}; toName=${to?.name || "unknown"}; networkId=${c.networkId || "none"}; networkName=${net?.name || "unknown"}.`,
    });
  }

  for (const b of ctx.bridges) {
    const fromNet = networkById.get(b.fromNetworkId);
    const toNet = networkById.get(b.toNetworkId);
    const fromAgent = agentById.get(b.fromAgentId);
    const toAgent = agentById.get(b.toAgentId);
    docs.push({
      id: `ws:${workspaceId}:lookup:bridge:${b.id}`,
      workspaceId,
      entityType: "identity_lookup",
      entityId: `bridge:${b.id}`,
      tags: ["lookup", "bridge", "id", "uuid", "network", "agent"],
      updatedAt: timestamp,
      text: `Lookup bridge: id=${b.id}; uuid=${asUuidAlias(b.id)}; fromNetworkId=${b.fromNetworkId}; fromNetworkName=${fromNet?.name || "unknown"}; toNetworkId=${b.toNetworkId}; toNetworkName=${toNet?.name || "unknown"}; fromAgentId=${b.fromAgentId}; fromAgentName=${fromAgent?.name || "unknown"}; toAgentId=${b.toAgentId}; toAgentName=${toAgent?.name || "unknown"}; type=${b.type}; offset=${b.offset}.`,
    });
  }

  return docs;
}

function summarizeArgType(type: string): string {
  return type || "unknown";
}

function buildToolkitAndCommandDocs(workspaceId: string, timestamp: string): RagDocument[] {
  const docs: RagDocument[] = [];
  const commands = commandRegistry.getAll().filter((c) => !c.hidden);

  for (const tk of TOOLKITS) {
    const toolkitCommands = tk.commands
      .map((id) => commands.find((c) => c.id === id))
      .filter((c): c is NonNullable<typeof c> => !!c);

    docs.push({
      id: `ws:${workspaceId}:toolkit:${tk.id}`,
      workspaceId,
      entityType: "toolkit",
      entityId: tk.id,
      tags: ["toolkit", tk.category || "general", tk.status || "unknown"],
      updatedAt: timestamp,
      text: [
        `Toolkit ${tk.name} (${tk.id}).`,
        `Category: ${tk.category || "unknown"}. Status: ${tk.status || "unknown"}.`,
        `Description: ${tk.description || "none"}.`,
        `Commands (${tk.commands.length}): ${tk.commands.join(", ") || "none"}.`,
        `Command summaries: ${toolkitCommands.map((c) => `${c.id} - ${c.description}`).join(" | ") || "none"}.`,
      ].join("\n"),
    });
  }

  for (const cmd of commands) {
    const argsSummary = Object.values(cmd.args)
      .map((arg) => `${arg.name}:${summarizeArgType(arg.type)}${arg.required === false ? " (optional)" : ""}`)
      .join(", ");
    const toolkitIds = TOOLKITS.filter((tk) => tk.commands.includes(cmd.id)).map((tk) => tk.id);

    docs.push({
      id: `ws:${workspaceId}:command:${cmd.id}`,
      workspaceId,
      entityType: "command",
      entityId: cmd.id,
      tags: ["command", ...(cmd.tags || [])],
      updatedAt: timestamp,
      text: [
        `Command ${cmd.id}.`,
        `Description: ${cmd.description}.`,
        `Toolkits: ${toolkitIds.join(", ") || "none"}.`,
        `Tags: ${(cmd.tags || []).join(", ") || "none"}.`,
        `Output: ${cmd.output || "none"}.`,
        `Arguments: ${argsSummary || "none"}.`,
      ].join("\n"),
    });
  }

  return docs;
}

function buildNavigatorDocs(workspaceId: string, timestamp: string): RagDocument[] {
  const docs: RagDocument[] = [];
  try {
    const snap = navigatorService.snapshot();
    if (snap.goals.length === 0 && snap.huddles.length === 0) return docs;

    // Summary doc for active goal
    const active = snap.activeGoalId
      ? snap.goals.find((g) => g.id === snap.activeGoalId)
      : undefined;

    docs.push({
      id: `ws:${workspaceId}:navigator:summary`,
      workspaceId,
      entityType: "navigator_state",
      entityId: "navigator_state",
      tags: ["navigator", "goals", "huddles", "active"],
      updatedAt: timestamp,
      text: [
        `Navigator state. Active goal: ${active ? `${active.title} (${active.id}, ${active.status})` : "none"}.`,
        `Total goals: ${snap.goals.length}. Total huddles: ${snap.huddles.length}.`,
        snap.goals.slice(0, 10).map((g) =>
          `Goal "${g.title}" id=${g.id} status=${g.status} subgoals=${g.subgoals.length} networks=${g.networkIds?.join(",") || "any"}.`
        ).join("\n"),
      ].join("\n"),
    });

    // Per-goal docs
    for (const g of snap.goals.slice(0, 20)) {
      const subgoalLines = g.subgoals.slice(0, 10).map((s) =>
        `  sub[${s.id}] "${s.title}" status=${s.status} agent=${s.assignedAgentId || "none"} huddle=${s.huddleId || "none"} jobs=${s.jobIds.join(",") || "none"}.`
      ).join("\n");
      docs.push({
        id: `ws:${workspaceId}:navigator:goal:${g.id}`,
        workspaceId,
        entityType: "navigator_goal",
        entityId: `goal:${g.id}`,
        tags: ["navigator", "goal", g.status, ...(g.id === snap.activeGoalId ? ["active"] : [])],
        updatedAt: timestamp,
        text: [
          `Navigator goal "${g.title}" (${g.id}).`,
          `Status: ${g.status}. Networks: ${g.networkIds?.join(", ") || "any"}.`,
          `Prompt: ${g.prompt.slice(0, 300)}.`,
          `Subgoals (${g.subgoals.length}):`,
          subgoalLines || "  (none)",
          ...(g.error ? [`Error: ${g.error}.`] : []),
        ].join("\n"),
      });
    }

    // Per-huddle docs
    for (const h of snap.huddles.slice(0, 20)) {
      docs.push({
        id: `ws:${workspaceId}:navigator:huddle:${h.id}`,
        workspaceId,
        entityType: "navigator_huddle",
        entityId: `huddle:${h.id}`,
        tags: ["navigator", "huddle", h.status ?? "open"],
        updatedAt: timestamp,
        text: [
          `Navigator huddle ${h.id}.`,
          `Status: ${h.status}. GoalId: ${h.goalId}. SubgoalId: ${h.subgoalId}.`,
          `Members: ${h.members.join(", ") || "none"}.`,
          `NetworkIds: ${h.networkIds.join(", ") || "none"}.`,
          `PTHID: ${h.pthid}. THID: ${h.thid}.`,
          `GroupId (created huddle group): ${h.groupId}.`,
          ...(h.decision ? [`Decision: ${h.decision}.`] : []),
        ].join("\n"),
      });
    }
  } catch {
    // Navigator not available — skip silently
  }
  return docs;
}

function buildDocs(ctx: WorkspaceContext, workspaceId?: string | null): RagDocument[] {
  const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const timestamp = new Date().toISOString();
  const docs: RagDocument[] = [
    buildSummaryDoc(ctx, resolvedWorkspaceId, timestamp),
    buildEcosystemTopologyDoc(ctx, resolvedWorkspaceId, timestamp),
    ...buildIdentityLookupDocs(ctx, resolvedWorkspaceId, timestamp),
    ...buildToolkitAndCommandDocs(resolvedWorkspaceId, timestamp),
    ...buildNavigatorDocs(resolvedWorkspaceId, timestamp),
  ];

  for (const a of ctx.agents) {
    const toolkitIds = (a.toolkits ?? []).map((b) => b.toolkitId).join(", ") || "none";
    const autonomyLevel = (a as any).autonomyConfig?.level ?? (a as any).autonomyConfig?.mode ?? "none";
    const endpointType = (a as any).endpoint?.type ?? "none";
    docs.push({
      id: `ws:${resolvedWorkspaceId}:agent:${a.id}`,
      workspaceId: resolvedWorkspaceId,
      entityType: "agent",
      entityId: a.id,
      tags: ["agent", a.role, ...(a.isDarkAgent ? ["dark"] : [])],
      updatedAt: timestamp,
      text: [
        `Agent ${a.name} (${a.id}).`,
        `Role: ${a.role}. Title: ${a.title || "none"}.`,
        `Network: ${a.networkId || "none"}. DID: ${a.did || "none"}.`,
        `RuntimeStatus: ${(a as any).runtimeStatus || "unknown"}. Endpoint: ${endpointType}. Dark: ${a.isDarkAgent ? "yes" : "no"}.`,
        `RecommendedModel: ${a.recommendedModel || "none"}. AutonomyLevel: ${autonomyLevel}.`,
        `Toolkits: ${toolkitIds}.`,
        `LastActive: ${a.lastActivityAt || "unknown"}. ActiveSince: ${a.activeSince || "unknown"}.`,
        `Prompt: ${a.prompt || "none"}.`,
      ].join("\n"),
    });
  }

  for (const c of ctx.channels) {
    docs.push({
      id: `ws:${resolvedWorkspaceId}:channel:${c.id}`,
      workspaceId: resolvedWorkspaceId,
      entityType: "channel",
      entityId: c.id,
      tags: ["channel", c.type],
      updatedAt: timestamp,
      text: [
        `Channel ${c.id}.`,
        `Type: ${c.type}. Mode: ${c.mode || "n/a"}.`,
        `From: ${c.from}. To: ${c.to}. Network: ${c.networkId || "none"}.`,
      ].join("\n"),
    });
  }

  for (const g of ctx.groups) {
    const kind = g.kind ?? "native";
    const allNetworkIds = g.networkIds?.length
      ? g.networkIds.join(", ")
      : (g.networkId || "none");
    const kindTags: string[] = kind === "huddle" ? ["huddle"] : [];
    docs.push({
      id: `ws:${resolvedWorkspaceId}:group:${g.id}`,
      workspaceId: resolvedWorkspaceId,
      entityType: "group",
      entityId: g.id,
      tags: ["group", g.governance, ...kindTags],
      updatedAt: timestamp,
      text: [
        `Group ${g.name} (${g.id}).`,
        `Kind: ${kind}. Governance: ${g.governance}. Threshold: ${g.threshold}.`,
        `Members: ${g.members.join(", ") || "none"}.`,
        `NetworkId: ${g.networkId || "none"}. NetworkIds: ${allNetworkIds}.`,
        ...(kind === "huddle" ? [
          `SummonedBy: ${g.summonedBy || "unknown"}. Topic: ${g.topic || "none"}.`,
        ] : []),
        ...(g.modelId ? [`ModelOverride: ${g.modelId}.`] : []),
      ].join("\n"),
    });
  }

  for (const n of ctx.networks) {
    docs.push({
      id: `ws:${resolvedWorkspaceId}:network:${n.id}`,
      workspaceId: resolvedWorkspaceId,
      entityType: "network",
      entityId: n.id,
      tags: ["network"],
      updatedAt: timestamp,
      text: [
        `Network ${n.name} (${n.id}).`,
        `UUID/ID: ${n.id}. DID: ${n.did || "none"}.`,
        `Description: ${n.description || "none"}.`,
        `Agents in network: ${n.agents.length} (ids: ${n.agents.slice(0, 10).map((a) => a.id).join(", ") || "none"}).`,
        `Channels in network: ${n.channels.length}. Groups in network: ${n.groups.length}.`,
      ].join("\n"),
    });
  }

  for (const b of ctx.bridges) {
    docs.push({
      id: `ws:${resolvedWorkspaceId}:bridge:${b.id}`,
      workspaceId: resolvedWorkspaceId,
      entityType: "bridge",
      entityId: b.id,
      tags: ["bridge", b.type, "uuid", "id"],
      updatedAt: timestamp,
      text: [
        `Bridge ${b.id}.`,
        `UUID/ID: ${b.id}. Type: ${b.type}. Offset: ${b.offset}.`,
        `From network: ${b.fromNetworkId}. To network: ${b.toNetworkId}.`,
        `From agent: ${b.fromAgentId}. To agent: ${b.toAgentId}.`,
      ].join("\n"),
    });
  }

  const recentMessages = ctx.messages.slice(-60);
  for (let i = 0; i < recentMessages.length; i += 10) {
    const chunk = recentMessages.slice(i, i + 10);
    if (chunk.length === 0) continue;
    docs.push({
      id: `ws:${resolvedWorkspaceId}:messages:${i}`,
      workspaceId: resolvedWorkspaceId,
      entityType: "message_window",
      entityId: `${i}`,
      tags: ["messages", "recent"],
      updatedAt: timestamp,
      text: chunk
        .map((m) => `from ${m.fromId} to ${m.toId}: ${m.content}`)
        .join("\n"),
    });
  }

  for (const j of ctx.jobs.slice(-30)) {
    const stepSummary = (j.steps ?? []).slice(0, 8)
      .map((s) => `${s.commandId}(${s.status ?? "pending"})`)
      .join(", ") || "none";
    docs.push({
      id: `ws:${resolvedWorkspaceId}:job:${j.id}`,
      workspaceId: resolvedWorkspaceId,
      entityType: "job",
      entityId: j.id,
      tags: ["job", j.status, j.type],
      updatedAt: timestamp,
      text: [
        `Job ${j.id}. Type: ${j.type}. Status: ${j.status}.`,
        `Description: ${j.request?.description || "none"}.`,
        `Step count: ${j.steps?.length || 0}. Steps: ${stepSummary}.`,
      ].join("\n"),
    });
  }

  return docs;
}

function buildFingerprint(ctx: WorkspaceContext, workspaceId?: string | null): string {
  const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const lastMsg = ctx.messages.length > 0 ? ctx.messages[ctx.messages.length - 1] : null;
  const lastJob = ctx.jobs.length > 0 ? ctx.jobs[ctx.jobs.length - 1] : null;

  const digest = (parts: string[], limit = 80): string =>
    parts.slice(0, limit).sort().join("|");

  const agentDigest = digest(
    ctx.agents.map((a) => `${a.id}:${a.did || "-"}:${a.networkId || "-"}:${a.lastActivityAt || "-"}`),
    120,
  );
  const channelDigest = digest(
    ctx.channels.map((c) => `${c.id}:${c.from}:${c.to}:${c.type}:${c.networkId || "-"}:${c.mode || "-"}`),
    120,
  );
  const groupDigest = digest(
    ctx.groups.map((g) => `${g.id}:${g.did || "-"}:${g.networkId || "-"}:${(g.networkIds || []).join(",")}:${g.members.join(",")}`),
    120,
  );
  const networkDigest = digest(
    ctx.networks.map((n) => `${n.id}:${n.did || "-"}:${n.name}`),
    120,
  );
  const bridgeDigest = digest(
    ctx.bridges.map((b) => `${b.id}:${b.fromNetworkId}:${b.toNetworkId}:${b.fromAgentId}:${b.toAgentId}:${b.type}`),
    120,
  );

  let navFingerprint = "nav:0:0";
  try {
    const navSnap = navigatorService.snapshot();
    const goalDigest = navSnap.goals
      .slice(0, 30)
      .map((g) => {
        const subDigest = g.subgoals
          .slice(0, 20)
          .map((s) => `${s.id}:${s.status}:${s.updatedAt}`)
          .join(",");
        return `${g.id}:${g.status}:${g.updatedAt}:${subDigest}`;
      })
      .join("|");
    const huddleDigest = navSnap.huddles
      .slice(0, 30)
      .map((h) => `${h.id}:${h.status}:${h.updatedAt}:${h.goalId}:${h.subgoalId}`)
      .join("|");
    navFingerprint = `nav:${navSnap.goals.length}:${navSnap.huddles.length}:${navSnap.activeGoalId || "-"}:${goalDigest}:${huddleDigest}`;
  } catch { /* navigator not available */ }

  return [
    resolvedWorkspaceId,
    `a:${ctx.agents.length}`,
    `ad:${agentDigest}`,
    `c:${ctx.channels.length}`,
    `cd:${channelDigest}`,
    `g:${ctx.groups.length}`,
    `gd:${groupDigest}`,
    `m:${ctx.messages.length}:${lastMsg?.id || "-"}`,
    `n:${ctx.networks.length}`,
    `nd:${networkDigest}`,
    `b:${ctx.bridges.length}`,
    `bd:${bridgeDigest}`,
    `j:${ctx.jobs.length}:${lastJob?.id || "-"}:${lastJob?.status || "-"}`,
    `tk:${TOOLKITS.length}`,
    `cmd:${commandRegistry.getAll().filter((c) => !c.hidden).length}`,
    navFingerprint,
  ].join("|");
}

export function getWorkspaceIndexStatus(ctx: WorkspaceContext): WorkspaceIndexStatus {
  ensureNavigatorIndexSync();
  const workspaceId = normalizeWorkspaceId(ctx.workspaceId);
  const expected = buildFingerprint(ctx, workspaceId);
  const current = fingerprintByWorkspace.get(workspaceId);
  const lastIndexedAt = lastIndexedAtByWorkspace.get(workspaceId) ?? null;
  const stalenessMs = lastIndexedAt ? Math.max(0, Date.now() - lastIndexedAt) : null;
  const estimatedDocuments = buildDocs(ctx, workspaceId).length;
  return {
    workspaceId,
    indexed: typeof current === "string",
    upToDate: current === expected,
    dirty: dirtyByWorkspace.get(workspaceId) === true,
    lastIndexedAt,
    stalenessMs,
    estimatedDocuments,
  };
}

export async function ensureWorkspaceIndexed(ctx: WorkspaceContext): Promise<void> {
  const workspaceId = normalizeWorkspaceId(ctx.workspaceId);
  const existingRun = inFlightIndexByWorkspace.get(workspaceId);
  if (existingRun) {
    await existingRun;
    return;
  }

  const run = (async () => {
    const nextFingerprint = buildFingerprint(ctx, workspaceId);
    if (fingerprintByWorkspace.get(workspaceId) === nextFingerprint) {
      dirtyByWorkspace.set(workspaceId, false);
      return;
    }

    const docs = buildDocs(ctx, workspaceId);
    const rows: RagVectorRecord[] = await Promise.all(
      docs.map(async (doc) => ({
        ...doc,
        embedding: await embedText(doc.text),
      })),
    );

    await ragVectorStore.upsertMany(rows);
    fingerprintByWorkspace.set(workspaceId, nextFingerprint);
    dirtyByWorkspace.set(workspaceId, false);
    lastIndexedAtByWorkspace.set(workspaceId, Date.now());
    lastMessageCountByWorkspace.set(workspaceId, ctx.messages.length);
  })();

  inFlightIndexByWorkspace.set(workspaceId, run);
  try {
    await run;
  } finally {
    if (inFlightIndexByWorkspace.get(workspaceId) === run) {
      inFlightIndexByWorkspace.delete(workspaceId);
    }
  }
}

export function markWorkspaceIndexDirty(workspaceId?: string | null): void {
  dirtyByWorkspace.set(normalizeWorkspaceId(workspaceId), true);
}

export function scheduleWorkspaceIndex(
  ctx: WorkspaceContext,
  reason: "workspace-update" | "workspace-switch" | "message-burst" = "workspace-update",
): void {
  ensureNavigatorIndexSync();
  const policy = getWorkspaceRagPolicy();
  if (!policy.autoIndexEnabled) return;

  const workspaceId = normalizeWorkspaceId(ctx.workspaceId);
  pendingContextByWorkspace.set(workspaceId, ctx);
  dirtyByWorkspace.set(workspaceId, true);

  const previousMessageCount = lastMessageCountByWorkspace.get(workspaceId) ?? 0;
  const nextMessageCount = ctx.messages.length;
  const messageDelta = Math.max(0, nextMessageCount - previousMessageCount);

  const mustIndexImmediately =
    reason === "workspace-switch" ||
    messageDelta >= policy.messageBatchSize;

  const pendingTimer = pendingTimerByWorkspace.get(workspaceId);
  if (pendingTimer) clearTimeout(pendingTimer);

  if (mustIndexImmediately) {
    void ensureWorkspaceIndexed(ctx).catch(() => {
      // Never throw from background scheduling.
    });
    return;
  }

  const timeout = setTimeout(() => {
    pendingTimerByWorkspace.delete(workspaceId);
    const latest = pendingContextByWorkspace.get(workspaceId);
    if (!latest) return;
    void ensureWorkspaceIndexed(latest).catch(() => {
      // Never throw from background scheduling.
    });
  }, policy.debounceMs);

  pendingTimerByWorkspace.set(workspaceId, timeout);
}

function ensureNavigatorIndexSync(): void {
  if (navigatorSubscriptionInstalled) return;
  navigatorSubscriptionInstalled = true;

  navigatorService.subscribe(() => {
    const workspaceIds = new Set<string>([
      ...pendingContextByWorkspace.keys(),
      ...fingerprintByWorkspace.keys(),
      ...dirtyByWorkspace.keys(),
    ]);

    for (const workspaceId of workspaceIds) {
      dirtyByWorkspace.set(workspaceId, true);
      const latest = pendingContextByWorkspace.get(workspaceId);
      if (!latest) continue;
      void ensureWorkspaceIndexed(latest).catch(() => {
        // Never throw from background synchronization.
      });
    }
  });
}

export async function clearWorkspaceIndex(workspaceId: string): Promise<void> {
  const normalizedId = normalizeWorkspaceId(workspaceId);
  await ragVectorStore.removeByWorkspace(normalizedId);
  fingerprintByWorkspace.delete(normalizedId);
  dirtyByWorkspace.delete(normalizedId);
  lastIndexedAtByWorkspace.delete(normalizedId);
  lastMessageCountByWorkspace.delete(normalizedId);
  pendingContextByWorkspace.delete(normalizedId);
  const pendingTimer = pendingTimerByWorkspace.get(normalizedId);
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimerByWorkspace.delete(normalizedId);
  }
}
