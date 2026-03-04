/**
 * Job runtime utilities — pure helper functions used by useJobExecutor
 * to resolve references, apply input bindings, and route output mappings.
 * Extracted to eliminate duplication across serial / parallel / mixed modes.
 */

import type { CommandContext } from "@/services/commands/types";
import type { StepHandler } from "@/types/jobs";

// ── Reference Resolution ──────────────────────────

export interface RefContext {
  storage: Record<string, any>;
  deliverables: Record<string, any>;
  inputs: Record<string, string>;
}

/**
 * Recursively resolve $storage.key, $deliverable.key, and $input.name references.
 * - Whole-string references (e.g. "$storage.key") return the raw stored value (may be object/array).
 * - Embedded references within a larger string are interpolated in-place as strings.
 */
export function resolveRefs(value: any, refs: RefContext): any {
  if (typeof value === 'string') {
    // Whole-string exact match → return raw value (preserves non-string types)
    if (value.startsWith('$storage.') && !value.includes('\n') && !value.includes(' ')) {
      const key = value.slice('$storage.'.length);
      if (key in refs.storage) return refs.storage[key];
    }
    if (value.startsWith('$deliverable.') && !value.includes('\n') && !value.includes(' ')) {
      const key = value.slice('$deliverable.'.length);
      if (key in refs.deliverables) return refs.deliverables[key];
    }
    if (value.startsWith('$input.') && !value.includes('\n') && !value.includes(' ')) {
      const key = value.slice('$input.'.length);
      if (key in refs.inputs) return refs.inputs[key];
    }

    // Inline interpolation
    let resolved = value;
    resolved = resolved.replace(/\$storage\.([A-Za-z0-9_]+)/g, (_match, key) => {
      if (key in refs.storage) {
        const v = refs.storage[key];
        return typeof v === 'string' ? v : JSON.stringify(v);
      }
      return _match;
    });
    resolved = resolved.replace(/\$deliverable\.([A-Za-z0-9_]+)/g, (_match, key) => {
      if (key in refs.deliverables) {
        const v = refs.deliverables[key];
        return typeof v === 'string' ? v : JSON.stringify(v);
      }
      return _match;
    });
    resolved = resolved.replace(/\$input\.([A-Za-z0-9_]+)/g, (_match, key) => {
      if (key in refs.inputs) {
        const v = refs.inputs[key];
        return typeof v === 'string' ? v : JSON.stringify(v);
      }
      return _match;
    });
    return resolved;
  }
  if (Array.isArray(value)) return value.map(v => resolveRefs(v, refs));
  if (value && typeof value === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveRefs(v, refs);
    return out;
  }
  return value;
}

// ── Input Bindings ─────────────────────────────────

/**
 * Apply input bindings to step args, pulling values from storage or deliverables.
 * Returns a new args object with bindings resolved.
 */
export function applyInputBindings(
  args: Record<string, any>,
  inputBindings: Record<string, { source: string; sourceKey: string }> | undefined,
  storage: Record<string, any>,
  deliverables: Record<string, any>,
): Record<string, any> {
  const bound = { ...args };
  if (!inputBindings) return bound;
  for (const [argKey, binding] of Object.entries(inputBindings)) {
    if (binding.source === 'storage' && binding.sourceKey in storage) {
      bound[argKey] = storage[binding.sourceKey];
    } else if (binding.source === 'deliverable' && binding.sourceKey in deliverables) {
      bound[argKey] = deliverables[binding.sourceKey];
    }
  }
  return bound;
}

// ── Output Mappings ────────────────────────────────

/** Storage key prefix for staged deliverable content */
export const DELIVERABLE_STORAGE_PREFIX = '_deliverable_';

/**
 * Apply output mappings from a step result.
 *
 * **All outputs route to storage** — including deliverable-targeted mappings,
 * which are staged under `_deliverable_<key>` in shared storage.
 * A separate assembly phase later materialises artifacts from staged content.
 */
