/**
 * OrbitDB Bot Service — specialized sub-agent for the OrbitDB toolkit.
 *
 * Mirrors `heliaBot.ts`: registers a system-prompt enhancer with the
 * chat-delegation system so the main LLM treats OrbitDB database
 * operations as a first-class skill. The bot can transitively reach for
 * helia and libp2p tools because OrbitDB composes on top of Helia,
 * which composes on top of libp2p.
 */

import { orbitdbService } from "./service";
import { heliaService } from "@/toolkits/helia/service";
import type {
    OrbitdbBotStatus,
    OrbitdbBotConfig,
    OrbitdbBotRequest,
    OrbitdbBotResponse,
    OrbitdbBotOperation,
} from "./types/orbitdbBot";
import { DEFAULT_ORBITDB_BOT_CONFIG } from "./types/orbitdbBot";
import { getSelectedModel } from "@/services/ai/models";
import { getModelProvider } from "@/services/ai/providers";
import { runChatTurn } from "@/services/ai/runner";
import { getAllTools } from "@/services/commands/tools";
import type { CommandContext } from "@/services/commands/types";
import { registerChatDelegation } from "@/services/ai/delegation";

// ── Module state ──

let botStatus: OrbitdbBotStatus = "idle";
let botConfig: OrbitdbBotConfig = { ...DEFAULT_ORBITDB_BOT_CONFIG };
const requestLog: OrbitdbBotResponse[] = [];

export function getOrbitdbBotStatus(): OrbitdbBotStatus { return botStatus; }
export function getOrbitdbBotConfig(): OrbitdbBotConfig { return { ...botConfig }; }
export function updateOrbitdbBotConfig(patch: Partial<OrbitdbBotConfig>): void {
    botConfig = { ...botConfig, ...patch };
}
export function getOrbitdbBotLog(): OrbitdbBotResponse[] { return [...requestLog]; }

// ── Tool filter ── (orbitdb tools + a subset of helia/libp2p tools)

const ORBITDB_COMMAND_IDS = new Set([
    // orbitdb
    "orbitdb_start", "orbitdb_stop",
    "orbitdb_add_node", "orbitdb_remove_node", "orbitdb_set_active_node",
    "orbitdb_rename_node", "orbitdb_set_helia",
    "orbitdb_list_nodes", "orbitdb_list_helia_nodes",
    "orbitdb_open", "orbitdb_close", "orbitdb_drop", "orbitdb_list_dbs",
    "orbitdb_get_identity",
    "orbitdb_put",
    "orbitdb_kv_put", "orbitdb_kv_get", "orbitdb_kv_del", "orbitdb_kv_all",
    "orbitdb_log_add", "orbitdb_log_iterator", "orbitdb_log_all",
    "orbitdb_doc_put", "orbitdb_doc_get", "orbitdb_doc_del",
    "orbitdb_doc_query", "orbitdb_doc_all",
    // helia (transitive)
    "helia_start", "helia_stop", "helia_add_node", "helia_set_active_node",
    // libp2p (transitive)
    "libp2p_start", "libp2p_stop", "libp2p_add_node", "libp2p_set_active_node",
]);

function getOrbitdbTools() {
    return getAllTools().filter((t) => ORBITDB_COMMAND_IDS.has(t.name));
}

// ── System prompt ──

