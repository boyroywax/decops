/**
 * Job runtime utilities — pure helper functions used by useJobExecutor
 * to resolve references, apply input bindings, and route output mappings.
 * Extracted to eliminate duplication across serial / parallel / mixed modes.
 */

import type { CommandContext } from "@/services/commands/types";

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

/**
 * Apply output mappings from a step result, writing to storage or producing deliverables.
 */
export function applyOutputMappings(
  mappings: Array<{ outputKey: string; target: string; targetKey: string }> | undefined,
  result: any,
  storage: Record<string, any>,
  addDeliverable: CommandContext['addDeliverable'],
): void {
  if (!mappings || result == null) return;
  for (const mapping of mappings) {
    const outputValue = mapping.outputKey === '*'
      ? result
      : (typeof result === 'object' ? result[mapping.outputKey] : result);
    if (mapping.target === 'storage' && mapping.targetKey) {
      storage[mapping.targetKey] = outputValue;
    } else if (mapping.target === 'deliverable' && mapping.targetKey) {
      addDeliverable({
        key: mapping.targetKey,
        name: mapping.targetKey,
        type: typeof outputValue === 'string' ? 'markdown' : 'json',
        content: typeof outputValue === 'string' ? outputValue : JSON.stringify(outputValue, null, 2),
      });
    }
  }
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
