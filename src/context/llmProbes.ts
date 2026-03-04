/**
 * LLM provider liveness probes — pure async functions
 */

import type { ProviderId, LLMModel } from "@/types/llm";

export async function probeAnthropic(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
    });
    // 200 = success, 429 = rate limited (still reachable)
    return res.ok || res.status === 429;
  } catch {
    return false;
  }
}

export async function probeGoogle(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { method: "GET" },
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function probeOpenAI(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
    return res.ok || res.status === 429;
  } catch {
    return false;
  }
}

export async function probeOllama(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/version`, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchOllamaModelTags(baseUrl: string, instanceId: string, instanceLabel: string): Promise<LLMModel[]> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { method: "GET" });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.models || !Array.isArray(data.models)) return [];
    return data.models.map((m: any) => ({
      id: `ollama:${instanceId}:${m.name}`,
      label: m.name,
      desc: m.details
        ? `${m.details.parameter_size || ""} \u2022 ${m.details.family || ""} \u2022 ${m.details.quantization_level || ""}`.replace(/\s*\u2022\s*$/g, "")
        : "Local model",
      tier: "local",
      provider: "ollama" as ProviderId,
      groupKey: `ollama-${instanceId}`,
      groupLabel: `Ollama \u2014 ${instanceLabel}`,
    }));
  } catch {
    return [];
  }
}
