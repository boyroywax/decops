import type { Agent, MeshConfig, Message, BridgeMessage } from "../types";
import { ROLES } from "../constants";
import { repairJSON } from "../utils/json";

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

export async function generateMeshConfig(description: string): Promise<MeshConfig> {
  const systemPrompt = `You are a Mesh Workspace Architect. Given a description, output a JSON mesh network config.

RESPOND WITH ONLY VALID JSON. No markdown. No backticks. No explanation. Just the JSON object.

Rules:
- roles must be one of: researcher, builder, curator, validator, orchestrator
- channel types must be one of: data, task, consensus
- governance must be one of: majority, threshold, delegated, unanimous
- from/to in channels and members in groups are 0-based agent array indices
- Keep ALL string values SHORT — max 30 words per string. No line breaks in strings.
- Create 3-5 agents, 3-6 channels, 1-2 groups, 2-3 example messages

Example output format:
{"agents":[{"name":"Scout","role":"researcher","prompt":"You research topics and report findings concisely."},{"name":"Forge","role":"builder","prompt":"You build solutions from research findings."}],"channels":[{"from":0,"to":1,"type":"data"}],"groups":[{"name":"Core Team","governance":"majority","members":[0,1],"threshold":2}],"exampleMessages":[{"channelIdx":0,"message":"Here are the latest findings on the target topic."}]}`;

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: `Design a mesh network for: ${description}\n\nRespond with ONLY the JSON object. Keep all strings under 30 words. No markdown.` }],
      }),
    });
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
    return config;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Generation failed")) throw err;
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1000, system: systemPrompt, messages }),
    });
    const data = await response.json();
    return data.content?.map((b: { text?: string }) => b.text || "").join("\n") || "[No response]";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `[Agent error: ${message}]`;
  }
}
