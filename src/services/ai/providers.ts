/**
 * Provider infrastructure — constants, detection, API keys,
 * request/response builders, tool-use helpers.
 * Extracted from services/ai.ts for modularity.
 */

export const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
export const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
export const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
export const DEFAULT_MODEL = "claude-sonnet-4-20250514";
export const ANTHROPIC_VERSION = "2023-06-01";

/** Detect provider from model ID */
export function getModelProvider(modelId: string): "anthropic" | "google" | "openai" | "ollama" | "openrouter" {
  if (modelId.startsWith("ollama:")) return "ollama";
  if (modelId.startsWith("openrouter:")) return "openrouter";
  if (modelId.startsWith("gpt-") || modelId.startsWith("o3") || modelId.startsWith("o4")) return "openai";
  if (modelId.startsWith("gemini") || modelId.startsWith("imagen")) return "google";
  return "anthropic";
}

/** Read the user's saved API key from localStorage */
export function getApiKey(): string {
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
export function getGoogleApiKey(): string {
  const key = localStorage.getItem("gemini_api_key");
  if (!key) {
    throw new Error(
      "No Google API key configured. Go to LLM Manager → Providers to add your API key."
    );
  }
  return key;
}

/** Read the OpenRouter API key from localStorage */
export function getOpenRouterApiKey(): string {
  const key = localStorage.getItem("openrouter_api_key");
  if (!key) {
    throw new Error(
      "No OpenRouter API key configured. Go to LLM Manager → Providers to add your API key."
    );
  }
  return key;
}

/** Get the API key for the detected provider of a model */
export function getApiKeyForModel(model: string): string {
  const provider = getModelProvider(model);
  switch (provider) {
    case "openai": return getOpenAIApiKey();
    case "google": return getGoogleApiKey();
    case "anthropic": return getApiKey();
    case "openrouter": return getOpenRouterApiKey();
    case "ollama": return ""; // Ollama doesn't need a key
  }
}

/** Get Ollama base URL for a model ID (format: ollama:instanceId:modelName) */
export function getOllamaEndpoint(modelId: string): { baseUrl: string; model: string } {
  const parts = modelId.split(":");
  if (parts.length < 3) throw new Error("Invalid Ollama model ID format");
  const instanceId = parts[1];
  const modelName = parts.slice(2).join(":");
  try {
    const instances = JSON.parse(localStorage.getItem("ollama_instances") || "[]") as Array<{ id: string; baseUrl: string }>;
    const inst = instances.find((i) => i.id === instanceId);
    if (!inst) throw new Error(`Ollama instance ${instanceId} not found`);
    return { baseUrl: inst.baseUrl, model: modelName };
  } catch (e) {
    if (e instanceof Error && e.message.includes("not found")) throw e;
    throw new Error("Failed to read Ollama instances from storage");
  }
}

export function buildHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
    "anthropic-dangerous-direct-browser-access": "true",
  };
}

// ── Provider-aware request helpers ─────────────────

export interface ProviderRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** Tool definition as accepted by the provider request builder (Anthropic-shaped). */
export interface ProviderTool {
  name: string;
  description?: string;
  input_schema?: Record<string, unknown>;
}

/**
 * A message accepted by the provider request builder. Content may be a plain
 * string or an array of provider-shaped content blocks (Anthropic tool_use,
 * tool_result, etc.). The builder forwards it as-is to the underlying API.
 * Additional provider-specific fields (e.g. OpenAI tool_calls, tool_call_id)
 * are allowed via the index signature.
 */
export interface ProviderMessage {
  role: string;
  content: unknown;
  [key: string]: unknown;
}

/** Build a non-streaming request for any provider */
export function buildProviderRequest(
  model: string,
  systemPrompt: string,
  messages: ProviderMessage[],
  maxTokens: number,
  tools?: ProviderTool[],
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

  if (provider === "openrouter") {
    const apiKey = getOpenRouterApiKey();
    // Strip "openrouter:" prefix → "org/model"
    const routerModel = model.replace(/^openrouter:/, "");
    return {
      url: OPENROUTER_API_URL,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": globalThis.location?.origin || "https://mesh.decops.dev",
        "X-Title": "MESH",
      },
      body: {
        model: routerModel,
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
export function parseProviderResponse(model: string, data: unknown): string {
  const provider = getModelProvider(model);
  const d = (data ?? {}) as {
    choices?: Array<{ message?: { content?: string } }>;
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    message?: { content?: string };
    content?: Array<{ text?: string }>;
  };

  if (provider === "openai" || provider === "openrouter") {
    return d.choices?.[0]?.message?.content || "";
  }
  if (provider === "google") {
    return d.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  }
  if (provider === "ollama") {
    return d.message?.content || "";
  }
  // Anthropic
  return d.content?.map((b) => b.text || "").join("") || "";
}

/** Normalized tool-use block (Anthropic-shaped). */
export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** Check if a response contains tool use (returns blocks for Anthropic/OpenAI/OpenRouter, empty for others) */
export function parseToolUseBlocks(model: string, data: unknown): ToolUseBlock[] {
  const provider = getModelProvider(model);
  const d = (data ?? {}) as {
    content?: Array<{ type?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
    choices?: Array<{ message?: { tool_calls?: Array<{ id: string; function?: { name?: string; arguments?: string } }> } }>;
  };
  if (provider === "anthropic") {
    return (d.content || [])
      .filter((b) => b.type === "tool_use")
      .map((b) => ({ type: "tool_use", id: b.id || "", name: b.name || "", input: b.input || {} }));
  }
  if (provider === "openai" || provider === "openrouter") {
    const toolCalls = d.choices?.[0]?.message?.tool_calls || [];
    // Normalize to Anthropic-like format for compatibility
    return toolCalls.map((tc) => ({
      type: "tool_use" as const,
      id: tc.id,
      name: tc.function?.name || "",
      input: JSON.parse(tc.function?.arguments || "{}") as Record<string, unknown>,
    }));
  }
  return []; // Google/Ollama: no tool support in this layer
}

/** Build tool result messages for the next API round */
export function buildToolResultMessages(
  model: string,
  assistantContent: unknown,
  toolResults: { id: string; content: string; isError?: boolean }[],
): ProviderMessage[] {
  const provider = getModelProvider(model);

  if (provider === "openai" || provider === "openrouter") {
    // OpenAI/OpenRouter: assistant message with tool_calls, then individual tool messages
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
