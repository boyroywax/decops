/**
 * libp2p Bot Service — specialized sub-agent for the libp2p toolkit.
 *
 * Responsibilities:
 *  • Receive a natural language instruction (from chat or another agent).
 *  • Plan the sequence of libp2p commands needed.
 *  • Execute them via the registered command tools.
 *  • Summarize the outcome for the calling agent.
 *
 * The bot is automatically registered with the core AI delegation system
 * when this module is imported as a side-effect (see `register.ts`). Any
 * chat message matching {@link shouldDelegateToLibp2pBot} enhances the
 * system prompt so the LLM treats libp2p control as a first-class skill.
 */

import { libp2pService, DEFAULT_BOOTSTRAP } from "./service";
import type { ManagerSnapshot } from "./service";
import type {
    Libp2pBotStatus,
    Libp2pBotConfig,
    Libp2pBotRequest,
    Libp2pBotResponse,
    Libp2pBotOperation,
} from "./types/libp2pBot";
import { DEFAULT_LIBP2P_BOT_CONFIG } from "./types/libp2pBot";
import { getSelectedModel } from "@/services/ai/models";
import {
    getModelProvider,
    buildProviderRequest,
    parseProviderResponse,
    parseToolUseBlocks,
    buildToolResultMessages,
} from "@/services/ai/providers";
import { getAllTools, executeToolCall } from "@/services/commands/tools";
import type { CommandContext } from "@/services/commands/types";
import { registerChatDelegation } from "@/services/ai/delegation";

// ── Module state ──

let botStatus: Libp2pBotStatus = "idle";
let botConfig: Libp2pBotConfig = { ...DEFAULT_LIBP2P_BOT_CONFIG };
const requestLog: Libp2pBotResponse[] = [];

// ── Status / config accessors ──

export function getLibp2pBotStatus(): Libp2pBotStatus {
    return botStatus;
}

export function getLibp2pBotConfig(): Libp2pBotConfig {
    return { ...botConfig };
}

export function updateLibp2pBotConfig(patch: Partial<Libp2pBotConfig>): void {
    botConfig = { ...botConfig, ...patch };
}

export function getLibp2pBotLog(): Libp2pBotResponse[] {
    return [...requestLog];
}

// ── Tool filter ──

const LIBP2P_COMMAND_IDS = new Set([
    "libp2p_start", "libp2p_stop",
    "libp2p_dial", "libp2p_hangup", "libp2p_ping", "libp2p_list_peers", "libp2p_clear_peers",
    "libp2p_pubsub_subscribe", "libp2p_pubsub_unsubscribe", "libp2p_pubsub_publish",
    "libp2p_add_node", "libp2p_remove_node", "libp2p_set_active_node", "libp2p_rename_node",
    "libp2p_generate_identity", "libp2p_import_identity",
    "libp2p_export_identity", "libp2p_clear_identity",
    "libp2p_contact_add", "libp2p_contact_remove", "libp2p_contact_list", "libp2p_contact_dial",
    "libp2p_vault_store", "libp2p_vault_remove", "libp2p_vault_list",
    "libp2p_vault_load", "libp2p_vault_export_current",
]);

function getLibp2pTools() {
    return getAllTools().filter((t) => LIBP2P_COMMAND_IDS.has(t.name));
}

// ── System prompt ──

