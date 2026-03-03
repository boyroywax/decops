/**
 * Model selection helpers — read/write the user's chosen LLM model
 * from localStorage, with per-entity overrides.
 * Extracted from services/ai.ts for modularity.
 */

import { DEFAULT_MODEL } from "./providers";

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
