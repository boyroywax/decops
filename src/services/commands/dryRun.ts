/**
 * Dry-Run Engine
 *
 * Validates commands and jobs without executing them.
 * Returns a structured report of what would happen, including:
 *   - Argument validation (required, type, custom)
 *   - Entity name → ID resolution
 *   - Known potential errors from the error catalogue
 *   - Warnings & suggestions
 *   - For multi-step jobs: per-step preflight with condition evaluation
 */

import { getCommandErrors, type CommandError } from "./commandErrors";
import type { CommandDefinition, CommandArg } from "./types";
import type { JobStep } from "@/types";
import { DELIVERABLE_STORAGE_PREFIX } from "@/utils/jobRuntime";

/** Shape of an entity that findEntity looks up — needs id and (optionally) name. */
interface NamedEntity {
  id: string;
  name?: string;
}

/* ─── Result Types ───────────────────────────────────────────────────── */

export type CheckStatus = "pass" | "fail" | "warn" | "skip";

/** A single validation check performed during dry-run */
export interface DryRunCheck {
  label: string;
  status: CheckStatus;
  message: string;
  detail?: string;
}

/** Result of dry-running a single command */
export interface DryRunResult {
  valid: boolean;
  commandId: string;
  commandFound: boolean;
  resolvedArgs: Record<string, unknown>;
  checks: DryRunCheck[];
  potentialErrors: CommandError[];
  warnings: string[];
  summary: string;
}

/** Result of dry-running one step in a multi-step job */
export interface DryRunStepResult {
  stepId: string;
  stepIndex: number;
  stepName?: string;
  commandId: string;
  conditionMet: boolean | null; // null = no condition
  result: DryRunResult;
}

/** Result of dry-running an entire job */
export interface DryRunJobResult {
  valid: boolean;
  mode: "serial" | "parallel" | "single";
  steps: DryRunStepResult[];
  unresolvedRefs: string[];
  summary: string;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  warningCount: number;
}

/* ─── Helpers ────────────────────────────────────────────────────────── */

/** Check if a value is empty (undefined, null, empty string, empty array) */
function isEmpty(val: unknown): boolean {
  if (val === undefined || val === null) return true;
  if (typeof val === "string" && val.trim() === "") return true;
  if (Array.isArray(val) && val.length === 0) return true;
  return false;
}

/** Find entity by name or ID in collection */
function findEntity(
  value: string,
  entities: NamedEntity[] | undefined,
): { found: boolean; resolvedId?: string; resolvedName?: string } {
  if (!entities || !value) return { found: false };
  const byId = entities.find((e) => e.id === value);
  if (byId) return { found: true, resolvedId: byId.id, resolvedName: byId.name };
  const byName = entities.find(
    (e) => e.name?.toLowerCase() === value.toLowerCase(),
  );
  if (byName) return { found: true, resolvedId: byName.id, resolvedName: byName.name };
  return { found: false };
}

/** Get the entity collection for an arg type from context */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getEntityCollection(argType: string, context: any): NamedEntity[] | undefined {
  switch (argType) {
    case "agent": {
      const agents = (context?.workspace?.agents ?? []) as NamedEntity[];
      // Also include agents from ecosystem networks
      const nets = (context?.ecosystem?.networks ?? []) as Array<{ agents?: NamedEntity[] }>;
      const netAgents: NamedEntity[] = nets.flatMap((n) => n.agents ?? []);
      const storageAgents = (context?.storage?._agents ?? []) as NamedEntity[];
      return [...agents, ...netAgents, ...storageAgents];
    }
    case "group":
      return context?.workspace?.groups as NamedEntity[] | undefined;
    case "channel":
      return context?.workspace?.channels as NamedEntity[] | undefined;
    case "network":
      return context?.ecosystem?.networks as NamedEntity[] | undefined;
    default:
      return undefined;
  }
}

