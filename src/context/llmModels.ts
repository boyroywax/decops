/**
 * LLM model catalogs and localStorage key constants
 */

import type { LLMModel } from "../types/llm";

export const ANTHROPIC_MODELS: LLMModel[] = [
  { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", desc: "Best balance of speed and intelligence", tier: "recommended", provider: "anthropic" },
  { id: "claude-opus-4-20250514", label: "Claude Opus 4", desc: "Most capable model for complex tasks", tier: "premium", provider: "anthropic" },
  { id: "claude-haiku-3-5-20241022", label: "Claude 3.5 Haiku", desc: "Fastest and most affordable", tier: "fast", provider: "anthropic" },
  { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet", desc: "Previous generation balanced model", tier: "standard", provider: "anthropic" },
];

export const GOOGLE_MODELS: LLMModel[] = [
  { id: "imagen-4.0-generate-001", label: "Imagen 4.0", desc: "Image generation (portraits & badges)", tier: "image", provider: "google" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", desc: "Fast multimodal reasoning", tier: "fast", provider: "google" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", desc: "Advanced reasoning and coding", tier: "premium", provider: "google" },
];

export const OPENAI_MODELS: LLMModel[] = [
  { id: "gpt-4.1", label: "GPT-4.1", desc: "Most capable GPT model", tier: "premium", provider: "openai" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 Mini", desc: "Balanced speed and intelligence", tier: "recommended", provider: "openai" },
  { id: "gpt-4.1-nano", label: "GPT-4.1 Nano", desc: "Fastest and most affordable", tier: "fast", provider: "openai" },
  { id: "gpt-4o", label: "GPT-4o", desc: "Fast multimodal model", tier: "standard", provider: "openai" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini", desc: "Small and fast for simple tasks", tier: "fast", provider: "openai" },
  { id: "o3", label: "o3", desc: "Advanced reasoning model", tier: "premium", provider: "openai" },
  { id: "o4-mini", label: "o4-mini", desc: "Fast reasoning model", tier: "fast", provider: "openai" },
];

export const LS_KEYS = {
  anthropicKey: "anthropic_api_key",
  anthropicModel: "anthropic_model",
  chatModel: "llm_chat_model",
  imageModel: "llm_image_model",
  geminiKey: "gemini_api_key",
  openaiKey: "openai_api_key",
  ollamaInstances: "ollama_instances",
  groupModels: "llm_group_models",
  agentModels: "llm_agent_models",
  commandModels: "llm_command_models",
} as const;

export const DEFAULT_MODEL = "claude-sonnet-4-20250514";
export const DEFAULT_IMAGE_MODEL = "imagen-4.0-generate-001";
