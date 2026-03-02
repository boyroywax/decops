import type { Agent, Channel, Group, Message, Network, Bridge, MeshConfig, BridgeMessage, Job, AieosEntity } from "../types";
import { ROLES } from "../constants";
import { repairJSON } from "../utils/json";
import { sanitizeJSONString } from "../utils/json";
import { getAllTools, executeToolCall, type ToolCallResult } from "./commands/tools";
import type { CommandContext } from "./commands/types";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const ANTHROPIC_VERSION = "2023-06-01";

/** Detect provider from model ID */
export function getModelProvider(modelId: string): "anthropic" | "google" | "openai" | "ollama" {
  if (modelId.startsWith("ollama:")) return "ollama";
  if (modelId.startsWith("gpt-") || modelId.startsWith("o3") || modelId.startsWith("o4")) return "openai";
  if (modelId.startsWith("gemini") || modelId.startsWith("imagen")) return "google";
  return "anthropic";
}

/** Read the user's saved API key from localStorage */
function getApiKey(): string {
  const key = localStorage.getItem("anthropic_api_key");
  if (!key) {
    throw new Error(
      "No Anthropic API key configured. Go to Profile & Settings to add your API key."
    );
  }
  return key;
}

/** Read the OpenAI API key from localStorage */
export function getOpenAIApiKey(): string {
  const key = localStorage.getItem("openai_api_key");
  if (!key) {
    throw new Error(
      "No OpenAI API key configured. Go to LLM Manager → Providers to add your API key."
    );
  }
  return key;
}

/** Read the Google (Gemini) API key from localStorage */
function getGoogleApiKey(): string {
  const key = localStorage.getItem("gemini_api_key");
  if (!key) {
    throw new Error(
      "No Google API key configured. Go to LLM Manager → Providers to add your API key."
    );
  }
  return key;
}

/** Get the API key for the detected provider of a model */
function getApiKeyForModel(model: string): string {
  const provider = getModelProvider(model);
  switch (provider) {
    case "openai": return getOpenAIApiKey();
    case "google": return getGoogleApiKey();
    case "anthropic": return getApiKey();
    case "ollama": return ""; // Ollama doesn't need a key
  }
}

// ── Provider-aware request helpers ─────────────────

interface ProviderRequest {
  url: string;
  headers: Record<string, string>;
  body: any;
}