export function applyOutputMappings(
  mappings: Array<{ outputKey: string; target: string; targetKey: string }> | undefined,
  result: any,
  storage: Record<string, any>,
): void {
  if (!mappings || result == null) return;
  for (const mapping of mappings) {
    const outputValue = mapping.outputKey === '*'
      ? result
      : (typeof result === 'object' ? result[mapping.outputKey] : result);
    if (mapping.target === 'storage' && mapping.targetKey) {
      storage[mapping.targetKey] = outputValue;
    } else if (mapping.target === 'deliverable' && mapping.targetKey) {
      // Stage deliverable content into storage — assembly creates the artifact later
      storage[`${DELIVERABLE_STORAGE_PREFIX}${mapping.targetKey}`] = outputValue;
    }
  }
}

// ── Deliverable Assembly ───────────────────────────

/**
 * Assemble deliverables after all steps complete.
 *
 * Reads the job's declared deliverables, pulls staged content from storage
 * (`_deliverable_<key>` or an explicit `sourceStorageKey`), and creates
 * artifacts via `create_artifact` through the command registry.
 *
 * Only called when all steps succeeded (or failures were accepted via
 * `onFailure.continueOnFailure`).
 *
 * @returns Array of { key, artifactId } for each produced deliverable
 */
export async function assembleDeliverables(
  declaredDeliverables: Array<{ key: string; label: string; type: string; description?: string; sourceStorageKey?: string }>,
  storage: Record<string, any>,
  executeCommand: (commandId: string, args: Record<string, any>) => Promise<any>,
  addLog: (msg: string) => void,
): Promise<Array<{ key: string; artifactId: string }>> {
  const produced: Array<{ key: string; artifactId: string }> = [];

  for (const deliverable of declaredDeliverables) {
    // Resolve content from storage: explicit sourceStorageKey or default _deliverable_<key>
    const storageKey = deliverable.sourceStorageKey || `${DELIVERABLE_STORAGE_PREFIX}${deliverable.key}`;
    const content = storage[storageKey];

    if (content === undefined || content === null) {
      addLog(`⚠ Deliverable "${deliverable.label || deliverable.key}" skipped — no content in storage[${storageKey}]`);
      continue;
    }

    const contentStr = typeof content === 'string'
      ? content
      : JSON.stringify(content, null, 2);

    try {
      const result = await executeCommand('create_artifact', {
        name: deliverable.label || deliverable.key,
        type: deliverable.type || (typeof content === 'string' ? 'markdown' : 'json'),
        content: contentStr,
        tags: `deliverable:${deliverable.key},source:job`,
        description: deliverable.description || '',
        deliverableKey: deliverable.key,
      });

      const artifactId = result?.artifact?.id || storage.lastArtifactId;
      if (artifactId) {
        produced.push({ key: deliverable.key, artifactId });
      }
      addLog(`📦 Deliverable assembled: ${deliverable.label || deliverable.key}`);
    } catch (e: any) {
      addLog(`❌ Deliverable assembly failed for "${deliverable.key}": ${e.message}`);
    }
  }

  return produced;
}

// ── Condition Evaluation ───────────────────────────

/**
 * Evaluate a step condition expression. Returns true if the step should run.
 */
export function evaluateCondition(
  condition: string,
  context: CommandContext,
  steps: any[],
): boolean {
  try {
    const stepMap = steps.reduce((acc: any, s: any) => {
      acc[s.id] = s;
      if (s.name) acc[s.name] = s;
      return acc;
    }, {});
    // eslint-disable-next-line no-new-func
    const fn = new Function('steps', 'context', `return ${condition}`);
    return fn(stepMap, context);
  } catch (e) {
    console.warn(`Condition evaluation failed: ${condition}`, e);
    return false;
  }
}

// ── Step Context Override ──────────────────────────

/**
 * Build a step-scoped context that overrides model resolution if step has modelId.
 */
export function getStepContext(step: any, baseContext: CommandContext): CommandContext {
  if (!step.modelId) return baseContext;
  return {
    ...baseContext,
    system: {
      ...baseContext.system,
      getModelForCommand: () => step.modelId,
      getModelForAgent: () => step.modelId,
    },
  };
}

// ── Step Handler (onSuccess / onFailure) ───────────

/**
 * Context available when resolving handler refs.
 * Extends RefContext with $result.* (step output) and $error.* (failure info).
 */