function buildOrbitdbBotSystemPrompt(): string {
    const snap = orbitdbService.snapshot();
    const heliaSnap = heliaService.snapshot();
    const lines: string[] = [];
    lines.push("CURRENT ORBITDB STATE:");
    lines.push(`- Active orbitdb node: ${snap.activeId ?? "(none)"}`);
    lines.push(`- Total orbitdb nodes: ${snap.nodes.length}`);
    for (const n of snap.nodes) {
        const id = n.identityId ? `${n.identityId.slice(0, 16)}…` : "(no identity)";
        const bind = n.heliaNodeId ?? "(use active helia on start)";
        lines.push(
            `  • ${n.label} [${n.nodeId}] — ${n.status}, helia ${bind}, identity ${id}, ` +
            `${n.databases.length} db(s)`,
        );
        for (const db of n.databases.slice(0, 5)) {
            lines.push(`      - ${db.type} ${db.name} (${db.address.slice(0, 24)}…) ${db.open ? "[open]" : "[closed]"}`);
        }
    }
    lines.push("");
    lines.push("AVAILABLE HELIA NODES (use one of these ids for `heliaNodeId`):");
    if (heliaSnap.nodes.length === 0) lines.push("  (none — orbitdb_start will require one; create with helia_add_node first)");
    for (const n of heliaSnap.nodes) {
        lines.push(`  • ${n.label} [${n.nodeId}] — ${n.status}`);
    }

    return `You are the **OrbitDB Bot**, a specialized sub-agent that controls in-browser OrbitDB databases.

YOUR ROLE:
You are the dedicated decentralized-database expert. The main AI assistant delegates to you whenever the user asks to create / open / read / write / query an OrbitDB database (events log, key-value, documents). OrbitDB composes on top of Helia (IPFS) which in turn composes on top of libp2p; you can drive all three layers when needed.

DATABASE TYPES YOU SUPPORT:
═════════════════════════
- **events** — append-only log; \`orbitdb_log_add\` to append, \`orbitdb_log_iterator\` / \`_log_all\` to read.
- **keyvalue** / **keyvalue-indexed** — \`orbitdb_kv_put\`, \`_kv_get\`, \`_kv_del\`, \`_kv_all\`.
- **documents** — JSON documents indexed by a configurable field (default \`_id\`); \`orbitdb_doc_put\`, \`_doc_get\`, \`_doc_del\`, \`_doc_query\`, \`_doc_all\`.

CAPABILITIES YOU CONTROL:
═════════════════════════

**Lifecycle**
- orbitdb_start({ heliaNodeId?, identityId?, nodeId? })
- orbitdb_stop({ nodeId? })

**Multi-node**
- orbitdb_add_node, orbitdb_remove_node, orbitdb_set_active_node, orbitdb_rename_node, orbitdb_set_helia

**Database management**
- orbitdb_open({ addressOrName, type, indexBy?, meta?, sync?, nodeId? }) — type is one of events|keyvalue|keyvalue-indexed|documents.
- orbitdb_close({ address, nodeId? })
- orbitdb_drop({ address, nodeId? }) — DESTRUCTIVE; only run if the user clearly asks.
- orbitdb_list_dbs, orbitdb_list_nodes, orbitdb_list_helia_nodes, orbitdb_get_identity

**Generic write** (auto-dispatches by db type)
- orbitdb_put({ address, key?, value })

**Type-specific writes / reads**
- orbitdb_kv_put / _kv_get / _kv_del / _kv_all
- orbitdb_log_add / _log_iterator / _log_all
- orbitdb_doc_put / _doc_get / _doc_del / _doc_query / _doc_all

**Lower layers** (only when necessary)
- helia_start / helia_stop / helia_add_node / helia_set_active_node
- libp2p_start / libp2p_stop / libp2p_add_node / libp2p_set_active_node

OPERATING RULES:
════════════════
1. Before writes/reads, ensure the orbitdb node is "running" and the target db is opened by address.
   ${botConfig.autoStartIfStopped ? "If stopped, call orbitdb_start first." : "If stopped, ask the user to start it."}
2. Before orbitdb_start succeeds, a helia node must exist and be running.
   ${botConfig.autoStartHelia ? "If no helia is running, call helia_start (or helia_add_node + helia_start) first." : "If none is running, ask the user."}
3. For documents with a non-default key field, pass \`indexBy\` to orbitdb_open and ensure that field appears on every put.
4. To query documents pass a predicate body to \`orbitdb_doc_query\`, e.g. \`(doc) => doc.tag === "todo"\`.
5. Database addresses look like \`/orbitdb/<hash>\`. When opening by friendly name a new db is created and a new address minted.
6. orbitdb_drop is destructive — confirm intent before calling unless the user clearly said "drop / delete the database".
7. After each operation, mention the resulting hash / address / count.

${lines.join("\n")}

OUTPUT STYLE:
- Be brief. Confirm what was done in 1–3 sentences.
- Always quote the db address (or hash) you produced or read.
- If a step failed, surface the error verbatim and suggest a remedy.`;
}

// ── Main delegation entrypoint ──

export async function handleOrbitdbBotRequest(
    request: OrbitdbBotRequest,
    commandContext: CommandContext,
): Promise<OrbitdbBotResponse> {
    const startTime = Date.now();
    botStatus = "planning";
    const operations: OrbitdbBotOperation[] = [];
    const suggestions: string[] = [];

    try {
        const model = getSelectedModel();
        const provider = getModelProvider(model);
        const systemPrompt = buildOrbitdbBotSystemPrompt();
        const tools = (provider === "anthropic" || provider === "openai") ? getOrbitdbTools() : [];

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
        const post = orbitdbService.snapshot();
        const active = post.nodes.find((n) => n.nodeId === post.activeId);
        if (active) {
            if (active.status === "running" && active.databases.length === 0) {
                suggestions.push("OrbitDB is running but no databases yet — try orbitdb_open with a friendly name.");
            }
            if (active.status === "stopped") {
                suggestions.push("OrbitDB node is stopped — call orbitdb_start to begin.");
            }
        }

        botStatus = "idle";
        const response: OrbitdbBotResponse = {
            requestId: request.id,
            summary: finalText || `Completed ${operations.length} orbitdb operation(s)`,
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
        const response: OrbitdbBotResponse = {
            requestId: request.id,
            summary: `OrbitDB Bot error: ${msg}`,
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

/** Heuristic — should the main chat delegate to the orbitdb bot? */
export function shouldDelegateToOrbitdbBot(message: string): boolean {
    const m = message.toLowerCase();
    const patterns: RegExp[] = [
        /\borbit ?db\b/,
        /\borbitdb\b/,
        /\bdecentralized\s+(database|db|key-?value|kv|log|documents?)\b/,
        /\bkey-?value\s+(store|db|database)\b/,
        /\bevents?\s+log\b/,
        /\bdocument\s+(store|database|db)\b/,
        /\bdoc\s+query\b/,
        /\bcrdt\b/,
        /\b\/orbitdb\//,
    ];
    return patterns.some((p) => p.test(m));
}

// ── Self-registration ──

registerChatDelegation({
    id: "orbitdb-bot",
    check: shouldDelegateToOrbitdbBot,
    enhance: (systemPrompt) =>
        systemPrompt + "\n\n" + buildOrbitdbBotSystemPrompt(),
    maxRounds: 12,
});
