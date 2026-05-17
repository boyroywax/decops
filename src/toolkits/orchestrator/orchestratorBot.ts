/**
 * Orchestrator Bot — specialised sub-agent that drives the four L.O.H.K
 * toolkits via the orchestrator manifest workflow. Mirrors `kuboBot.ts`.
 */

import { orchestratorService } from "./service";
import type {
    OrchestratorBotStatus,
    OrchestratorBotConfig,
    OrchestratorBotRequest,
    OrchestratorBotResponse,
    OrchestratorBotOperation,
} from "./types/orchestratorBot";
import { DEFAULT_ORCHESTRATOR_BOT_CONFIG } from "./types/orchestratorBot";
import { getSelectedModel } from "@/services/ai/models";
import { getModelProvider } from "@/services/ai/providers";
import { runChatTurn } from "@/services/ai/runner";
import { getAllTools } from "@/services/commands/tools";
import type { CommandContext } from "@/services/commands/types";
import { registerChatDelegation } from "@/services/ai/delegation";

// ── Module state ──

let botStatus: OrchestratorBotStatus = "idle";
let botConfig: OrchestratorBotConfig = { ...DEFAULT_ORCHESTRATOR_BOT_CONFIG };
const requestLog: OrchestratorBotResponse[] = [];

export function getOrchestratorBotStatus(): OrchestratorBotStatus { return botStatus; }
export function getOrchestratorBotConfig(): OrchestratorBotConfig { return { ...botConfig }; }
export function updateOrchestratorBotConfig(patch: Partial<OrchestratorBotConfig>): void {
    botConfig = { ...botConfig, ...patch };
}
export function getOrchestratorBotLog(): OrchestratorBotResponse[] { return [...requestLog]; }

// ── Tool filter ──

const ORCHESTRATOR_COMMAND_IDS = new Set([
    "orchestrator_add_node",
    "orchestrator_remove_node",
    "orchestrator_set_active_node",
    "orchestrator_rename_node",
    "orchestrator_set_manifest",
    "orchestrator_apply_manifest",
    "orchestrator_reconcile",
    "orchestrator_export_manifest",
    "orchestrator_save_manifest_to_artifact",
    "orchestrator_load_manifest",
    "orchestrator_status",
    "orchestrator_clear_results",
]);

function getOrchestratorTools() {
    return getAllTools().filter((t) => ORCHESTRATOR_COMMAND_IDS.has(t.name));
}

// ── System prompt ──