export interface HandlerRefContext extends RefContext {
  /** The step's result value (available in onSuccess) */
  result?: any;
  /** The error message string (available in onFailure) */
  error?: string;
}

/**
 * Resolve handler-specific references: $result and $error in addition to
 * the standard $storage.*, $deliverable.*, $input.* refs.
 */
export function resolveHandlerRefs(value: any, refs: HandlerRefContext): any {
  if (typeof value === 'string') {
    // Whole-string exact match for $result / $error
    if (value === '$result' && refs.result !== undefined) return refs.result;
    if (value === '$error' && refs.error !== undefined) return refs.error;
    if (value.startsWith('$result.') && !value.includes('\n') && !value.includes(' ')) {
      const key = value.slice('$result.'.length);
      if (refs.result != null && typeof refs.result === 'object' && key in refs.result) {
        return refs.result[key];
      }
    }

    // Inline interpolation for $result and $error
    let resolved = value;
    resolved = resolved.replace(/\$result\.([A-Za-z0-9_]+)/g, (_match: string, key: string) => {
      if (refs.result != null && typeof refs.result === 'object' && key in refs.result) {
        const v = refs.result[key];
        return typeof v === 'string' ? v : JSON.stringify(v);
      }
      return _match;
    });
    resolved = resolved.replace(/\$result(?![.\w])/g, () => {
      if (refs.result !== undefined) {
        return typeof refs.result === 'string' ? refs.result : JSON.stringify(refs.result);
      }
      return '$result';
    });
    resolved = resolved.replace(/\$error(?![.\w])/g, () => {
      return refs.error ?? '$error';
    });

    // Delegate remaining $storage/$deliverable/$input to resolveRefs
    return resolveRefs(resolved, refs);
  }
  if (Array.isArray(value)) return value.map(v => resolveHandlerRefs(v, refs));
  if (value && typeof value === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveHandlerRefs(v, refs);
    return out;
  }
  return value;
}

export interface StepHandlerResult {
  /** Whether the handler executed without error */
  ok: boolean;
  /** If the handler ran a command, its result */
  commandResult?: any;
  /** Whether the job should continue after a failure (onFailure.continueOnFailure) */
  continueOnFailure: boolean;
  /** Whether the job should halt after success (onSuccess.haltAfterSuccess) */
  haltAfterSuccess: boolean;
  /** Log message from the handler */
  logMessage?: string;
}

/**
 * Execute a step handler (onSuccess or onFailure).
 *
 * @param handler   The StepHandler definition
 * @param refs      Handler ref context ($storage, $deliverable, $input, $result, $error)
 * @param storage   Mutable shared storage — handler.setStorage writes here
 * @param execute   Callback to run a command: (commandId, args) => Promise<result>
 * @param addLog    Callback to log a message
 */
export async function executeStepHandler(
  handler: StepHandler | undefined,
  refs: HandlerRefContext,
  storage: Record<string, any>,
  execute: (commandId: string, args: Record<string, any>) => Promise<any>,
  addLog: (msg: string) => void,
): Promise<StepHandlerResult> {
  if (!handler) {
    return { ok: true, continueOnFailure: false, haltAfterSuccess: false };
  }

  const result: StepHandlerResult = {
    ok: true,
    continueOnFailure: handler.continueOnFailure ?? false,
    haltAfterSuccess: handler.haltAfterSuccess ?? false,
  };

  try {
    // 1. Write storage values (resolved against handler refs)
    if (handler.setStorage) {
      for (const [key, val] of Object.entries(handler.setStorage)) {
        storage[key] = resolveHandlerRefs(val, refs);
      }
    }

    // 2. Log message (resolved against handler refs)
    if (handler.log) {
      const msg = resolveHandlerRefs(handler.log, refs);
      result.logMessage = typeof msg === 'string' ? msg : JSON.stringify(msg);
      addLog(result.logMessage);
    }

    // 3. Execute handler command (if specified)
    if (handler.commandId) {
      const resolvedArgs = resolveHandlerRefs(handler.args || {}, refs);
      result.commandResult = await execute(handler.commandId, resolvedArgs);
    }
  } catch (e: any) {
    result.ok = false;
    addLog(`Step handler error: ${e.message || e}`);
  }

  return result;
}