/** Build a non-streaming request for any provider */
function buildProviderRequest(
  model: string,
  systemPrompt: string,
  messages: { role: string; content: string }[],
  maxTokens: number,
  tools?: any[],
): ProviderRequest {
  const provider = getModelProvider(model);

  if (provider === "openai") {
    const apiKey = getOpenAIApiKey();
    return {
      url: OPENAI_API_URL,
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: {
        model,
        max_tokens: maxTokens,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        ...(tools && tools.length > 0 ? {
          tools: tools.map(t => ({
            type: "function",
            function: { name: t.name, description: t.description, parameters: t.input_schema },
          })),
          tool_choice: "auto",
        } : {}),
      },
    };
  }

  if (provider === "google") {
    const apiKey = getGoogleApiKey();
    const geminiModel = model.startsWith("models/") ? model : model;
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`,
      headers: { "Content-Type": "application/json" },
      body: {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: messages.map(m => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        generationConfig: { maxOutputTokens: maxTokens },
      },
    };
  }

  if (provider === "ollama") {
    const { baseUrl, model: ollamaModel } = getOllamaEndpoint(model);
    return {
      url: `${baseUrl}/api/chat`,
      headers: { "Content-Type": "application/json" },
      body: {
        model: ollamaModel,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: false,
      },
    };
  }

  // Default: Anthropic
  const apiKey = getApiKey();
  return {
    url: ANTHROPIC_API_URL,
    headers: buildHeaders(apiKey),
    body: {
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
      ...(tools && tools.length > 0 ? { tools, tool_choice: { type: "auto" } } : {}),
    },
  };
}

/** Extract text from a provider response */
function parseProviderResponse(model: string, data: any): string {
  const provider = getModelProvider(model);

  if (provider === "openai") {
    return data.choices?.[0]?.message?.content || "[No response]";
  }
  if (provider === "google") {
    return data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "[No response]";
  }
  if (provider === "ollama") {
    return data.message?.content || "[No response]";
  }
  // Anthropic
  return data.content?.map((b: { text?: string }) => b.text || "").join("") || "[No response]";
}

/** Check if a response contains tool use (returns blocks for Anthropic/OpenAI, empty for others) */
function parseToolUseBlocks(model: string, data: any): any[] {
  const provider = getModelProvider(model);
  if (provider === "anthropic") {
    return (data.content || []).filter((b: any) => b.type === "tool_use");
  }
  if (provider === "openai") {
    const toolCalls = data.choices?.[0]?.message?.tool_calls || [];
    // Normalize to Anthropic-like format for compatibility
    return toolCalls.map((tc: any) => ({
      type: "tool_use",
      id: tc.id,
      name: tc.function?.name,
      input: JSON.parse(tc.function?.arguments || "{}"),
    }));
  }
  return []; // Google/Ollama: no tool support in this layer
}

/** Build tool result messages for the next API round */
function buildToolResultMessages(model: string, assistantContent: any, toolResults: { id: string; content: string; isError?: boolean }[]): any[] {
  const provider = getModelProvider(model);

  if (provider === "openai") {
    // OpenAI: assistant message with tool_calls, then individual tool messages
    return [
      { role: "assistant", content: null, tool_calls: assistantContent },
      ...toolResults.map(tr => ({
        role: "tool",
        tool_call_id: tr.id,
        content: tr.content,
      })),
    ];
  }

  // Anthropic: assistant message with content blocks, then user message with tool_results
  return [
    { role: "assistant", content: assistantContent },
    {
      role: "user",
      content: toolResults.map(tr => ({
        type: "tool_result",
        tool_use_id: tr.id,
        content: tr.content,
        ...(tr.isError ? { is_error: true } : {}),
      })),
    },
  ];
}

/** Get Ollama base URL for a model ID (format: ollama:instanceId:modelName) */
export function getOllamaEndpoint(modelId: string): { baseUrl: string; model: string } {
  const parts = modelId.split(":");
  if (parts.length < 3) throw new Error("Invalid Ollama model ID format");
  const instanceId = parts[1];
  const modelName = parts.slice(2).join(":");
  try {
    const instances = JSON.parse(localStorage.getItem("ollama_instances") || "[]");
    const inst = instances.find((i: any) => i.id === instanceId);
    if (!inst) throw new Error(`Ollama instance ${instanceId} not found`);
    return { baseUrl: inst.baseUrl, model: modelName };
  } catch (e) {
    if (e instanceof Error && e.message.includes("not found")) throw e;
    throw new Error("Failed to read Ollama instances from storage");
  }
}

/** Read the user's selected model from localStorage, or fall back to default */
export function getSelectedModel(): string {
  return localStorage.getItem("anthropic_model") || DEFAULT_MODEL;
}

/** Get the chat-specific model (workspace chat uses this) */
export function getChatModel(): string {
  return localStorage.getItem("llm_chat_model") || getSelectedModel();
}

/** Get the image generation model */
export function getImageModel(): string {
  return localStorage.getItem("llm_image_model") || "imagen-4.0-generate-001";
}

/** Get model for a specific agent (checks per-agent override → recommended → global) */
export function getAgentModel(agentId?: string, recommendedModel?: string): string {
  if (agentId) {
    try {
      const map = JSON.parse(localStorage.getItem("llm_agent_models") || "{}");
      if (map[agentId]) return map[agentId];
    } catch { /* ignore parse errors */ }
  }
  return recommendedModel || getSelectedModel();
}

/** Get model for a specific command (checks per-command override → recommended → global) */
export function getCommandModel(commandId?: string, recommendedModel?: string): string {
  if (commandId) {
    try {
      const map = JSON.parse(localStorage.getItem("llm_command_models") || "{}");
      if (map[commandId]) return map[commandId];
    } catch { /* ignore parse errors */ }
  }
  return recommendedModel || getSelectedModel();
}

/** Get model for a specific group (checks per-group override → group.modelId → global) */
export function getGroupModel(groupId?: string, recommendedModel?: string): string {
  if (groupId) {
    try {
      const map = JSON.parse(localStorage.getItem("llm_group_models") || "{}");
      if (map[groupId]) return map[groupId];
    } catch { /* ignore parse errors */ }
  }
  return recommendedModel || getSelectedModel();
}

/** Save the selected model to localStorage */
export function setSelectedModel(modelId: string): void {
  localStorage.setItem("anthropic_model", modelId);
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
    "anthropic-dangerous-direct-browser-access": "true",
  };
}

export async function generateMeshConfig(description: string): Promise<MeshConfig> {
  const model = getSelectedModel();

  const systemPrompt = `You are a Mesh Workspace Architect. Given a description, output a JSON mesh network config.

RESPOND WITH ONLY VALID JSON. No markdown. No backticks. No explanation. Just the JSON object.

Rules:
- roles must be one of: researcher, builder, curator, validator, orchestrator
- channel types must be one of: data, task, consensus
- governance must be one of: majority, threshold, delegated, unanimous
- from/to in channels, members in groups, and agent references in networks/bridges are 0-based agent array indices
- fromNetwork/toNetwork in bridges are 0-based network array indices
- Keep ALL string values SHORT — max 30 words per string. No line breaks in strings.
- Create at least 1 network to contain the agents (most prompts need just 1 network)
- For complex multi-domain prompts, create 2-3 networks with bridges connecting them
- Create 3-5 agents per network, 3-6 channels, 1-2 groups, 2-3 example messages
- Each agent belongs to exactly one network (via the networks.agents array)

Example output format (single network):
{"networks":[{"name":"Research Team","description":"Research and analysis network","agents":[0,1,2]}],"agents":[{"name":"Scout","role":"researcher","prompt":"You research topics and report findings concisely."},{"name":"Analyst","role":"curator","prompt":"You analyze and organize research data."},{"name":"Forge","role":"builder","prompt":"You build solutions from research findings."}],"channels":[{"from":0,"to":1,"type":"data"},{"from":1,"to":2,"type":"task"}],"groups":[{"name":"Core Team","governance":"majority","members":[0,1,2],"threshold":2}],"bridges":[],"exampleMessages":[{"channelIdx":0,"message":"Here are the latest findings on the target topic."}]}

Example output format (multi-network with bridge):
{"networks":[{"name":"Research Hub","description":"Data gathering network","agents":[0,1]},{"name":"Build Hub","description":"Development network","agents":[2,3]}],"agents":[{"name":"Scout","role":"researcher","prompt":"Gather data"},{"name":"Analyst","role":"curator","prompt":"Analyze data"},{"name":"Forge","role":"builder","prompt":"Build solutions"},{"name":"Lead","role":"orchestrator","prompt":"Coordinate builds"}],"channels":[{"from":0,"to":1,"type":"data"},{"from":2,"to":3,"type":"task"}],"groups":[],"bridges":[{"fromNetwork":0,"toNetwork":1,"fromAgent":1,"toAgent":2,"type":"data"}],"exampleMessages":[]}`;

  try {
    const userMsg = `Design a mesh network for: ${description}\n\nRespond with ONLY the JSON object. Keep all strings under 30 words. No markdown.`;
    const req = buildProviderRequest(model, systemPrompt, [{ role: "user", content: userMsg }], 4096);
    const response = await fetch(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(req.body),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.error?.message || `API request failed (${response.status})`);
    }
    const data = await response.json();
    if (data.error) throw new Error(data.error.message || "API error");
    const text = parseProviderResponse(model, data);
    if (!text.trim() || text === "[No response]") throw new Error("Empty response from AI");
    const config = repairJSON(text);
    if (!config.agents || !Array.isArray(config.agents) || config.agents.length === 0) {
      throw new Error("Generated config has no agents");
    }
    if (!config.channels) config.channels = [];
    if (!config.groups) config.groups = [];
    if (!config.exampleMessages) config.exampleMessages = [];
    if (!config.networks) config.networks = [];
    if (!config.bridges) config.bridges = [];
    
    // If no networks provided, create a default one containing all agents
    if (config.networks.length === 0) {
      config.networks = [{
        name: "Default Network",
        description: "Auto-generated network",
        agents: config.agents.map((_: any, i: number) => i)
      }];
    }
    
    return config;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Generation failed") || message.includes("No Anthropic API key")) throw err;
    throw new Error(`Generation failed: ${message}`);
  }
}

export async function callAgentAI(
  agent: Agent,
  senderAgent: Agent,
  message: string,
  channelType: string,
  conversationHistory: (Message | BridgeMessage)[],
  crossNetworkCtx?: string,
): Promise<string> {
  const model = getAgentModel(agent.id);

  const systemPrompt = [
    `You are "${agent.name}", a ${ROLES.find(r => r.id === agent.role)?.label} agent in a decentralized mesh workspace.`,
    `Your DID: ${agent.did}`,
    `Communication channel type: ${channelType}`,
    agent.prompt ? `\nYour core directive:\n${agent.prompt}` : "",
    crossNetworkCtx ? `\nCROSS-NETWORK BRIDGE: This message comes from "${senderAgent.name}" in the "${crossNetworkCtx}" network. You are in a different network. Acknowledge the cross-network context.` : "",
    `\nYou are receiving a message from "${senderAgent.name}" (${ROLES.find(r => r.id === senderAgent.role)?.label}, DID: ${senderAgent.did}).`,
    `Respond concisely and in-character. Keep responses under 150 words. If you have structured output, use markdown formatting.`,
  ].filter(Boolean).join("\n");

  const messages: { role: string; content: string }[] = [];
  conversationHistory.slice(-6).forEach((m) => {
    messages.push({ role: m.fromId === agent.id ? "assistant" : "user", content: m.content });
    if (m.response && m.fromId !== agent.id) messages.push({ role: "assistant", content: m.response });
  });
  messages.push({ role: "user", content: message });

  try {
    const req = buildProviderRequest(model, systemPrompt, messages, 1000);
    const response = await fetch(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(req.body),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.error?.message || `API request failed (${response.status})`);
    }
    const data = await response.json();
    return parseProviderResponse(model, data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `[Agent error: ${msg}]`;
  }
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Tool calls the AI made (stored for display) */
  toolCalls?: ToolCallDisplay[];
}

/** Lightweight representation of a tool call for display in chat */
export interface ToolCallDisplay {
  name: string;
  input: Record<string, any>;
  result: any;
  error?: string;
  duration_ms: number;
  jobId?: string;
}

/**
 * Direct user-to-agent chat. The user is a human operator, not another agent.
 * Uses the agent's system prompt and role to respond in-character.
 */
export async function chatWithAgent(
  agent: Agent,
  userMessage: string,
  history: ChatMessage[],
): Promise<string> {
  const model = getAgentModel(agent.id);

  const role = ROLES.find(r => r.id === agent.role);
  const systemPrompt = [
    `You are "${agent.name}", a ${role?.label || agent.role} agent in a decentralized mesh workspace.`,
    `Your DID: ${agent.did}`,
    agent.prompt ? `\nYour core directive:\n${agent.prompt}` : "",
    `\nYou are chatting directly with a human operator who manages this workspace.`,
    `Respond concisely and in-character. Keep responses under 200 words. Use markdown formatting when appropriate.`,
  ].filter(Boolean).join("\n");

  const messages = [
    ...history.slice(-20).map(m => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: userMessage },
  ];

  try {
    const req = buildProviderRequest(model, systemPrompt, messages, 1000);
    const response = await fetch(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(req.body),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.error?.message || `API request failed (${response.status})`);
    }
    const data = await response.json();
    return parseProviderResponse(model, data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("No Anthropic API key") || msg.includes("No OpenAI API key") || msg.includes("No Google API key")) {
      return `⚠️ No API key configured. Go to **LLM Manager → Providers** to add your API key.`;
    }
    return `[Agent error: ${msg}]`;
  }
}


export interface WorkspaceContext {
  agents: Agent[];
  channels: Channel[];
  groups: Group[];
  messages: Message[];
  ecosystems: Network[];
  bridges: Bridge[];
  addJob?: (job: { type: string; request: any }) => void;
  jobs: Job[];
}

function buildWorkspaceSystemPrompt(ctx: WorkspaceContext): string {
  const agentSummary = ctx.agents.length > 0
    ? ctx.agents.map(a => `  - "${a.name}" (${a.role}, DID: ${a.did.slice(0, 24)}…)`).join("\n")
    : "  (none)";

  const channelSummary = ctx.channels.length > 0
    ? ctx.channels.map(c => {
      const from = ctx.agents.find(a => a.id === c.from);
      const to = ctx.agents.find(a => a.id === c.to);
      return `  - ${from?.name || "?"} ↔ ${to?.name || "?"} (${c.type})`;
    }).join("\n")
    : "  (none)";

  const groupSummary = ctx.groups.length > 0
    ? ctx.groups.map(g => {
      const memberNames = g.members.map(mid => ctx.agents.find(a => a.id === mid)?.name || "?").join(", ");
      return `  - "${g.name}" — governance: ${g.governance}, members: [${memberNames}], threshold: ${g.threshold}`;
    }).join("\n")
    : "  (none)";

  const recentMsgs = ctx.messages.slice(-10).map(m => {
    const from = ctx.agents.find(a => a.id === m.fromId);
    const to = ctx.agents.find(a => a.id === m.toId);
    return `  [${from?.name || "?"}→${to?.name || "?"}]: ${m.content.slice(0, 80)}${m.content.length > 80 ? "…" : ""}${m.response ? ` → ${m.response.slice(0, 60)}…` : ""}`;
  }).join("\n") || "  (none)";

  const netSummary = ctx.ecosystems.length > 0
    ? ctx.ecosystems.map(n => `  - "${n.name}" (${n.agents.length} agents, ${n.channels.length} channels)`).join("\n")
    : "  (none)";

  const jobSummary = ctx.jobs.length > 0
    ? ctx.jobs.slice(-8).map(j => {
      const stepCount = j.steps?.length || 0;
      const delivCount = j.deliverables?.length || 0;
      const hasStorage = j.storage && Object.keys(j.storage).length > 0;
      let info = `  - [${j.status}] "${j.type}" (${j.id.slice(0, 8)}…)`;
      if (stepCount > 0) info += ` — ${stepCount} steps (${j.mode || 'serial'})`;
      if (delivCount > 0) info += `, ${delivCount} deliverables`;
      if (hasStorage) info += `, storage: {${Object.keys(j.storage!).join(', ')}}`;
      return info;
    }).join("\n")
    : "  (none)";

  return `You are the Mesh Workspace AI Assistant. You help the user manage their decentralized agent collaboration workspace.

CURRENT WORKSPACE STATE:
═══════════════════════
Agents (${ctx.agents.length}):
${agentSummary}

Channels (${ctx.channels.length}):
${channelSummary}

Groups (${ctx.groups.length}):
${groupSummary}

Recent Messages (last ${Math.min(ctx.messages.length, 10)} of ${ctx.messages.length}):
${recentMsgs}

Ecosystem Networks (${ctx.ecosystems.length}):
${netSummary}

Bridges: ${ctx.bridges.length}

Jobs (recent ${Math.min(ctx.jobs.length, 8)} of ${ctx.jobs.length}):
${jobSummary}
═══════════════════════

HIERARCHY: Ecosystem (= Workspace) → Network → Group → Agent/Channel
Each workspace IS a single ecosystem. Networks contain groups, agents, and channels. Bridges connect agents across networks.

You can help the user with:
- Answering questions about their workspace (agents, channels, groups, messages, networks, topology)
- Executing workspace operations using tools (creating agents, channels, groups, networks, bridges, sending messages, querying state)
- Analyzing agent relationships and communication patterns
- Recommending governance models and mesh configurations
- Explaining decentralized identity concepts (DIDs, verifiable credentials)
- Building and managing multi-step jobs with the Job Builder

TOOL USE:
You have access to workspace tools that directly modify or query the workspace. Use them whenever the user asks to create, delete, list, or modify workspace entities. Prefer using tools over suggesting manual actions. When you use a tool, explain what you did after getting the result.

When suggesting complex multi-step operations, you can chain multiple tool calls. For example, to set up a research team: create agents, then channels between them, then a group.

JOB BUILDER:
Jobs support these features:
- **Steps**: ordered list of command invocations (serial or parallel execution)
- **Deliverables**: declared outputs the job is expected to produce. Each deliverable has a key, label, type (markdown|json|yaml|csv|image|code), and optional description.
- **Shared Storage**: key-value pairs (storageDefaults) that provide inter-step shared state. Steps can read/write these keys at runtime via the storage object. Use this to pass data between steps without hardcoding.
- **Storage References**: Step args can use \`$storage.keyName\` to reference values written by earlier steps. For example, create_network writes \`storage.network_NetName\` with the UUID, and a subsequent create_agent step can use \`networkId: "$storage.network_NetName"\` to reference it. This enables dynamic ID passing between steps.

Key commands write to shared storage automatically:
- create_network → \`network_{name}\`, \`lastNetworkId\`
- create_agent → \`agent_{name}\`, \`lastAgentId\`
- create_channel → \`channel_{from}_{to}\`, \`lastChannelId\`
- create_group → \`group_{name}\`, \`lastGroupId\`
- list_agents/channels/groups/messages → \`agents\`, \`channels\`, \`groups\`, \`messages\`
- list_networks → \`networks\`
- prompt_architect → \`lastConfig\`, \`lastArchitectPrompt\`

STUDIO (VISUAL JOB EDITOR):
The Studio is a visual canvas-based job editor. You can programmatically interact with Studio using these commands:

**State & Metadata:**
- studio_get_state — Returns full Studio state (name, description, mode, steps, deliverables, storage entries)
- studio_set_job_meta — Set job name and/or description

**Building Steps:**
- studio_add_step(commandId, args?) — Add a step to the canvas. Returns new step ID.
- studio_remove_step(stepId) — Remove a step by ID.
- studio_set_step_args(stepId, args) — Update argument values on a step.
- studio_add_parallel_group() — Add a parallel container node. Steps added as children of this group run concurrently.
- studio_set_step_condition(stepId, condition) — Set a JavaScript pre-condition (step only runs if truthy).

**Data Flow (Input Bindings & Output Mappings):**
- studio_set_input_bindings(stepId, bindings) — Map step arguments to shared storage or deliverables.
  Format: { argName: { source: "storage"|"deliverable", sourceKey: "key" }, ... }
- studio_set_output_mappings(stepId, mappings) — Route step outputs to storage or deliverables.
  Format: [ { outputKey: "key", target: "storage"|"deliverable", targetKey: "key" }, ... ]

**Deliverables & Storage:**
- studio_add_deliverable(key, label, type, description?) — Declare a deliverable (output).
- studio_remove_deliverable(index) — Remove a deliverable by index.
- studio_add_storage(key, value) — Add a storage default key-value pair.
- studio_remove_storage(index) — Remove storage entry by index.

**Entity Inputs (with source types):**
- studio_add_input(name, type, entityId, source?) — Add an entity input node.
  Source kinds: "prompt" (ask user at runtime), "storage" (read from storage key), "hardcoded" (literal value), "artifact" (workspace artifact by ID or tag).
- studio_update_input(index, field, value) — Update an input field.
- studio_remove_input(index) — Remove an input by index.

**Automated Triggers:**
- studio_add_trigger(event, filter?, label?) — Add a trigger rule. Events: artifact:created, artifact:updated, artifact:deleted, agent:created, agent:updated, group:created, group:updated, channel:created, channel:updated, network:created, network:updated, job:completed, job:failed, schedule:cron.
- studio_update_trigger(triggerId, patch) — Update trigger properties (event, enabled, filter, cron, label).
- studio_remove_trigger(triggerId) — Remove a trigger.

**Job Lifecycle:**
- studio_save_job() — Save current Studio job to catalog.
- studio_run_job() — Build and execute the current Studio job.
- studio_load_job(jobId) — Load a saved job definition into Studio.
- studio_clear_canvas() — Clear all steps, deliverables, storage (reset Studio).

**Compound: Build & Deploy in One Call:**
- studio_create_job(name, description?, steps, deliverables?, storageDefaults?, triggers?, save?, run?)
  Create a complete job in the Studio in one command. Optionally save to catalog and/or run immediately.

When the user wants to build jobs programmatically or visually, use studio_create_job for efficiency. For incremental editing, use individual commands.

NETWORK DEPLOYMENT:
The deploy_network command is a **job factory** — it reads a MeshConfig (from args or storage.lastConfig), generates atomic steps (create_network, create_agent, create_channel, create_group, create_bridge, send_message, print_topology), and queues them as a multi-step serial job. Each step is visible with progress tracking. The typical workflow is:
1. prompt_architect (generates config → stores in storage.lastConfig)
2. deploy_network (reads config → generates steps → queues deployment job)

When helping users build jobs, suggest appropriate deliverables and storage keys. For save_job_definition, include deliverables and storageDefaults when relevant.

Be concise, helpful, and in-character as a workspace management AI. Use markdown formatting for readability. Keep responses under 300 words unless the user asks for detailed analysis.`;
}

export async function chatWithWorkspace(
  userMessage: string,
  history: ChatMessage[],
  ctx: WorkspaceContext,
  commandContext?: CommandContext,
): Promise<{ text: string; toolCalls: ToolCallDisplay[] }> {
  const model = getSelectedModel();
  const provider = getModelProvider(model);
  const systemPrompt = buildWorkspaceSystemPrompt(ctx);

  // Build tools from command registry (tool use supported for anthropic + openai)
  const tools = commandContext && (provider === "anthropic" || provider === "openai") ? getAllTools() : [];

  // Build message history
  const apiMessages: any[] = [
    ...history.slice(-20).map(m => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: userMessage },
  ];

  const allToolCalls: ToolCallDisplay[] = [];
  const MAX_TOOL_ROUNDS = 8;

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const req = buildProviderRequest(model, systemPrompt, apiMessages, 4096, tools.length > 0 ? tools : undefined);
      const response = await fetch(req.url, {
        method: "POST",
        headers: req.headers,
        body: JSON.stringify(req.body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error?.message || `API request failed (${response.status})`);
      }

      const data = await response.json();

      // Check for tool use
      const toolUseBlocks = parseToolUseBlocks(model, data);

      if (toolUseBlocks.length === 0 || !commandContext) {
        const text = parseProviderResponse(model, data);
        return { text, toolCalls: allToolCalls };
      }

      // Tool use round — execute tools then loop
      // Get raw assistant content for the tool result message
      const rawAssistant = provider === "openai"
        ? data.choices?.[0]?.message?.tool_calls
        : data.content;

      const toolResults: { id: string; content: string; isError?: boolean }[] = [];
      for (const block of toolUseBlocks) {
        const result = await executeToolCall(
          block.id,
          block.name,
          block.input || {},
          commandContext,
        );

        allToolCalls.push({
          name: result.name,
          input: result.input,
          result: result.result,
          error: result.error,
          duration_ms: result.duration_ms,
          jobId: result.jobId,
        });

        const content = result.error
          ? JSON.stringify({ error: result.error })
          : JSON.stringify(result.result ?? { success: true });

        toolResults.push({
          id: block.id,
          content,
          isError: !!result.error,
        });
      }

      // Append assistant + tool results in provider-specific format
      const resultMsgs = buildToolResultMessages(model, rawAssistant, toolResults);
      apiMessages.push(...resultMsgs);
    }

    return { text: "[Tool call loop limit reached]", toolCalls: allToolCalls };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("No Anthropic API key") || msg.includes("No OpenAI API key") || msg.includes("No Google API key")) {
      return { text: "⚠️ No API key configured. Go to **LLM Manager → Providers** to add your API key.", toolCalls: [] };
    }
    return { text: `[Chat error: ${msg}]`, toolCalls: [] };
  }
}