function buildOrchestratorBotSystemPrompt(): string {
    const snap = orchestratorService.snapshot();
    const lines: string[] = [];
    lines.push("CURRENT ORCHESTRATOR STATE:");
    lines.push(`- Active stack: ${snap.activeId ?? "(none)"}`);
    lines.push(`- Total stacks: ${snap.nodes.length}`);
    for (const n of snap.nodes) {
        lines.push(
            `  • ${n.label} [${n.nodeId}] — ${n.status}, manifest ${n.manifestArtifactId ?? "(none)"}` +
            `${n.manifestName ? ` ("${n.manifestName}" v${n.manifestVersion})` : ""}` +
            `, ${n.results.length} result(s), drift=${n.pendingDrift}`,
        );
    }

    return `You are the **Orchestrator Bot**, a specialised sub-agent that drives the four L.O.H.K toolkits (libp2p, helia, orbitdb, kubo) toward a declared desired state.

YOUR ROLE:
The main AI assistant delegates to you when the user wants to apply, reconcile, export, or otherwise manage a multi-toolkit stack as a unit. You are the only sub-agent allowed to apply manifest files. Manifests are stored as workspace artifacts (type "json", tagged "orchestrator" + "manifest"); you reference them by artifact id.

THE MANIFEST:
Manifests follow a kubectl-style schema. A minimal example:
{
  "apiVersion": "orchestrator.decops.io/v1",
  "kind": "Stack",
  "metadata": {
    "name": "production",
    "namespace": "default",
    "labels":      { "decops.io/toolkit": "orchestrator" },
    "annotations": { "decops.io/description": "Production L.O.H.K stack" }
  },
  "spec": {
    "libp2p":  [ { "name": "node-a", "autoStart": true,
                   "services": { "identify": true, "pubsub": true },
                   "transports": { "webSockets": true, "webRTC": true } } ],
    "helia":   [ { "name": "h1", "autoStart": true, "libp2pRef": "node-a" } ],
    "orbitdb": [ { "name": "o1", "autoStart": false, "heliaRef": "h1" } ],
    "kubo":    [ { "name": "k1", "autoStart": true,
                   "url": "http://127.0.0.1:5001", "timeoutMs": 5000 } ]
  },
  "status": { "phase": "healthy" }
}
- "spec.<target>[].name" is both the manifest-local id AND the runtime node label.
- "autoStart" means the orchestrator will run start() (or connect() for kubo) after creation.
- "libp2pRef" / "heliaRef" reference another spec by its name (resolved at apply time).
- All other fields on each spec mirror the corresponding L.O.H.K toolkit's
  start/connect options exactly (Libp2pStartOptions, HeliaStartOptions,
  OrbitdbStartOptions, KuboConnectOptions).

CAPABILITIES YOU CONTROL:
═════════════════════════
**Stack profiles**
- orchestrator_add_node({ label? })
- orchestrator_remove_node({ nodeId })
- orchestrator_set_active_node({ nodeId })
- orchestrator_rename_node({ nodeId, label })

**Manifest linking**
- orchestrator_set_manifest({ nodeId?, artifactId }) — point the profile at an existing JSON artifact.

**Apply / Reconcile**
- orchestrator_apply_manifest({ nodeId? }) — create missing sub-nodes & start them where requested. This is the only mutating operation that spans multiple toolkits.
- orchestrator_reconcile({ nodeId? }) — non-mutating drift report.

**Export & save**
- orchestrator_export_manifest({ name? }) — snapshot the live state into a manifest object.
- orchestrator_save_manifest_to_artifact({ nodeId?, name? }) — export AND save as a JSON artifact, then link it.
- orchestrator_load_manifest({ nodeId? }) — read & parse the manifest currently linked.

**Status / log**
- orchestrator_status({ nodeId? })
- orchestrator_clear_results({ nodeId? })

OPERATING RULES:
════════════════
1. NEVER call libp2p_*, helia_*, orbitdb_*, or kubo_* tools directly. Your job is to orchestrate them through the manifest. If the user asks for a one-off lower-level operation, decline and suggest the specialised sub-agent instead.
2. Before applying a manifest, call orchestrator_status to confirm a manifest is linked. If none is linked, ask the user to point you at one (orchestrator_set_manifest), or offer to export the current state via orchestrator_save_manifest_to_artifact.
3. ${botConfig.reconcileAfterApply ? "After every apply, immediately call orchestrator_reconcile and report drift." : "Reconcile only when the user asks."}.
4. ${botConfig.allowExportToArtifact ? "You MAY save manifests as artifacts via orchestrator_save_manifest_to_artifact." : "You MUST NOT create artifacts; only consume existing ones."}
5. When reporting results, group by target (libp2p / helia / orbitdb / kubo) and quote the action ("created", "started", "noop", "failed") with the runtime node id.
6. The orchestrator does not store manifest content — it stores only an artifact id. Treat the artifacts subsystem as the source of truth.

${lines.join("\n")}

OUTPUT STYLE:
- Be brief. Confirm what was done in 1–3 sentences.
- Always state the active profile name, the manifest name+version (when known), and the operation count.
- If an operation failed, surface the error verbatim and suggest a remedy (manifest mis-binding, missing label, sub-toolkit error).`;
}

// ── Main delegation entrypoint ──