/** Find $storage, $deliverable, $input references in args (both whole-string and embedded) */
function findUnresolvedRefs(
  args: Record<string, unknown>,
  storage: Record<string, unknown>,
  deliverables: Record<string, unknown>,
  inputs: Record<string, unknown>,
): string[] {
  const unresolved: string[] = [];

  const check = (val: unknown) => {
    if (typeof val === "string") {
      // Check whole-string refs
      if (val.startsWith("$storage.") && !val.includes('\n') && !val.includes(' ')) {
        const key = val.slice("$storage.".length);
        if (!(key in storage)) unresolved.push(val);
        return;
      }
      if (val.startsWith("$deliverable.") && !val.includes('\n') && !val.includes(' ')) {
        const key = val.slice("$deliverable.".length);
        if (!(key in deliverables)) unresolved.push(val);
        return;
      }
      if (val.startsWith("$input.") && !val.includes('\n') && !val.includes(' ')) {
        const key = val.slice("$input.".length);
        if (!(key in inputs)) unresolved.push(val);
        return;
      }
      // Check embedded refs within larger strings
      const storageRefs = val.match(/\$storage\.([A-Za-z0-9_]+)/g) || [];
      for (const ref of storageRefs) {
        const key = ref.slice("$storage.".length);
        if (!(key in storage)) unresolved.push(ref);
      }
      const delivRefs = val.match(/\$deliverable\.([A-Za-z0-9_]+)/g) || [];
      for (const ref of delivRefs) {
        const key = ref.slice("$deliverable.".length);
        if (!(key in deliverables)) unresolved.push(ref);
      }
      const inputRefs = val.match(/\$input\.([A-Za-z0-9_]+)/g) || [];
      for (const ref of inputRefs) {
        const key = ref.slice("$input.".length);
        if (!(key in inputs)) unresolved.push(ref);
      }
    } else if (Array.isArray(val)) {
      val.forEach(check);
    } else if (val && typeof val === "object") {
      Object.values(val as Record<string, unknown>).forEach(check);
    }
  };

  Object.values(args).forEach(check);
  return unresolved;
}

/* ─── Command Dry-Run ────────────────────────────────────────────────── */

/**
 * Dry-run a single command: validates args, resolves entities,
 * checks types, runs custom validators — without calling execute().
 */
