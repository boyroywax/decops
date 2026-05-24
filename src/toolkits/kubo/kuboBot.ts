/**
 * Kubo Bot Service — specialised sub-agent for the Kubo IPFS Connector.
 *
 * Mirrors `heliaBot.ts`: registers a delegation entry with the
 * chat-delegation system so the main LLM treats remote-IPFS / Kubo
 * pinning operations as a first-class skill.
 */

import { kuboService } from "./service";
import type {
    KuboBotStatus,
    KuboBotConfig,
    KuboBotRequest,
    KuboBotResponse,
    KuboBotOperation,
} from "./types/kuboBot";
import { DEFAULT_KUBO_BOT_CONFIG } from "./types/kuboBot";
import { getSelectedModel } from "@/services/ai/models";
import { getModelProvider } from "@/services/ai/providers";
import { runChatTurn } from "@/services/ai/runner";
import { getAllCommandTools } from "@/services/commands/tools";
import type { CommandContext } from "@/services/commands/types";
import { registerChatDelegation } from "@/services/ai/delegation";

// ── Module state ──

let botStatus: KuboBotStatus = "idle";
let botConfig: KuboBotConfig = { ...DEFAULT_KUBO_BOT_CONFIG };
const requestLog: KuboBotResponse[] = [];

export function getKuboBotStatus(): KuboBotStatus { return botStatus; }
export function getKuboBotConfig(): KuboBotConfig { return { ...botConfig }; }
export function updateKuboBotConfig(patch: Partial<KuboBotConfig>): void {
    botConfig = { ...botConfig, ...patch };
}
export function getKuboBotLog(): KuboBotResponse[] { return [...requestLog]; }

// ── Tool filter ──

const KUBO_COMMAND_IDS = new Set([
    "kubo_connect", "kubo_disconnect",
    "kubo_add_node", "kubo_remove_node", "kubo_set_active_node", "kubo_rename_node", "kubo_set_endpoint",
    "kubo_id", "kubo_version",
    "kubo_add_text", "kubo_add_json", "kubo_add_bytes",
    "kubo_cat", "kubo_ls",
    "kubo_pin", "kubo_unpin", "kubo_list_pins",
    "kubo_swarm_peers", "kubo_swarm_connect",
    "kubo_list_entries", "kubo_clear_entries",
]);

function getKuboTools() {
    return getAllCommandTools().filter((t) => KUBO_COMMAND_IDS.has(t.name));
}

// ── System prompt ──

function buildKuboBotSystemPrompt(): string {
    const snap = kuboService.snapshot();
    const lines: string[] = [];
    lines.push("CURRENT KUBO STATE:");
    lines.push(`- Active node: ${snap.activeId ?? "(none)"}`);
    lines.push(`- Total nodes: ${snap.nodes.length}`);
    for (const n of snap.nodes) {
        const peer = n.peer?.peerId ? `${n.peer.peerId.slice(0, 16)}…` : "(no peer id)";
        lines.push(
            `  • ${n.label} [${n.nodeId}] — ${n.status}, ${n.endpoint}, peer ${peer}, ` +
            `${n.entries.length} entr(ies), ${n.pinnedCount} pinned`,
        );
    }

    return `You are the **Kubo Bot**, a specialised sub-agent that controls the Kubo IPFS Connector.

YOUR ROLE:
You are the dedicated remote-IPFS expert. The main AI assistant delegates to you when the user wants to talk to a real Kubo (go-ipfs) daemon — add files for production-grade pinning, pin existing CIDs on a server, fetch content from a remote node, or inspect the daemon's swarm. Unlike the Helia bot (in-browser node), you operate over the Kubo HTTP RPC API and can pin to long-running infrastructure.

CAPABILITIES YOU CONTROL:
═════════════════════════

**Connection lifecycle**
- kubo_connect({ nodeId?, url?, authorization?, timeoutMs? })
  → Handshakes with the remote daemon via \`id()\`. \`url\` overrides the configured endpoint.
- kubo_disconnect({ nodeId? }) — drops the local client; does NOT stop the remote daemon.
- kubo_set_endpoint({ nodeId?, url?, authorization?, timeoutMs? }) — only while disconnected.

**Multi-node**
- kubo_add_node({ label?, url? })
- kubo_remove_node({ nodeId })
- kubo_set_active_node({ nodeId })
- kubo_rename_node({ nodeId, label })

**Identity / status**
- kubo_id({ nodeId? }) — refresh the remote peer identity.
- kubo_version({ nodeId? }) — report remote Kubo version.

**Content**
- kubo_add_text({ text, label?, pin?, nodeId? }) → { cid, bytes, pinned }
- kubo_add_json({ value, label?, pin?, nodeId? })
- kubo_add_bytes({ base64, label?, pin?, nodeId? }) — base64-encoded payload
- kubo_cat({ cid, nodeId? }) → { cid, text, bytes }
- kubo_ls({ cid, nodeId? }) → directory listing

**Pinning** (the killer feature of this toolkit — persists CIDs against GC on the remote node)
- kubo_pin({ cid, recursive?, name?, nodeId? })
- kubo_unpin({ cid, recursive?, nodeId? })
- kubo_list_pins({ filter?, nodeId? }) — filter: recursive | direct | indirect | all

**Swarm**
- kubo_swarm_peers({ nodeId? }) — list connected peers.
- kubo_swarm_connect({ multiaddr, nodeId? }) — dial a peer.

**Activity log**
- kubo_list_entries({ nodeId? }) — local cache of CIDs added/fetched via this UI.
- kubo_clear_entries({ nodeId? })

OPERATING RULES:
════════════════
1. ALWAYS verify the active node's status is "connected" before content/pin actions. ${botConfig.autoConnectIfDisconnected ? "If it is disconnected, call kubo_connect first." : "If it is disconnected, ask the user to connect."}
2. By default, \`kubo_add_*\` pins on the remote daemon (Kubo's own default). ${botConfig.autoPinOnAdd ? "Leave \`pin\` unset unless the user explicitly says otherwise." : "Pass \`pin: false\` unless the user explicitly asks to pin."}
3. CIDs are case-sensitive. Pass them verbatim. Paths may be in the form \`/ipfs/<cid>/sub/path\`.
4. The default endpoint is \`http://127.0.0.1:5001\` (the standard local Kubo RPC port). Public gateways usually expose only the read-only HTTP gateway (port 8080) — they will NOT accept these calls. If kubo_connect fails with a network error, suggest checking the URL and that the daemon's RPC API is reachable (CORS enabled for browser use).
5. After adding content, quote the resulting CID. After pinning, confirm the pin name (if any) and recursion mode.
6. Stick to the kubo_* tool surface — do not call helia_* / libp2p_* / studio commands.

${lines.join("\n")}

OUTPUT STYLE:
- Be brief. Confirm what was done in 1–3 sentences.
- Always quote the CID(s) you produced, fetched, pinned, or unpinned.
- If a step failed, surface the error verbatim and suggest a remedy (check URL, check CORS, check auth header).`;
}

