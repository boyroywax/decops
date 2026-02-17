import type { Agent, Channel, Group, Message, Network, Bridge, MeshConfig, BridgeMessage, Job } from "../types";
import { ROLES } from "../constants";
import { repairJSON } from "../utils/json";

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const ANTHROPIC_VERSION = "2023-06-01";

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

/** Read the user's selected model from localStorage, or fall back to default */
export function getSelectedModel(): string {
  return localStorage.getItem("anthropic_model") || DEFAULT_MODEL;
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
  const apiKey = getApiKey();
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
    const response = await fetch(API_URL, {
      method: "POST",
      headers: buildHeaders(apiKey),
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: `Design a mesh network for: ${description}\n\nRespond with ONLY the JSON object. Keep all strings under 30 words. No markdown.` }],
      }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.error?.message || `API request failed (${response.status})`);
    }
    const data = await response.json();
    if (data.error) throw new Error(data.error.message || "API error");
    const text = data.content?.map((b: { text?: string }) => b.text || "").join("") || "";
    if (!text.trim()) throw new Error("Empty response from AI");
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
  const apiKey = getApiKey();
  const model = getSelectedModel();

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
    const response = await fetch(API_URL, {
      method: "POST",
      headers: buildHeaders(apiKey),
      body: JSON.stringify({ model, max_tokens: 1000, system: systemPrompt, messages }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.error?.message || `API request failed (${response.status})`);
    }
    const data = await response.json();
    return data.content?.map((b: { text?: string }) => b.text || "").join("\n") || "[No response]";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `[Agent error: ${msg}]`;
  }
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
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
═══════════════════════

You can help the user with:
- Answering questions about their workspace (agents, channels, groups, messages, topology)
- Suggesting workspace operations (creating agents, channels, groups, sending messages)
- Analyzing agent relationships and communication patterns
- Recommending governance models and mesh configurations
- Explaining decentralized identity concepts (DIDs, verifiable credentials)

When you want to suggest a workspace action, include a JSON action block like:
\`\`\`action
{"type": "create_agent", "name": "Scout", "role": "researcher", "prompt": "You research and report findings."}
\`\`\`

Available action types:
- create_agent: {name, role, prompt} — roles: researcher, builder, curator, validator, orchestrator
- create_channel: {from_agent_name, to_agent_name, type} — types: data, task, consensus  
- create_group: {name, governance, member_agent_names, threshold} — governance: majority, threshold, delegated, unanimous
- send_message: {from_agent_name, to_agent_name, message}
- generate_mesh: {description} — generate an entire mesh network from description

Be concise, helpful, and in-character as a workspace management AI. Use markdown formatting for readability. Keep responses under 300 words unless the user asks for detailed analysis.`;
}

export async function chatWithWorkspace(
  userMessage: string,
  history: ChatMessage[],
  ctx: WorkspaceContext,
): Promise<string> {
  const apiKey = getApiKey();
  const model = getSelectedModel();
  const systemPrompt = buildWorkspaceSystemPrompt(ctx);

  const messages = [
    ...history.slice(-20).map(m => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: userMessage },
  ];

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: buildHeaders(apiKey),
      body: JSON.stringify({ model, max_tokens: 2048, system: systemPrompt, messages }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.error?.message || `API request failed (${response.status})`);
    }
    const data = await response.json();
    return data.content?.map((b: { text?: string }) => b.text || "").join("\n") || "[No response]";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("No Anthropic API key")) {
      return "⚠️ No API key configured. Go to **Profile & Settings** to add your Anthropic API key.";
    }
    return `[Chat error: ${msg}]`;
  }
}