export async function handleOrchestratorBotRequest(
    request: OrchestratorBotRequest,
    commandContext: CommandContext,
): Promise<OrchestratorBotResponse> {
    const startTime = Date.now();
    botStatus = "planning";
    const operations: OrchestratorBotOperation[] = [];
    const suggestions: string[] = [];

    try {
        const model = getSelectedModel();
        const provider = getModelProvider(model);
        const systemPrompt = buildOrchestratorBotSystemPrompt();
        const tools = (provider === "anthropic" || provider === "openai") ? getOrchestratorTools() : [];

        botStatus = "executing";

        const result = await runChatTurn(
            {
                model,
                systemPrompt,
                messages: [{ role: "user", content: request.instruction }],
                tools: tools.length > 0 ? tools : undefined,
                commandContext,
                maxRounds: botConfig.maxRounds,
            },
            {
                onToolCallStart: (name, input) => {
                    operations.push({
                        command: name,
                        args: input,
                        description: `Execute ${name}`,
                        order: operations.length,
                        status: "executing",
                    });
                },
                onToolCallComplete: (display) => {
                    for (let i = operations.length - 1; i >= 0; i--) {
                        if (operations[i].command === display.name && operations[i].status === "executing") {
                            operations[i].status = display.error ? "failed" : "completed";
                            operations[i].result = display.result;
                            operations[i].error = display.error;
                            break;
                        }
                    }
                },
            },
        );
        const finalText = result.text;

        botStatus = "reviewing";
        const post = orchestratorService.snapshot();
        const active = post.nodes.find((n) => n.nodeId === post.activeId);
        if (active) {
            if (!active.manifestArtifactId) {
                suggestions.push("No manifest linked — orchestrator_save_manifest_to_artifact to capture the current state.");
            } else if (active.status === "drifted") {
                suggestions.push("Drift detected — orchestrator_apply_manifest to converge, or update the manifest.");
            } else if (active.status === "error" && active.error) {
                suggestions.push(`Last error: ${active.error}`);
            }
        }

        botStatus = "idle";
        const response: OrchestratorBotResponse = {
            requestId: request.id,
            summary: finalText || `Completed ${operations.length} orchestrator operation(s)`,
            operations,
            suggestions,
            success: true,
            duration_ms: Date.now() - startTime,
        };
        requestLog.push(response);
        return response;
    } catch (err) {
        botStatus = "error";
        const msg = err instanceof Error ? err.message : String(err);
        const response: OrchestratorBotResponse = {
            requestId: request.id,
            summary: `Orchestrator Bot error: ${msg}`,
            operations,
            suggestions,
            success: false,
            error: msg,
            duration_ms: Date.now() - startTime,
        };
        requestLog.push(response);
        setTimeout(() => { botStatus = "idle"; }, 2000);
        return response;
    }
}

// ── Delegation matcher ──

export function shouldDelegateToOrchestratorBot(message: string): boolean {
    const m = message.toLowerCase();
    const patterns: RegExp[] = [
        /\borchestrat(or|e|ion|ing)\b/,
        /\bmanifest\b/,
        /\bapply\s+(the\s+)?(manifest|stack|state|desired)\b/,
        /\breconcile\b/,
        /\bdrift\b/,
        /\bdesired\s+state\b/,
        /\bdeploy\s+(the\s+)?(stack|lohk|l\.o\.h\.k)\b/,
        /\blohk\b/,
        /\bl\.o\.h\.k\b/,
        /\bbring\s+up\s+(the\s+)?(stack|environment)\b/,
        /\btear\s+down\s+(the\s+)?(stack|environment)\b/,
    ];
    return patterns.some((p) => p.test(m));
}

// ── Self-registration ──

registerChatDelegation({
    id: "orchestrator-bot",
    check: shouldDelegateToOrchestratorBot,
    enhance: (systemPrompt) => systemPrompt + "\n\n" + buildOrchestratorBotSystemPrompt(),
    maxRounds: 15,
});