// ── Main delegation entrypoint ──

export async function handleKuboBotRequest(
    request: KuboBotRequest,
    commandContext: CommandContext,
): Promise<KuboBotResponse> {
    const startTime = Date.now();
    botStatus = "planning";
    const operations: KuboBotOperation[] = [];
    const suggestions: string[] = [];

    try {
        const model = getSelectedModel();
        const provider = getModelProvider(model);
        const systemPrompt = buildKuboBotSystemPrompt();
        const tools = (provider === "anthropic" || provider === "openai") ? getKuboTools() : [];

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
        const post = kuboService.snapshot();
        const active = post.nodes.find((n) => n.nodeId === post.activeId);
        if (active) {
            if (active.status === "disconnected") {
                suggestions.push("Active Kubo node is disconnected — kubo_connect to attach to the daemon.");
            } else if (active.status === "error" && active.error) {
                suggestions.push(`Last connection error: ${active.error}. Verify the API URL and that the daemon is reachable.`);
            }
            if (active.status === "connected" && active.entries.length === 0) {
                suggestions.push("Connected but no activity yet — try kubo_add_text or kubo_list_pins.");
            }
        }

        botStatus = "idle";
        const response: KuboBotResponse = {
            requestId: request.id,
            summary: finalText || `Completed ${operations.length} kubo operation(s)`,
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
        const response: KuboBotResponse = {
            requestId: request.id,
            summary: `Kubo Bot error: ${msg}`,
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
 * Heuristic — should the main chat delegate to the kubo bot?
 * Targets phrasing that implies talking to a *remote* IPFS daemon or
 * pinning CIDs server-side, to avoid stepping on the Helia bot's domain
 * (which owns in-browser IPFS / generic CID semantics).
 */
export function shouldDelegateToKuboBot(message: string): boolean {
    const m = message.toLowerCase();
    const patterns: RegExp[] = [
        /\bkubo\b/,
        /\bgo[-\s]?ipfs\b/,
        /\bremote\s+ipfs\b/,
        /\bipfs\s+daemon\b/,
        /\bipfs\s+(api|rpc)\b/,
        /\bpin\s+(this|the|a)?\s*cid\s+(on|to)\s+(the\s+)?(server|node|kubo|daemon|remote)\b/,
        /\bpin\s+remotely\b/,
        /\bpinning\s+service\b/,
        /\b127\.0\.0\.1:5001\b/,
        /\b:5001\b/,
        /\bkubo[-\s]?rpc\b/,
    ];
    return patterns.some((p) => p.test(m));
}

// ── Self-registration ──

registerChatDelegation({
    id: "kubo-bot",
    check: shouldDelegateToKuboBot,
    enhance: (systemPrompt) => systemPrompt + "\n\n" + buildKuboBotSystemPrompt(),
    maxRounds: 12,
});
