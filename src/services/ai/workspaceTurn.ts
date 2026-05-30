import type { CommandContext } from "@/services/commands/types";
import { getAllTools, getToolsByToolkitIds } from "@/services/commands/tools";
import { retrieveWorkspaceContext } from "@/services/rag/retrieval";
import { getChatDelegation } from "./delegation";
import { getSelectedModel } from "./models";
import { getModelProvider } from "./providers";
import { buildWorkspaceSystemPrompt } from "./prompts";
import type { WorkspaceContext } from "./prompts";
import type { ChatMessage } from "./chat";
import type { AnthropicTool } from "@/services/commands/tools";
import type { ChatTurnMessage } from "./runner";

interface PrepareWorkspaceTurnOptions {
  toolkitIds?: string[];
  streamRequested?: boolean;
}

export interface PreparedWorkspaceTurn {
  model: string;
  provider: string;
  systemPrompt: string;
  messages: ChatTurnMessage[];
  tools: AnthropicTool[];
  maxRounds: number;
  stream: boolean;
}

function providerSupportsStreaming(provider: string): boolean {
  return provider === "anthropic" || provider === "openai" || provider === "openrouter";
}

function buildTurnMessages(history: ChatMessage[], userMessage: string): ChatTurnMessage[] {
  return [
    ...history.slice(-20).map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: userMessage },
  ];
}

export async function prepareWorkspaceTurn(
  userMessage: string,
  history: ChatMessage[],
  ctx: WorkspaceContext,
  commandContext?: CommandContext,
  options: PrepareWorkspaceTurnOptions = {},
): Promise<PreparedWorkspaceTurn> {
  const model = getSelectedModel();
  const provider = getModelProvider(model);
  const { toolkitIds, streamRequested = false } = options;

  const isDarkAgent =
    Array.isArray(toolkitIds) &&
    toolkitIds.length > 0 &&
    !toolkitIds.includes("collective-memory");

  let recalledMemory: ReturnType<typeof import("@/services/collectiveMemory").recallCollectiveMemory> = [];
  let ragContext = "";
  try {
    const retrieved = await retrieveWorkspaceContext(userMessage, ctx, { isDarkAgent });
    recalledMemory = retrieved.recalledMemory;
    ragContext = retrieved.ragContext;
  } catch {
    recalledMemory = [];
    ragContext = "";
  }

  let systemPrompt = buildWorkspaceSystemPrompt(ctx, {
    recalledMemory,
    isDarkAgent,
    ragContext,
  });

  const delegation = getChatDelegation(userMessage);
  let maxRounds = 8;
  if (delegation) {
    systemPrompt = delegation.enhance(systemPrompt);
    maxRounds = delegation.maxRounds ?? 12;
  }

  const tools = commandContext
    ? (toolkitIds && toolkitIds.length > 0 ? getToolsByToolkitIds(toolkitIds) : getAllTools())
    : [];

  return {
    model,
    provider,
    systemPrompt,
    messages: buildTurnMessages(history, userMessage),
    tools,
    maxRounds,
    stream: streamRequested && providerSupportsStreaming(provider),
  };
}