export function dryRunCommand(
  command: CommandDefinition | undefined,
  commandId: string,
  args: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
): DryRunResult {
  const checks: DryRunCheck[] = [];
  const warnings: string[] = [];
  const resolvedArgs: Record<string, unknown> = { ...args };

  // ── 1. Command exists? ──
  if (!command) {
    checks.push({
      label: "Command lookup",
      status: "fail",
      message: `Command "${commandId}" not found in registry`,
    });
    return {
      valid: false,
      commandId,
      commandFound: false,
      resolvedArgs,
      checks,
      potentialErrors: [],
      warnings,
      summary: `Command "${commandId}" does not exist.`,
    };
  }

  checks.push({
    label: "Command lookup",
    status: "pass",
    message: `/${command.id} found`,
    detail: command.description,
  });

  // ── 2. Batch detection ──
  const isBatch = "items" in command.args && args.items != null;
  if (isBatch) {
    checks.push({
      label: "Batch mode",
      status: "pass",
      message: `Batch mode detected — ${Array.isArray(args.items) ? args.items.length : "?"} items`,
    });
  }

  // ── 3. Entity name → ID resolution ──
  const entityTypes = new Set(["agent", "group", "channel", "network"]);
  for (const [argName, argDef] of Object.entries(command.args)) {
    const value = resolvedArgs[argName];
    if (typeof value === "string" && entityTypes.has(argDef.type)) {
      const entities = getEntityCollection(argDef.type, context);
      const lookup = findEntity(value, entities);
      if (lookup.found) {
        resolvedArgs[argName] = lookup.resolvedId!;
        checks.push({
          label: `Resolve ${argName}`,
          status: "pass",
          message: `"${value}" → ${lookup.resolvedId}`,
          detail: lookup.resolvedName ? `Name: ${lookup.resolvedName}` : undefined,
        });
      } else {
        checks.push({
          label: `Resolve ${argName}`,
          status: "warn",
          message: `"${value}" not found in ${argDef.type} list`,
          detail: `No ${argDef.type} with ID or name "${value}" exists in the current workspace`,
        });
        warnings.push(`${argDef.type} "${value}" could not be resolved — command may fail at runtime`);
      }
    }
  }

  // ── 4. Required argument checks ──
  for (const [argName, argDef] of Object.entries(command.args)) {
    const value = resolvedArgs[argName];

    if (isEmpty(value)) {
      if (argDef.defaultValue !== undefined) {
        resolvedArgs[argName] = argDef.defaultValue;
        checks.push({
          label: `Arg: ${argName}`,
          status: "pass",
          message: `Default applied: ${JSON.stringify(argDef.defaultValue)}`,
        });
      } else if (argDef.required !== false && !(isBatch && argName !== "items")) {
        checks.push({
          label: `Arg: ${argName}`,
          status: "fail",
          message: `Missing required argument`,
          detail: argDef.description,
        });
      } else {
        checks.push({
          label: `Arg: ${argName}`,
          status: "skip",
          message: `Optional — not provided`,
        });
      }
    } else {
      // ── 5. Type checking ──
      let typeOk = true;
      let typeMsg = "";
      const val = resolvedArgs[argName];

      if (argDef.type === "string" && typeof val !== "string") {
        typeOk = false;
        typeMsg = `Expected string, got ${typeof val}`;
      } else if (argDef.type === "number" && typeof val !== "number") {
        // Allow string-encoded numbers (will be coerced)
        if (typeof val === "string" && !isNaN(Number(val))) {
          checks.push({
            label: `Type: ${argName}`,
            status: "warn",
            message: `String "${val}" will be coerced to number ${Number(val)}`,
          });
          warnings.push(`Arg "${argName}": string will be coerced to number`);
          typeOk = true;
        } else {
          typeOk = false;
          typeMsg = `Expected number, got ${typeof val}`;
        }
      } else if (argDef.type === "boolean" && typeof val !== "boolean") {
        typeOk = false;
        typeMsg = `Expected boolean, got ${typeof val}`;
      } else if (argDef.type === "array" && !Array.isArray(val)) {
        typeOk = false;
        typeMsg = `Expected array, got ${typeof val}`;
      }

      if (!typeOk) {
        checks.push({
          label: `Type: ${argName}`,
          status: "fail",
          message: typeMsg,
        });
      } else if (!typeMsg) {
        checks.push({
          label: `Type: ${argName}`,
          status: "pass",
          message: `${typeof val} ✓`,
        });
      }

      // ── 6. Enum validation ──
      if (argDef.enum && val !== undefined && val !== null) {
        if (argDef.enum.includes(String(val))) {
          checks.push({
            label: `Enum: ${argName}`,
            status: "pass",
            message: `"${val}" is a valid option`,
          });
        } else {
          checks.push({
            label: `Enum: ${argName}`,
            status: "fail",
            message: `"${val}" not in allowed values: ${argDef.enum.join(", ")}`,
          });
        }
      }

      // ── 7. Custom validation ──
      if (argDef.validation && val !== undefined) {
        try {
          const result = argDef.validation(val);
          if (result === true) {
            checks.push({
              label: `Validate: ${argName}`,
              status: "pass",
              message: "Custom validation passed",
            });
          } else {
            checks.push({
              label: `Validate: ${argName}`,
              status: "fail",
              message: typeof result === "string" ? result : "Custom validation failed",
            });
          }
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          checks.push({
            label: `Validate: ${argName}`,
            status: "fail",
            message: `Validation threw: ${message}`,
          });
        }
      }
    }
  }

  // ── 8. Unknown args (not in definition) ──
  const definedArgNames = new Set(Object.keys(command.args));
  for (const key of Object.keys(args)) {
    if (!definedArgNames.has(key)) {
      checks.push({
        label: `Unknown arg: ${key}`,
        status: "warn",
        message: `Argument "${key}" is not defined in command schema — will be ignored`,
      });
      warnings.push(`Unknown argument "${key}"`);
    }
  }

  // ── 9. Potential errors from catalogue ──
  const potentialErrors = getCommandErrors(commandId);

  // ── 10. AI model check ──
  if (command.usesAI) {
    const modelId = context?.system?.getModelForCommand?.(commandId);
    if (modelId) {
      checks.push({
        label: "AI model",
        status: "pass",
        message: `Will use model: ${modelId}`,
      });
    } else {
      checks.push({
        label: "AI model",
        status: "warn",
        message: "No AI model configured — command may fail if it requires LLM inference",
      });
      warnings.push("AI model not configured for this command");
    }

    // Check for API key
    const apiKey = typeof localStorage !== "undefined" ? localStorage.getItem("anthropic_api_key") : null;
    const geminiKey = typeof localStorage !== "undefined" ? localStorage.getItem("gemini_api_key") : null;
    if (!apiKey && !geminiKey) {
      checks.push({
        label: "API key",
        status: "warn",
        message: "No API key found — AI commands will fail without a valid key",
      });
      warnings.push("No API key configured");
    } else {
      checks.push({
        label: "API key",
        status: "pass",
        message: "API key found",
      });
    }
  }

  // ── Build summary ──
  const failed = checks.filter((c) => c.status === "fail").length;
  const warned = checks.filter((c) => c.status === "warn").length;
  const passed = checks.filter((c) => c.status === "pass").length;
  const valid = failed === 0;

  let summary: string;
  if (valid && warned === 0) {
    summary = `✓ All ${passed} checks passed — command is ready to execute.`;
  } else if (valid) {
    summary = `✓ ${passed} checks passed, ${warned} warning${warned !== 1 ? "s" : ""} — command can execute but review warnings.`;
  } else {
    summary = `✗ ${failed} check${failed !== 1 ? "s" : ""} failed, ${warned} warning${warned !== 1 ? "s" : ""} — command will fail.`;
  }

  return {
    valid,
    commandId,
    commandFound: true,
    resolvedArgs,
    checks,
    potentialErrors,
    warnings,
    summary,
  };
}

