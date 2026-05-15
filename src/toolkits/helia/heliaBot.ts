/**
 * Helia Bot Service — specialized sub-agent for the Helia/IPFS toolkit.
 *
 * Mirrors `libp2pBot.ts`: registers a system-prompt enhancer with the
 * chat-delegation system so the main LLM treats IPFS-by-CID operations as
 * a first-class skill. The bot is allowed to delegate down to the libp2p
 * bot's tool surface (transitively) because Helia composes on top of
 * libp2p.
 */

import { heliaService } from "./service";
import { libp2pService } from "@/toolkits/libp2p/service";
import type {
    HeliaBotStatus,
    HeliaBotConfig,
    HeliaBotRequest,
    HeliaBotResponse,
    HeliaBotOperation,
} from "./types/heliaBot";
import { DEFAULT_HELIA_BOT_CONFIG } from "./types/heliaBot";
import { getSelectedModel } from "@/services/ai/models";
import { getModelProvider } from "@/services/ai/providers";
import { runChatTurn } from "@/services/ai/runner";
import { getAllTools } from "@/services/commands/tools";
import type { CommandContext } from "@/services/commands/types";
import { registerChatDelegation } from "@/services/ai/delegation";

// ── Module state ──

let botStatus: HeliaBotStatus = "idle";
let botConfig: HeliaBotConfig = { ...DEFAULT_HELIA_BOT_CONFIG };
const requestLog: HeliaBotResponse[] = [];

export function getHeliaBotStatus(): HeliaBotStatus { return botStatus; }
export function getHeliaBotConfig(): HeliaBotConfig { return { ...botConfig }; }
export function updateHeliaBotConfig(patch: Partial<HeliaBotConfig>): void {
    botConfig = { ...botConfig, ...patch };
}
export function getHeliaBotLog(): HeliaBotResponse[] { return [...requestLog]; }

// ── Tool filter ── (helia tools + a subset of libp2p tools for the underlying node)

const HELIA_COMMAND_IDS = new Set([
    "helia_start", "helia_stop",
    "helia_add_node", "helia_remove_node", "helia_set_active_node", "helia_rename_node",
    "helia_set_libp2p",
    "helia_add_text", "helia_add_json", "helia_cat",
    "helia_pin", "helia_unpin",
    "helia_list_entries", "helia_clear_entries",
    // Transitive libp2p tools so the bot can prep the network layer.
    "libp2p_start", "libp2p_stop", "libp2p_add_node", "libp2p_set_active_node", "libp2p_list_peers",
]);

function getHeliaTools() {
    return getAllTools().filter((t) => HELIA_COMMAND_IDS.has(t.name));
}

// ── System prompt ──

function buildHeliaBotSystemPrompt(): string {
    const snap = heliaService.snapshot();
    const libp2pSnap = libp2pService.snapshot();
    const lines: string[] = [];
    lines.push("CURRENT HELIA STATE:");
    lines.push(`- Active helia node: ${snap.activeId ?? "(none)"}`);
    lines.push(`- Total helia nodes: ${snap.nodes.length}`);
    for (const n of snap.nodes) {
        const peer = n.peerId ? `${n.peerId.slice(0, 16)}…` : "(no peer id)";
        const bind = n.libp2pNodeId ?? "(auto-create on start)";
        lines.push(
            `  • ${n.label} [${n.nodeId}] — ${n.status}, libp2p ${bind}, peer ${peer}, ` +
            `${n.entries.length} entr(ies), ${n.pinnedCount} pinned`,
        );
    }
    lines.push("");
    lines.push("AVAILABLE LIBP2P NODES (use one of these ids when calling `libp2pNodeId`):");
    if (libp2pSnap.nodes.length === 0) lines.push("  (none — helia_start will auto-create one)");
    for (const n of libp2pSnap.nodes) {
        lines.push(`  • ${n.label} [${n.nodeId}] — ${n.status}`);
    }

    return `You are the **Helia Bot**, a specialized sub-agent that controls the in-browser Helia (IPFS) stack.

YOUR ROLE:
You are the dedicated IPFS / content-addressed storage expert. The main AI assistant delegates to you whenever the user asks to add content to IPFS, fetch a CID, pin/unpin blocks, or manage Helia nodes. Helia composes on top of libp2p — if the user has running libp2p instances you can attach to one; otherwise the start command auto-creates a fresh libp2p node.

CAPABILITIES YOU CONTROL:
═════════════════════════

**Node lifecycle**
- helia_start({ libp2pNodeId?, newLibp2pLabel?, nodeId? })
  → Starts a Helia node. Set \`libp2pNodeId\` to attach to an existing libp2p
    node; omit it to auto-create one (the user picked nothing in the UI).
- helia_stop({ nodeId? })

**Multi-node**
- helia_add_node({ label?, libp2pNodeId? })
- helia_remove_node({ nodeId })
- helia_set_active_node({ nodeId })
- helia_rename_node({ nodeId?, label })

**libp2p binding**
- helia_set_libp2p({ libp2pNodeId?, nodeId? }) — only valid when the helia node is stopped.

**Content**
- helia_add_text({ text, label?, nodeId? }) → returns { cid, bytes }
- helia_add_json({ value, label?, nodeId? }) → returns { cid, bytes } (dag-json)
- helia_cat({ cid, nodeId? }) → returns { cid, text, bytes }

**Pins**
- helia_pin({ cid, nodeId? })
- helia_unpin({ cid, nodeId? })

**Inventory**
- helia_list_entries({ nodeId? })
- helia_clear_entries({ nodeId? })

**libp2p control** (for the underlying network layer):
- libp2p_start({ nodeId? }) — start the libp2p node Helia is bound to.
- libp2p_stop({ nodeId? }) — stop it (will stop Helia too).
- libp2p_add_node({ label? }) — create a fresh libp2p node, useful before \`helia_set_libp2p\`.
- libp2p_set_active_node, libp2p_list_peers.

OPERATING RULES:
════════════════
1. ALWAYS verify the helia node is "running" before content actions. ${botConfig.autoStartIfStopped ? "If stopped, you may call helia_start first." : "If stopped, ask the user to start it."}
2. When the user hasn't picked a libp2p node and ${botConfig.autoCreateLibp2p ? "the toolkit is configured to auto-create one" : "you must not auto-create"}, ${botConfig.autoCreateLibp2p ? "call helia_start without libp2pNodeId to spawn a fresh libp2p node." : "ask the user to pick a libp2p node first."}
3. Helia binding can only change while the helia node is stopped. Stop, rebind, then start.
4. CIDs are case-sensitive. Pass them verbatim.
5. JSON values for helia_add_json must be JSON-serialisable. For raw text, prefer helia_add_text.
6. After adding content, mention the resulting CID and a short summary in your reply.
7. Stick to the helia + libp2p tool surface — do not call studio or other toolkit commands.

${lines.join("\n")}

OUTPUT STYLE:
- Be brief. Confirm what was done in 1–3 sentences.
- Always quote the CID(s) you produced or fetched.
- If a step failed, surface the error verbatim and suggest a remedy.`;
}