function buildLibp2pBotSystemPrompt(snap: ManagerSnapshot): string {
    const lines: string[] = [];
    lines.push("CURRENT NETWORK STATE:");
    lines.push(`- Active node id: ${snap.activeId ?? "(none)"}`);
    lines.push(`- Total nodes: ${snap.nodes.length}`);
    for (const n of snap.nodes) {
        const peers = n.peers.length;
        const connected = n.peers.filter((p) => p.connected).length;
        const peerId = n.peerId ? `${n.peerId.slice(0, 16)}…` : "(no peer id)";
        lines.push(
            `  • ${n.label} [${n.nodeId}] — ${n.status}, peer ${peerId}, ` +
            `${connected}/${peers} peers, ${n.topics.length} topic(s), ` +
            `${n.pubsubMessageCount} pubsub msg(s)`,
        );
        if (n.topics.length > 0) {
            lines.push(`    topics: ${n.topics.join(", ")}`);
        }
    }

    return `You are the **libp2p Bot**, a specialized sub-agent that controls the in-browser libp2p networking stack.

YOUR ROLE:
You are the dedicated peer-to-peer networking expert. The main AI assistant delegates to you whenever the user asks to manage libp2p nodes, peers, pubsub channels, identities, or contacts. You drive the libp2p toolkit programmatically through the registered tools.

CAPABILITIES YOU CONTROL:
═════════════════════════

**Node lifecycle**
- libp2p_start({ services?, transports?, discovery?, bootstrap?, disabledBootstrap?, nodeId? })
  → Boots the active (or named) node. Pass per-feature toggles to keep things lean.
  → services: { identify?, ping?, dcutr?, pubsub?, kadDht? } — defaults all true except kadDht.
  → transports: { webSockets?, webRTC?, circuitRelay? } — defaults all true. At least one is required.
  → discovery: { bootstrap?, pubsubPeerDiscovery? } — defaults all true.
  → disabledBootstrap: array of multiaddrs to skip from the default list.
- libp2p_stop({ nodeId? }) — stop the node.

**Multi-node**
- libp2p_add_node({ label? }) — spawn a new node (becomes active).
- libp2p_remove_node({ nodeId }) — stop and drop a node.
- libp2p_set_active_node({ nodeId }) — focus the UI/job context on a node.
- libp2p_rename_node({ nodeId?, label }).

**Peers**
- libp2p_list_peers({ nodeId?, connectedOnly? }) — read the peer book.
- libp2p_dial({ target, nodeId? }) — dial a peer id or multiaddr.
- libp2p_hangup({ peerId, nodeId? }).
- libp2p_ping({ peerId, nodeId? }).
- libp2p_clear_peers({ nodeId? }) — wipe the peer book (does not disconnect).

**Pubsub**
- libp2p_pubsub_subscribe({ topic, nodeId? }).
- libp2p_pubsub_unsubscribe({ topic, nodeId? }).
- libp2p_pubsub_publish({ topic, message, nodeId? }) — UTF-8 string body.

**Identity**
- libp2p_generate_identity({ nodeId? }) — fresh Ed25519 key (used on next start).
- libp2p_import_identity({ privateKey, nodeId? }) — base64 protobuf private key.
- libp2p_export_identity({ nodeId? }) — reveals the private key. ${botConfig.protectIdentities ? "REFUSE unless the user explicitly asked you to export it." : "Allowed."}
- libp2p_clear_identity({ nodeId? }).

**Contacts (peer book)**
- libp2p_contact_add / libp2p_contact_remove / libp2p_contact_list / libp2p_contact_dial.

**Vault (encrypted identity storage)**
- libp2p_vault_list / libp2p_vault_store / libp2p_vault_remove / libp2p_vault_load / libp2p_vault_export_current.

DEFAULT BOOTSTRAP PEERS (${DEFAULT_BOOTSTRAP.length}):
${DEFAULT_BOOTSTRAP.map((a) => `  - ${a}`).join("\n")}

OPERATING RULES:
════════════════
1. ALWAYS verify the node is "running" before peer/pubsub actions; the network state above tells you. ${botConfig.autoStartIfStopped ? "If stopped, you may call libp2p_start first." : "If stopped, ask the user to start it."}
2. Be conservative with toggles. Only disable services/transports the user asked to disable.
3. For dial-by-multiaddr requests, pass the full multiaddr untouched. For peer-id-only inputs, pass the peer id string.
4. When the user wants browser-only / minimal mode, prefer transports: { webSockets: true, webRTC: false, circuitRelay: false }, services: { dcutr: false, kadDht: false }.
5. Pubsub publish takes UTF-8 strings — JSON-encode structured payloads.
6. Identity export reveals secret key material. Treat it like a credential and never echo it in summaries.
7. After starting a node, mention the resulting peer id and listen multiaddrs in your summary.
8. Stick to the libp2p tool surface — do not call studio or other toolkit commands.

${lines.join("\n")}

OUTPUT STYLE:
- Be brief. Confirm what was done in 1–3 sentences.
- If a step failed, surface the error verbatim and suggest a remedy.
- If you skipped or refused something, say why.`;
}

// ── Main delegation entrypoint ──

/**
 * Standalone handler for libp2p bot requests. Mirrors handleStudioBotRequest
 * for parity, even though delegation usually happens via system-prompt
 * augmentation in the main chat loop.
 */