// ── SSE Stream Parser ──────────────────────────────

/**
 * Parse Anthropic SSE stream and invoke callbacks for each event.
 * Handles `content_block_delta` (text), `content_block_start` (tool_use),
 * `message_stop`, and error events.
 */
async function parseAnthropicSSE(
  response: Response,
  callbacks: {
    onText: (text: string) => void;
    onToolUseStart: (block: { id: string; name: string }) => void;
    onToolUseInput: (json: string) => void;
    onContentBlockStop: () => void;
    onMessageStop: () => void;
    onError: (err: Error) => void;
  },
): Promise<{ contentBlocks: any[]; stopReason: string }> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let stopReason = "end_turn";

  // Track content blocks for tool use
  const contentBlocks: any[] = [];
  let currentBlockIndex = -1;
  let currentToolInput = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === "[DONE]") continue;

        try {
          const event = JSON.parse(jsonStr);

          switch (event.type) {
            case "content_block_start": {
              currentBlockIndex = event.index ?? contentBlocks.length;
              const block = event.content_block;
              if (block.type === "text") {
                contentBlocks[currentBlockIndex] = { type: "text", text: "" };
              } else if (block.type === "tool_use") {
                contentBlocks[currentBlockIndex] = {
                  type: "tool_use",
                  id: block.id,
                  name: block.name,
                  input: {},
                };
                currentToolInput = "";
                callbacks.onToolUseStart({ id: block.id, name: block.name });
              }
              break;
            }
            case "content_block_delta": {
              const delta = event.delta;
              const idx = event.index ?? currentBlockIndex;
              if (delta.type === "text_delta" && delta.text) {
                callbacks.onText(delta.text);
                if (contentBlocks[idx]) {
                  contentBlocks[idx].text = (contentBlocks[idx].text || "") + delta.text;
                }
              } else if (delta.type === "input_json_delta" && delta.partial_json) {
                currentToolInput += delta.partial_json;
                callbacks.onToolUseInput(delta.partial_json);
              }
              break;
            }
            case "content_block_stop": {
              const idx = event.index ?? currentBlockIndex;
              // Finalize tool input JSON
              if (contentBlocks[idx]?.type === "tool_use" && currentToolInput) {
                try {
                  contentBlocks[idx].input = JSON.parse(currentToolInput);
                } catch {
                  contentBlocks[idx].input = {};
                }
                currentToolInput = "";
              }
              callbacks.onContentBlockStop();
              break;
            }
            case "message_delta": {
              if (event.delta?.stop_reason) {
                stopReason = event.delta.stop_reason;
              }
              break;
            }
            case "message_stop": {
              callbacks.onMessageStop();
              break;
            }
            case "error": {
              const errMsg = event.error?.message || "Stream error";
              callbacks.onError(new Error(errMsg));
              break;
            }
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { contentBlocks, stopReason };
}

// ── Streaming Chat ─────────────────────────────────

export interface StreamCallbacks {
  /** Called with each text token as it arrives */
  onToken: (token: string) => void;
  /** Called when a tool call starts executing (for UI feedback) */
  onToolCallStart?: (name: string, input: Record<string, any>) => void;
  /** Called when a tool call completes */
  onToolCallComplete?: (display: ToolCallDisplay) => void;
}

/**
 * Streaming version of chatWithWorkspace.
 * Text tokens are pushed via onToken callback for live display.
 * Tool use rounds are handled internally — the final text response streams.
 * Returns the complete result for persistence.
 */
export async function streamChatWithWorkspace(
  userMessage: string,
  history: ChatMessage[],
  ctx: WorkspaceContext,
  callbacks: StreamCallbacks,
  commandContext?: CommandContext,
): Promise<{ text: string; toolCalls: ToolCallDisplay[] }> {
  const model = getSelectedModel();
  const provider = getModelProvider(model);
  const systemPrompt = buildWorkspaceSystemPrompt(ctx);

  // For non-Anthropic providers, fall back to non-streaming (emit all at once)
  if (provider !== "anthropic") {
    const result = await chatWithWorkspace(userMessage, history, ctx, commandContext);
    // Emit the full text as a single token burst
    if (result.text) callbacks.onToken(result.text);
    return result;
  }

  const tools = commandContext ? getAllTools() : [];

  const apiMessages: any[] = [
    ...history.slice(-20).map(m => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: userMessage },
  ];

  const allToolCalls: ToolCallDisplay[] = [];
  const MAX_TOOL_ROUNDS = 8;
  let fullText = "";

  try {
    const apiKey = getApiKey();
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const body: any = {
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: apiMessages,
        stream: true,
      };

      if (tools.length > 0 && commandContext) {
        body.tools = tools;
        body.tool_choice = { type: "auto" };
      }

      const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: buildHeaders(apiKey),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error?.message || `API request failed (${response.status})`);
      }

      // Parse the SSE stream
      let roundText = "";
      const { contentBlocks } = await parseAnthropicSSE(response, {
        onText: (token) => {
          roundText += token;
          callbacks.onToken(token);
        },
        onToolUseStart: (block) => {
          callbacks.onToolCallStart?.(block.name, {});
        },
        onToolUseInput: () => { /* accumulating internally */ },
        onContentBlockStop: () => { },
        onMessageStop: () => { },
        onError: (err) => { throw err; },
      });

      // Check for tool use blocks
      const toolUseBlocks = contentBlocks.filter((b: any) => b.type === "tool_use");

      fullText += roundText;

      if (toolUseBlocks.length === 0 || !commandContext) {
        // No tool calls — streaming is complete
        const text = fullText || "[No response]";
        return { text, toolCalls: allToolCalls };
      }

      // Tool use round — execute tools then loop
      apiMessages.push({ role: "assistant", content: contentBlocks });

      const toolResults: any[] = [];
      for (const block of toolUseBlocks) {
        callbacks.onToolCallStart?.(block.name, block.input || {});

        const result = await executeToolCall(
          block.id,
          block.name,
          block.input || {},
          commandContext,
        );

        const display: ToolCallDisplay = {
          name: result.name,
          input: result.input,
          result: result.result,
          error: result.error,
          duration_ms: result.duration_ms,
          jobId: result.jobId,
        };
        allToolCalls.push(display);
        callbacks.onToolCallComplete?.(display);

        const content = result.error
          ? JSON.stringify({ error: result.error })
          : JSON.stringify(result.result ?? { success: true });

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content,
          ...(result.error ? { is_error: true } : {}),
        });
      }

      apiMessages.push({ role: "user", content: toolResults });
      // Separate rounds with newline if there was text before the tool calls
      if (roundText) fullText += "\n\n";
      // Loop continues — next round will stream the AI's response to tool results
    }

    return { text: fullText || "[Tool call loop limit reached]", toolCalls: allToolCalls };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("No Anthropic API key") || msg.includes("No OpenAI API key") || msg.includes("No Google API key")) {
      return { text: "⚠️ No API key configured. Go to **LLM Manager → Providers** to add your API key.", toolCalls: [] };
    }
    return { text: fullText || `[Chat error: ${msg}]`, toolCalls: allToolCalls };
  }
}


