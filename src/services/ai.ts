import type { Agent, Channel, Group, Message, Network, Bridge, MeshConfig, BridgeMessage, Job, AieosEntity } from "../types";
import { ROLES } from "../constants";
import { repairJSON } from "../utils/json";
import { sanitizeJSONString } from "../utils/json";
import { getAllTools, executeToolCall, type ToolCallResult } from "./commands/tools";
import type { CommandContext } from "./commands/types";

const API_URL = "https://api.anthropic.com/v1/messages";
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
  const apiKey = getApiKey();
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
    if (msg.includes("No Anthropic API key")) {
      return "⚠️ No API key configured. Go to **Profile & Settings** to add your Anthropic API key.";
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
- Executing workspace operations using tools (creating agents, channels, groups, sending messages, querying state, managing ecosystems)
- Analyzing agent relationships and communication patterns
- Recommending governance models and mesh configurations
- Explaining decentralized identity concepts (DIDs, verifiable credentials)

TOOL USE:
You have access to workspace tools that directly modify or query the workspace. Use them whenever the user asks to create, delete, list, or modify workspace entities. Prefer using tools over suggesting manual actions. When you use a tool, explain what you did after getting the result.

When suggesting complex multi-step operations, you can chain multiple tool calls. For example, to set up a research team: create agents, then channels between them, then a group.

Be concise, helpful, and in-character as a workspace management AI. Use markdown formatting for readability. Keep responses under 300 words unless the user asks for detailed analysis.`;
}

export async function chatWithWorkspace(
  userMessage: string,
  history: ChatMessage[],
  ctx: WorkspaceContext,
  commandContext?: CommandContext,
): Promise<{ text: string; toolCalls: ToolCallDisplay[] }> {
  const apiKey = getApiKey();
  const model = getSelectedModel();
  const systemPrompt = buildWorkspaceSystemPrompt(ctx);

  // Build Anthropic tools from command registry
  const tools = commandContext ? getAllTools() : [];

  // Build message history for the API (flatten to Anthropic format)
  const apiMessages: any[] = [
    ...history.slice(-20).map(m => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: userMessage },
  ];

  const allToolCalls: ToolCallDisplay[] = [];
  const MAX_TOOL_ROUNDS = 8; // Safety limit for tool call loops

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const body: any = {
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: apiMessages,
      };

      // Only include tools if we have them and a command context
      if (tools.length > 0 && commandContext) {
        body.tools = tools;
        // Let the AI decide when to use tools
        body.tool_choice = { type: "auto" };
      }

      const response = await fetch(API_URL, {
        method: "POST",
        headers: buildHeaders(apiKey),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error?.message || `API request failed (${response.status})`);
      }

      const data = await response.json();
      const contentBlocks: any[] = data.content || [];
      const stopReason = data.stop_reason;

      // Extract text from content blocks
      const textParts = contentBlocks
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text || "");

      // Check if the AI wants to use tools
      const toolUseBlocks = contentBlocks.filter((b: any) => b.type === "tool_use");

      if (toolUseBlocks.length === 0 || !commandContext) {
        // No tool calls — return the text response
        const text = textParts.join("\n") || "[No response]";
        return { text, toolCalls: allToolCalls };
      }

      // AI wants to use tools — execute them
      // First, append the assistant message to the API messages (must include full content)
      apiMessages.push({ role: "assistant", content: contentBlocks });

      // Execute each tool call
      const toolResults: any[] = [];
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

        // Build tool_result message for Anthropic
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

      // Append tool results as a user message (Anthropic API format)
      apiMessages.push({ role: "user", content: toolResults });

      // The loop will continue — the AI will see the tool results and respond
      // (or make more tool calls)
    }

    // If we exhausted the loop, return whatever we have
    return { text: "[Tool call loop limit reached]", toolCalls: allToolCalls };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("No Anthropic API key")) {
      return { text: "⚠️ No API key configured. Go to **Profile & Settings** to add your Anthropic API key.", toolCalls: [] };
    }
    return { text: `[Chat error: ${msg}]`, toolCalls: [] };
  }
}


/** Generate a complete AIEOS entity from a natural language personality description */
export async function generateAieosFromPrompt(description: string): Promise<AieosEntity> {
  const apiKey = getApiKey();
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
    "image_prompts": { "portrait": "concise txt2img prompt under 30 words", "full_body": "concise txt2img prompt under 30 words" }
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
- image_prompts portrait AND full_body should each be a concise txt2img description (under 30 words)
- Use the exact today's date for created_at and last_updated: ${new Date().toISOString().slice(0, 10)}
- Generate a random UUID for instance_id
- Target 100% schema coverage — every field populated`;

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: buildHeaders(apiKey),
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: `Create a complete AIEOS personality profile for:\n\n${description}\n\nRespond with ONLY the JSON object.` }],
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
