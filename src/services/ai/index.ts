/**
 * AI service — barrel re-export.
 * All consumers import from "services/ai" which resolves here.
 */

// Provider infrastructure
export {
  getModelProvider, getOpenAIApiKey, getOllamaEndpoint,
} from "./providers";

// Model selection
export {
  getSelectedModel, getChatModel, getImageModel,
  getAgentModel, getCommandModel, getGroupModel,
  setSelectedModel,
} from "./models";

// Chat functions & types
export {
  callAgentAI, chatWithAgent, chatWithWorkspace,
} from "./chat";
export type { ChatMessage, ToolCallDisplay } from "./chat";

// Workspace context & prompt
export type { WorkspaceContext } from "./prompts";

// Streaming
export { streamChatWithWorkspace } from "./streaming";
export type { StreamCallbacks } from "./streaming";

// Generators
export { generateMeshConfig, generateAieosFromPrompt } from "./generators";