// ── Main delegation entrypoint ──

export async function handleHeliaBotRequest(
    request: HeliaBotRequest,
    commandContext: CommandContext,
): Promise<HeliaBotResponse> {
    const startTime = Date.now();
    botStatus = "planning";
    const operations: HeliaBotOperation[] = [];
    const suggestions: string[] = [];

    try {
        const model = getSelectedModel();
        const provider = getModelProvider(model);
        const systemPrompt = buildHeliaBotSystemPrompt();
        const tools = (provider === "anthropic" || provider === "openai") ? getHeliaTools() : [];

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
        const post = heliaService.snapshot();
        const active = post.nodes.find((n) => n.nodeId === post.activeId);
        if (active) {
            if (active.status === "running" && active.entries.length === 0) {
                suggestions.push("Helia is running but no content yet — try helia_add_text to add something.");
            }
            if (active.status === "stopped" && !active.libp2pNodeId) {
                suggestions.push("No libp2p instance is bound — start with helia_start (no libp2pNodeId) to auto-create one, or pick a running libp2p node first.");
            }
        }

        botStatus = "idle";
        const response: HeliaBotResponse = {
            requestId: request.id,
            summary: finalText || `Completed ${operations.length} helia operation(s)`,
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
        const response: HeliaBotResponse = {
            requestId: request.id,
            summary: `Helia Bot error: ${msg}`,
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

/**
 * Heuristic — should the main chat delegate to the helia bot?
 * Triggered by explicit IPFS / CID / Helia phrasing. Tuned to avoid
 * collisions with the libp2p bot (which owns peer / pubsub terminology).
 */
export function shouldDelegateToHeliaBot(message: string): boolean {
    const m = message.toLowerCase();
    const patterns: RegExp[] = [
        /\bhelia\b/,
        /\bipfs\b/,
        /\bcid\b/,
        /\bcontent.?addressed\b/,
        /\bunixfs\b/,
        /\bdag.?json\b/,
        /\bpin\s+(this|the|a)\s+(block|cid|file)\b/,
        /\bfetch\s+(cid|by\s+cid)\b/,
        /\badd\s+(this|the|a)\s+(file|content)\s+to\s+ipfs\b/,
        /\bbafy[a-z0-9]{6,}/,         // raw CID v1 hint
        /\bqm[a-zA-Z0-9]{20,}/,        // raw CID v0 hint
    ];
    return patterns.some((p) => p.test(m));
}

// ── Self-registration ──

registerChatDelegation({
    id: "helia-bot",
    check: shouldDelegateToHeliaBot,
    enhance: (systemPrompt) =>
        systemPrompt + "\n\n" + buildHeliaBotSystemPrompt(),
    maxRounds: 12,
});
