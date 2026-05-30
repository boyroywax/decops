import { toolkitRegistry } from "@/services/toolkits";

const TOOLKIT_ID = "workspace-rag";
const TOOLKIT_CONFIG_STORAGE_KEY = "decops:toolkit-config:v1";

export interface WorkspaceRagPolicy {
  autoIndexEnabled: boolean;
  debounceMs: number;
  messageBatchSize: number;
  queryFreshnessMaxAgeMs: number;
}

const DEFAULT_POLICY: WorkspaceRagPolicy = {
  autoIndexEnabled: true,
  debounceMs: 600,
  messageBatchSize: 12,
  queryFreshnessMaxAgeMs: 12000,
};

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function readStoredToolkitConfig(): Record<string, unknown> {
  if (typeof globalThis === "undefined" || !globalThis.localStorage) return {};
  try {
    const raw = globalThis.localStorage.getItem(TOOLKIT_CONFIG_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>;
    return parsed?.[TOOLKIT_ID] || {};
  } catch {
    return {};
  }
}

export function getWorkspaceRagPolicy(): WorkspaceRagPolicy {
  const module = toolkitRegistry.get(TOOLKIT_ID);
  const runtimeValues = module?.configuration?.values || {};
  const storedValues = readStoredToolkitConfig();

  const merged = {
    ...DEFAULT_POLICY,
    ...runtimeValues,
    ...storedValues,
  } as Record<string, unknown>;

  return {
    autoIndexEnabled: merged.autoIndexEnabled !== false,
    debounceMs: clampNumber(merged.debounceMs, DEFAULT_POLICY.debounceMs, 100, 60000),
    messageBatchSize: clampNumber(merged.messageBatchSize, DEFAULT_POLICY.messageBatchSize, 1, 1000),
    queryFreshnessMaxAgeMs: clampNumber(
      merged.queryFreshnessMaxAgeMs,
      DEFAULT_POLICY.queryFreshnessMaxAgeMs,
      1000,
      300000,
    ),
  };
}