/* ─── Job Dry-Run ────────────────────────────────────────────────────── */

/**
 * Dry-run an entire job: validates every step, checks conditions,
 * traces input bindings and $ref resolution.
 */
export function dryRunJob(
  steps: JobStep[],
  mode: "serial" | "parallel",
  getCommand: (id: string) => CommandDefinition | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  storage: Record<string, unknown> = {},
  deliverableKeys: string[] = [],
  inputMap: Record<string, string> = {},
): DryRunJobResult {
  const stepResults: DryRunStepResult[] = [];
  const allUnresolvedRefs: string[] = [];

  // Simulated storage that builds up during serial dry-run
  const simStorage: Record<string, unknown> = { ...storage };
  const simDeliverables: Record<string, unknown> = {};
  for (const key of deliverableKeys) simDeliverables[key] = `<pending:${key}>`;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    // ── Condition check ──
    let conditionMet: boolean | null = null;
    if (step.condition) {
      try {
        // Build evaluation context similar to executor
        const stepMap = steps.reduce<Record<string, JobStep>>((acc, s) => {
          acc[s.id] = s;
          if (s.name) acc[s.name] = s;
          return acc;
        }, {});
        // eslint-disable-next-line no-new-func
        const fn = new Function("steps", "context", `return ${step.condition}`);
        conditionMet = Boolean(fn(stepMap, context));
      } catch {
        conditionMet = false;
      }
    }

    // ── Apply input bindings ──
    const boundArgs: Record<string, unknown> = { ...step.args };
    if (step.inputBindings) {
      for (const [argKey, binding] of Object.entries(step.inputBindings)) {
        if (binding.source === "storage" && binding.sourceKey in simStorage) {
          boundArgs[argKey] = simStorage[binding.sourceKey];
        } else if (binding.source === "deliverable" && binding.sourceKey in simDeliverables) {
          boundArgs[argKey] = simDeliverables[binding.sourceKey];
        } else {
          // Binding source not yet available
          boundArgs[argKey] = `<unresolved:${binding.source}.${binding.sourceKey}>`;
        }
      }
    }

    // ── Check for unresolved $refs ──
    const unresolvedRefs = findUnresolvedRefs(boundArgs, simStorage, simDeliverables, inputMap);
    allUnresolvedRefs.push(...unresolvedRefs);

    // Resolve $input.* refs that ARE available
    for (const [key, val] of Object.entries(boundArgs)) {
      if (typeof val === "string" && val.startsWith("$input.")) {
        const inputKey = val.slice("$input.".length);
        if (inputKey in inputMap) {
          boundArgs[key] = inputMap[inputKey];
        }
      }
    }

    // ── Dry-run the command ──
    const command = getCommand(step.commandId);
    const cmdResult = dryRunCommand(command, step.commandId, boundArgs, context);

    // ── Validate onSuccess / onFailure handler commands ──
    for (const [handlerKey, label] of [['onSuccess', 'onSuccess'], ['onFailure', 'onFailure']] as const) {
      const handler = (step as JobStep & Record<string, unknown>)[handlerKey] as { commandId?: string } | undefined;
      if (handler?.commandId) {
        const handlerCmd = getCommand(handler.commandId);
        if (!handlerCmd) {
          cmdResult.checks.push({
            label: `${label} handler command`,
            status: 'fail',
            message: `Handler command "${handler.commandId}" not found`,
          });
          cmdResult.valid = false;
        } else {
          cmdResult.checks.push({
            label: `${label} handler command`,
            status: 'pass',
            message: `Handler command "${handler.commandId}" exists`,
          });
        }
      }
    }

    // If serial mode and step has output mappings,
    // simulate outputs being available to later steps
    if (mode === "serial" && step.outputMappings) {
      for (const mapping of step.outputMappings) {
        if (mapping.target === "storage") {
          simStorage[mapping.targetKey] = `<output:step-${i}.${mapping.outputKey}>`;
        } else if (mapping.target === "deliverable") {
          // Deliverable mappings now stage to storage with prefix (matching runtime)
          simStorage[`${DELIVERABLE_STORAGE_PREFIX}${mapping.targetKey}`] = `<output:step-${i}.${mapping.outputKey}>`;
          // Also keep simDeliverables populated for $deliverable.key ref resolution
          simDeliverables[mapping.targetKey] = `<output:step-${i}.${mapping.outputKey}>`;
        }
      }
    }

    stepResults.push({
      stepId: step.id,
      stepIndex: i,
      stepName: step.name,
      commandId: step.commandId,
      conditionMet,
      result: cmdResult,
    });
  }

  // ── Aggregate ──
  const allChecks = stepResults.flatMap((s) => s.result.checks);
  const totalChecks = allChecks.length;
  const passedChecks = allChecks.filter((c) => c.status === "pass").length;
  const failedChecks = allChecks.filter((c) => c.status === "fail").length;
  const warningCount = allChecks.filter((c) => c.status === "warn").length;
  const valid = failedChecks === 0;

  const stepsValid = stepResults.filter((s) => s.result.valid).length;
  const stepsTotal = stepResults.length;

  let summary: string;
  if (valid && warningCount === 0) {
    summary = `✓ All ${stepsTotal} step${stepsTotal !== 1 ? "s" : ""} passed preflight (${passedChecks}/${totalChecks} checks).`;
  } else if (valid) {
    summary = `✓ ${stepsValid}/${stepsTotal} steps valid, ${warningCount} warning${warningCount !== 1 ? "s" : ""} — job can execute but review warnings.`;
  } else {
    summary = `✗ ${stepsTotal - stepsValid}/${stepsTotal} step${stepsTotal - stepsValid !== 1 ? "s" : ""} will fail (${failedChecks} failed check${failedChecks !== 1 ? "s" : ""}).`;
  }

  if (allUnresolvedRefs.length > 0) {
    summary += ` ${allUnresolvedRefs.length} unresolved reference${allUnresolvedRefs.length !== 1 ? "s" : ""}.`;
  }

  return {
    valid,
    mode: steps.length === 0 ? "single" : mode,
    steps: stepResults,
    unresolvedRefs: [...new Set(allUnresolvedRefs)],
    summary,
    totalChecks,
    passedChecks,
    failedChecks,
    warningCount,
  };
}