/** Generate a complete AIEOS entity from a natural language personality description */
export async function generateAieosFromPrompt(description: string): Promise<AieosEntity> {
  const model = getSelectedModel();

  const systemPrompt = `You generate AIEOS v1.1.0 (AI Entity Object Specification) JSON profiles from personality descriptions.

RESPOND WITH ONLY VALID JSON. No markdown. No backticks. No explanation. Just the JSON object.

The output must conform to this COMPLETE schema — ALL sections are REQUIRED, no empty strings or empty arrays:
{
  "standard": { "protocol": "AIEOS", "version": "1.1.0", "schema_url": "https://aieos.org/schema/v1.1.0" },
  "metadata": {
    "instance_id": "<uuid>",
    "instance_version": "1.0",
    "generator": "decops-ai-generator",
    "created_at": "<YYYY-MM-DD>",
    "last_updated": "<YYYY-MM-DD>"
  },
  "capabilities": {
    "skills": [{ "name": "skill-id", "description": "What this skill does", "priority": 1, "auto_activate": true }]
  },
  "identity": {
    "names": { "first": "", "middle": "", "last": "", "nickname": "" },
    "bio": { "birthday": "YYYY-MM-DD", "age_biological": 0, "age_perceived": 0, "gender": "" },
    "origin": { "nationality": "", "ethnicity": "", "birthplace": { "city": "", "country": "" } },
    "residence": { "current_city": "", "current_country": "", "dwelling_type": "" }
  },
  "physicality": {
    "face": {
      "shape": "",
      "skin": { "tone": "", "texture": "", "details": ["detail1"] },
      "eyes": { "color": "", "shape": "", "eyebrows": "", "corrective_lenses": "none|glasses|monocle" },
      "hair": { "color": "", "style": "", "texture": "" },
      "facial_hair": "none or description",
      "nose": "",
      "mouth": "",
      "distinguishing_features": ["feature1", "feature2"]
    },
    "body": {
      "height_cm": 170,
      "weight_kg": 70,
      "somatotype": "Ectomorph|Mesomorph|Endomorph",
      "build_description": "",
      "posture": "",
      "scars_tattoos": []
    },
    "style": {
      "aesthetic_archetype": "",
      "clothing_preferences": ["pref1", "pref2"],
      "accessories": ["acc1"],
      "color_palette": ["#hex1", "#hex2", "#hex3"]
    },
    "image_prompts": { "portrait": "physical appearance only, no art style or medium, under 30 words", "full_body": "physical appearance only, no art style or medium, under 30 words" }
  },
  "psychology": {
    "neural_matrix": {
      "creativity": 0.0, "empathy": 0.0, "logic": 0.0,
      "adaptability": 0.0, "charisma": 0.0, "reliability": 0.0
    },
    "traits": {
      "ocean": { "openness": 0.0, "conscientiousness": 0.0, "extraversion": 0.0, "agreeableness": 0.0, "neuroticism": 0.0 },
      "mbti": "XXXX",
      "enneagram": "XwX",
      "temperament": "Sanguine|Choleric|Melancholic|Phlegmatic"
    },
    "moral_compass": { "alignment": "e.g. Neutral Good", "core_values": ["value1", "value2"], "conflict_resolution_style": "" },
    "mental_patterns": { "decision_making_style": "", "attention_span": "", "learning_style": "" },
    "emotional_profile": {
      "base_mood": "",
      "volatility": 0.0,
      "resilience": "",
      "triggers": { "joy": ["trigger1"], "anger": ["trigger1"], "sadness": ["trigger1"] }
    },
    "idiosyncrasies": { "phobias": [], "obsessions": ["obsession1"], "tics": [] }
  },
  "linguistics": {
    "voice": {
      "acoustics": { "pitch": "low|medium|high", "speed": "slow|medium|fast", "roughness": 0.0, "breathiness": 0.0 },
      "accent": { "region": "", "strength": 0.0 }
    },
    "text_style": {
      "formality_level": 0.0,
      "verbosity_level": 0.0,
      "vocabulary_level": "basic|intermediate|advanced|academic|literary",
      "slang_usage": false,
      "style_descriptors": ["descriptor1"]
    },
    "syntax": { "sentence_structure": "simple|compound|complex|varied", "use_contractions": true, "active_passive_ratio": 0.7 },
    "interaction": { "turn_taking": "passive|balanced|dominant", "dominance_score": 0.0, "emotional_coloring": "" },
    "idiolect": { "catchphrases": ["phrase1"], "forbidden_words": ["word1"], "hesitation_markers": false }
  },
  "history": {
    "origin_story": "2-3 sentences about how this entity came to be",
    "education": { "level": "", "field": "", "institution": "", "graduation_year": 2025 },
    "occupation": { "title": "", "industry": "", "years_experience": 1, "previous_jobs": ["job1"] },
    "family": { "relationship_status": "", "parents": "", "siblings": "", "children": "", "pets": "" },
    "key_life_events": [
      { "year": 2025, "event": "event description", "impact": "impact description" },
      { "year": 2025, "event": "event description", "impact": "impact description" }
    ]
  },
  "interests": {
    "hobbies": ["hobby1", "hobby2", "hobby3"],
    "favorites": { "music_genre": "", "book": "", "movie": "", "color": "", "food": "", "season": "" },
    "aversions": ["aversion1", "aversion2"],
    "lifestyle": { "diet": "", "sleep_schedule": "", "digital_habits": "" }
  },
  "motivations": {
    "core_drive": "",
    "goals": { "short_term": ["goal1", "goal2"], "long_term": ["goal1", "goal2"] },
    "fears": { "rational": ["fear1"], "irrational": ["fear1"] }
  }
}

Rules:
- ALL sections are MANDATORY — you must fill every section with meaningful content. No empty strings. No empty arrays.
- All numeric personality values (neural_matrix, ocean, formality, verbosity, volatility, dominance_score) MUST be between 0.0 and 1.0
- Fill in ALL sections as richly as possible based on the description
- physicality MUST include face (with skin, eyes, hair, nose, mouth, distinguishing_features), body (height, weight, somatotype), style, and image_prompts
- history MUST include origin_story, education, occupation, family, and at least 2 key_life_events
- interests MUST include at least 3 hobbies, all 6 favorites fields, at least 2 aversions, and lifestyle
- Invent plausible details for sections not explicitly described — be creative but consistent
- Keep all string values concise (under 50 words each)
- Generate 3-5 relevant skills
- image_prompts portrait AND full_body MUST describe ONLY the subject's physical appearance (face, hair, clothing, pose, background color) in under 30 words — do NOT include any art style, rendering medium, or technique (no "digital art", "illustration", "vector", "3D render", "oil painting", "cel-shaded", "anime", "watercolor", etc.) because the art style is applied separately
- Use the exact today's date for created_at and last_updated: ${new Date().toISOString().slice(0, 10)}
- Generate a random UUID for instance_id
- Target 100% schema coverage — every field populated`;

  try {
    const userMsg = `Create a complete AIEOS personality profile for:\n\n${description}\n\nRespond with ONLY the JSON object.`;
    const req = buildProviderRequest(model, systemPrompt, [{ role: "user", content: userMsg }], 4096);
    const response = await fetch(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(req.body),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.error?.message || `API request failed (${response.status})`);
    }
    const data = await response.json();
    if (data.error) throw new Error(data.error.message || "API error");
    const text = parseProviderResponse(model, data);
    if (!text.trim() || text === "[No response]") throw new Error("Empty response from AI");

    // Parse the JSON (with sanitization for markdown fences etc.)
    let entity: AieosEntity;
    try {
      entity = JSON.parse(text) as AieosEntity;
    } catch {
      const sanitized = sanitizeJSONString(text);
      entity = JSON.parse(sanitized) as AieosEntity;
    }

    // Validate minimum structure
    if (!entity.standard) {
      entity.standard = { protocol: "AIEOS", version: "1.1.0", schema_url: "https://aieos.org/schema/v1.1.0" };
    }
    if (!entity.metadata) {
      entity.metadata = {
        instance_id: crypto.randomUUID(),
        instance_version: "1.0",
        generator: "decops-ai-generator",
        created_at: new Date().toISOString().slice(0, 10),
        last_updated: new Date().toISOString().slice(0, 10),
      };
    }

    return entity;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("No Anthropic API key")) throw err;
    throw new Error(`AIEOS generation failed: ${message}`);
  }
}
