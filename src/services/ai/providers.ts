/**
 * Provider infrastructure — constants, detection, API keys,
 * request/response builders, tool-use helpers.
 * Extracted from services/ai.ts for modularity.
 */

export const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
export const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
export const DEFAULT_MODEL = "claude-sonnet-4-20250514";
export const ANTHROPIC_VERSION = "2023-06-01";

/** Detect provider from model ID */
export function getModelProvider(modelId: string): "anthropic" | "google" | "openai" | "ollama" {
  if (modelId.startsWith("ollama:")) return "ollama";
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

/** Get the API key for the detected provider of a model */
export function getApiKeyForModel(model: string): string {
  const provider = getModelProvider(model);
  switch (provider) {
    case "openai": return getOpenAIApiKey();
    case "google": return getGoogleApiKey();
    case "anthropic": return getApiKey();
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
    const instances = JSON.parse(localStorage.getItem("ollama_instances") || "[]");
    const inst = instances.find((i: any) => i.id === instanceId);
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
  body: any;
}

/** Build a non-streaming request for any provider */
export function buildProviderRequest(
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
export function parseProviderResponse(model: string, data: any): string {
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
export function parseToolUseBlocks(model: string, data: any): any[] {
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
export function buildToolResultMessages(model: string, assistantContent: any, toolResults: { id: string; content: string; isError?: boolean }[]): any[] {
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