export async function handleLibp2pBotRequest(
    request: Libp2pBotRequest,
    commandContext: CommandContext,
): Promise<Libp2pBotResponse> {
    const startTime = Date.now();
    botStatus = "planning";
    const operations: Libp2pBotOperation[] = [];
    const suggestions: string[] = [];

    try {
        const snap = libp2pService.snapshot();
        const model = getSelectedModel();
        const provider = getModelProvider(model);

        const systemPrompt = buildLibp2pBotSystemPrompt(snap);
        const tools = (provider === "anthropic" || provider === "openai") ? getLibp2pTools() : [];

        const apiMessages: any[] = [
            { role: "user", content: request.instruction },
        ];

        botStatus = "executing";
        let finalText = "";

        for (let round = 0; round < botConfig.maxRounds; round++) {
            const req = buildProviderRequest(
                model,
                systemPrompt,
                apiMessages,
                4096,
                tools.length > 0 ? tools : undefined,
            );
            const response = await fetch(req.url, {
                method: "POST",
                headers: req.headers,
                body: JSON.stringify(req.body),
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData?.error?.message || `API request failed (${response.status})`);
            }
            const data = await response.json();
            const toolUseBlocks = parseToolUseBlocks(model, data);

            if (toolUseBlocks.length === 0) {
                finalText = parseProviderResponse(model, data);
                break;
            }

            const rawAssistant = provider === "openai"
                ? data.choices?.[0]?.message?.tool_calls
                : data.content;

            const toolResults: { id: string; content: string; isError?: boolean }[] = [];
            for (const block of toolUseBlocks) {
                const opIndex = operations.length;
                operations.push({
                    command: block.name,
                    args: block.input || {},
                    description: `Execute ${block.name}`,
                    order: opIndex,
                    status: "executing",
                });

                // Identity protection guard
                if (botConfig.protectIdentities && block.name === "libp2p_export_identity"
                    && request.source !== "user") {
                    operations[opIndex].status = "failed";
                    operations[opIndex].error = "Refused: identity export blocked by protectIdentities";
                    toolResults.push({
                        id: block.id,
                        content: JSON.stringify({ error: "identity export refused (protectIdentities=true)" }),
                        isError: true,
                    });
                    continue;
                }

                const result = await executeToolCall(
                    block.id,
                    block.name,
                    block.input || {},
                    commandContext,
                );

                operations[opIndex].status = result.error ? "failed" : "completed";
                operations[opIndex].result = result.result;
                operations[opIndex].error = result.error;

                const content = result.error
                    ? JSON.stringify({ error: result.error })
                    : JSON.stringify(result.result ?? { success: true });
                toolResults.push({ id: block.id, content, isError: !!result.error });
            }

            const resultMsgs = buildToolResultMessages(model, rawAssistant, toolResults);
            apiMessages.push(...resultMsgs);
        }

        // Post-execution review — surface a couple of suggestions.
        botStatus = "reviewing";
        const post = libp2pService.snapshot();
        const active = post.nodes.find((n) => n.nodeId === post.activeId);
        if (active) {
            if (active.status === "running" && active.peers.length === 0) {
                suggestions.push("Node is running but no peers discovered yet — give bootstrap a moment, or dial a known peer.");
            }
            if (active.status === "running" && !active.hasPersistedIdentity) {
                suggestions.push("This node has no persisted identity. Use libp2p_generate_identity then libp2p_vault_store to keep the peer id stable.");
            }
        }

        botStatus = "idle";
        const response: Libp2pBotResponse = {
            requestId: request.id,
            summary: finalText || `Completed ${operations.length} libp2p operation(s)`,
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
        const response: Libp2pBotResponse = {
            requestId: request.id,
            summary: `libp2p Bot error: ${msg}`,
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
 * Heuristic — should the main chat delegate to the libp2p bot?
 * Triggered by explicit libp2p / p2p networking phrasing. Tuned to avoid
 * collisions with the studio bot (which owns "job" / "canvas" terminology).
 */
export function shouldDelegateToLibp2pBot(message: string): boolean {
    const m = message.toLowerCase();
    const patterns: RegExp[] = [
        /\blibp2p\b/,
        /\bp2p\s+(node|peer|network|connection|identity)\b/,
        /\bpeer.?to.?peer\b/,
        /\bgossipsub\b/,
        /\bpubsub\b/,
        /\bmultiaddr\b/,
        /\bpeer\s+id\b/,
        /\bbootstrap\s+peer\b/,
        /\bcircuit\s+relay\b/,
        /\bdcutr\b/,
        /\bwebrtc\s+(transport|peer)\b/,
        /\b(dial|ping|hang.?up)\s+(a\s+)?peer\b/,
        /\b(subscribe|publish)\s+to\s+(a\s+)?topic\b/,
        /\bstart\s+(the\s+)?(libp2p|p2p)\s*(node|network)?\b/,
        /\bstop\s+(the\s+)?(libp2p|p2p)\s*(node|network)?\b/,
    ];
    return patterns.some((p) => p.test(m));
}

// ── Self-registration ──

registerChatDelegation({
    id: "libp2p-bot",
    check: shouldDelegateToLibp2pBot,
    enhance: (systemPrompt) =>
        systemPrompt +
        "\n\n[LIBP2P BOT ACTIVE] This request involves the libp2p networking toolkit. " +
        "Use only the libp2p_* tools. Confirm the active node's status before peer or pubsub actions. " +
        "Be conservative with feature toggles — only disable services/transports the user explicitly asked to disable. " +
        "Treat exported private keys as credentials; never echo them back in summaries.",
    maxRounds: 12,
});
