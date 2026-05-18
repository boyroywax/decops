/**
 * OrbitDB Server Bot Service — specialised sub-agent for the OrbitDB Server Connector.
 *
 * Mirrors `kuboBot.ts`: registers a delegation entry with the
 * chat-delegation system so the main LLM treats remote-OrbitDB
 * operations (create/drop database, put/get/del, query documents,
 * append events, dial peers, inspect pnet) as a first-class skill.
 */

import { orbitdbServerService } from "./service";
import type {
    OrbitdbServerBotStatus,
    OrbitdbServerBotConfig,
    OrbitdbServerBotRequest,
    OrbitdbServerBotResponse,
    OrbitdbServerBotOperation,
} from "./types/orbitdbServerBot";
import { DEFAULT_ORBITDB_SERVER_BOT_CONFIG } from "./types/orbitdbServerBot";
import { getSelectedModel } from "@/services/ai/models";
import { getModelProvider } from "@/services/ai/providers";
import { runChatTurn } from "@/services/ai/runner";
import { getAllTools } from "@/services/commands/tools";
import type { CommandContext } from "@/services/commands/types";
import { registerChatDelegation } from "@/services/ai/delegation";

// ── Module state ──

let botStatus: OrbitdbServerBotStatus = "idle";
let botConfig: OrbitdbServerBotConfig = { ...DEFAULT_ORBITDB_SERVER_BOT_CONFIG };
const requestLog: OrbitdbServerBotResponse[] = [];

export function getOrbitdbServerBotStatus(): OrbitdbServerBotStatus { return botStatus; }
export function getOrbitdbServerBotConfig(): OrbitdbServerBotConfig { return { ...botConfig }; }
export function updateOrbitdbServerBotConfig(patch: Partial<OrbitdbServerBotConfig>): void {
    botConfig = { ...botConfig, ...patch };
}
export function getOrbitdbServerBotLog(): OrbitdbServerBotResponse[] { return [...requestLog]; }

// ── Tool filter ──

const ORBITDB_SERVER_COMMAND_IDS = new Set([
    "orbitdb_server_connect", "orbitdb_server_disconnect",
    "orbitdb_server_add_node", "orbitdb_server_remove_node",
    "orbitdb_server_set_active_node", "orbitdb_server_rename_node", "orbitdb_server_set_endpoint",
    "orbitdb_server_id", "orbitdb_server_health",
    "orbitdb_server_create_db", "orbitdb_server_drop_db", "orbitdb_server_list_dbs",
    "orbitdb_server_put", "orbitdb_server_get", "orbitdb_server_del",
    "orbitdb_server_all", "orbitdb_server_query", "orbitdb_server_add_event",
    "orbitdb_server_swarm_peers", "orbitdb_server_swarm_connect",
    "orbitdb_server_pnet_status", "orbitdb_server_pnet_generate",
]);

function getOrbitdbServerTools() {
    return getAllTools().filter((t) => ORBITDB_SERVER_COMMAND_IDS.has(t.name));
}

// ── System prompt ──

function buildOrbitdbServerBotSystemPrompt(): string {
    const snap = orbitdbServerService.snapshot();
    const lines: string[] = [];
    lines.push("CURRENT ORBITDB-SERVER STATE:");
    lines.push(`- Active node: ${snap.activeId ?? "(none)"}`);
    lines.push(`- Total nodes: ${snap.nodes.length}`);
    for (const n of snap.nodes) {
        const peer = n.peer?.peerId ? `${n.peer.peerId.slice(0, 16)}…` : "(no peer id)";
        const did = n.peer?.did ?? "(no did)";
        const pnet = n.peer?.pnetMode ?? "?";
        lines.push(
            `  • ${n.label} [${n.nodeId}] — ${n.status}, ${n.endpoint}, peer ${peer}, ` +
            `did ${did}, pnet ${pnet}, ${n.databases.length} db(s)`,
        );
    }

    return `You are the **OrbitDB Server Bot**, a specialised sub-agent that controls the OrbitDB Server Connector.

YOUR ROLE:
You are the dedicated expert for **remote orbitdb-server** infrastructure. The main AI assistant delegates to you when the user wants to talk to a long-running orbitdb-server (OrbitDB v2 HTTP RPC API) — open databases, write entries, query documents, append to event logs, manage the libp2p swarm, or inspect the private-network (pnet) configuration. Unlike the embedded OrbitDB bot (in-browser node), you operate over an HTTP RPC API and persist data on real server infrastructure.

CAPABILITIES YOU CONTROL:
═════════════════════════

**Connection lifecycle**
- orbitdb_server_connect({ nodeId?, url?, authorization?, timeoutMs? })
  → Hits /health then /id. \`url\` overrides the configured endpoint. \`authorization\` is the full header value (typically "Bearer …").
- orbitdb_server_disconnect({ nodeId? }) — drops the local client.
- orbitdb_server_set_endpoint({ nodeId?, url?, authorization?, timeoutMs? }) — only while disconnected.

**Multi-node**
- orbitdb_server_add_node({ label?, url? })
- orbitdb_server_remove_node({ nodeId })
- orbitdb_server_set_active_node({ nodeId })
- orbitdb_server_rename_node({ nodeId, label })

**Identity / status**
- orbitdb_server_id({ nodeId? }) — refresh peer id / DID / pnet status / version.
- orbitdb_server_health({ nodeId? }) — liveness probe (no auth required).

**Databases** (store types: events, documents, keyvalue, keyvalue-indexed)
- orbitdb_server_create_db({ name, type, nodeId? }) — opens (and creates if missing) a database.
- orbitdb_server_drop_db({ name, nodeId? }) — destructive. ASK BEFORE CALLING.
- orbitdb_server_list_dbs({ nodeId? })

**Data**
- orbitdb_server_put({ db, key?, value, nodeId? }) — keyvalue/documents stores. For documents, you may omit \`key\` and put \`_id\` inside \`value\`.
- orbitdb_server_get({ db, key, nodeId? })
- orbitdb_server_del({ db, key, nodeId? })
- orbitdb_server_all({ db, nodeId? }) — fetches every entry.
- orbitdb_server_query({ db, filter, nodeId? }) — documents stores only. Filter is an equality match object.
- orbitdb_server_add_event({ db, value, nodeId? }) — append to an \`events\` log.

**Swarm**
- orbitdb_server_swarm_peers({ nodeId? }) — list connected libp2p peers.
- orbitdb_server_swarm_connect({ multiaddr, nodeId? }) — tell the server to dial a peer.

**Private network (pnet)**
- orbitdb_server_pnet_status({ nodeId? }) — reports mode (private | public) + key fingerprint.
- orbitdb_server_pnet_generate({ nodeId? }) — generates a fresh swarm key. The server does NOT auto-apply it; you must surface the key to the operator and tell them to write it to config/swarm.key and restart.

OPERATING RULES:
════════════════
1. ALWAYS verify the active node's status is "connected" before any data operation. ${botConfig.autoConnectIfDisconnected ? "If it is disconnected, call orbitdb_server_connect first." : "If it is disconnected, ask the user to connect."}
2. When the user asks to put/get/del/query/append against a database the server hasn't opened yet, ${botConfig.autoCreateMissingDb ? "call orbitdb_server_create_db with the most appropriate type (keyvalue by default, documents if the user mentions _id / queries, events for append-only logs) before performing the operation." : "ask which store type to use, then call orbitdb_server_create_db first."}
3. Pick the right store type:
   - **keyvalue** — simple string keys → arbitrary JSON values. Default.
   - **keyvalue-indexed** — same shape but with persistent indexes for faster start-up on large stores.
   - **documents** — supports \`_id\` and server-side equality \`query()\`.
   - **events** — append-only log. Use orbitdb_server_add_event, not put.
4. The default endpoint is \`http://127.0.0.1:3000\` (the orbitdb-server default port). If the URL is HTTPS on another host, an Authorization Bearer token will almost always be required (mirrors Kubo).
5. \`orbitdb_server_drop_db\` is destructive — confirm with the user before invoking it.
6. After writes, quote the resulting hash. After identity refreshes, quote peerId + DID + pnet mode.
7. If a network error mentions "PROXY-DOWN" or "CORS", explain the dev-proxy workflow: stop the dev server and restart with VITE_ORBITDB_SERVER_PROXY_TARGET pointed at the server origin.
8. Stick to the orbitdb_server_* tool surface — do not call kubo_* / helia_* / orbitdb_* (embedded) commands.

${lines.join("\n")}

OUTPUT STYLE:
- Be brief. Confirm what was done in 1–3 sentences.
- Always quote the entry hash for writes, and the database name + store type for db-lifecycle changes.
- If a step failed, surface the error verbatim and suggest a remedy (check URL, check auth header, check server logs, check pnet mode).`;
}

// ── Main delegation entrypoint ──

export async function handleOrbitdbServerBotRequest(
    request: OrbitdbServerBotRequest,
    commandContext: CommandContext,
): Promise<OrbitdbServerBotResponse> {
    const startTime = Date.now();
    botStatus = "planning";
    const operations: OrbitdbServerBotOperation[] = [];
    const suggestions: string[] = [];

    try {
        const model = getSelectedModel();
        const provider = getModelProvider(model);
        const systemPrompt = buildOrbitdbServerBotSystemPrompt();
        const tools = (provider === "anthropic" || provider === "openai") ? getOrbitdbServerTools() : [];

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
        const post = orbitdbServerService.snapshot();
        const active = post.nodes.find((n) => n.nodeId === post.activeId);
        if (active) {
            if (active.status === "disconnected") {
                suggestions.push("Active orbitdb-server node is disconnected — orbitdb_server_connect to attach.");
            } else if (active.status === "error" && active.error) {
                suggestions.push(`Last connection error: ${active.error}. Verify URL, auth header, and that the orbitdb-server process is reachable.`);
            }
            if (active.status === "connected" && active.databases.length === 0) {
                suggestions.push("Connected but no databases open — try orbitdb_server_create_db.");
            }
        }

        botStatus = "idle";
        const response: OrbitdbServerBotResponse = {
            requestId: request.id,
            summary: finalText || `Completed ${operations.length} orbitdb-server operation(s)`,
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
        const response: OrbitdbServerBotResponse = {
            requestId: request.id,
            summary: `OrbitDB Server Bot error: ${msg}`,
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
 * Heuristic — should the main chat delegate to the orbitdb-server bot?
 * Targets phrasing that implies talking to a remote orbitdb-server rather
 * than the embedded in-browser OrbitDB node (which is owned by the
 * regular orbitdb toolkit).
 */
export function shouldDelegateToOrbitdbServerBot(message: string): boolean {
    const m = message.toLowerCase();
    const patterns: RegExp[] = [
        /\borbitdb[-\s]?server\b/,
        /\bremote\s+orbitdb\b/,
        /\borbitdb\s+(api|rpc|daemon|server)\b/,
        /\bkeyvalue[-\s]?indexed\b/,
        /\borbitdb\s+(http|https)\b/,
        /\bdid:key\b.*\borbitdb\b/,
        /\bpnet\b/,
        /\bswarm\s*key\b/,
        /\bdvln\.net\/orbitdb\b/,
        /\borbitdb\.dvln\.net\b/,
        /\b:3000\b.*\borbitdb\b/,
    ];
    return patterns.some((p) => p.test(m));
}

// ── Self-registration ──

registerChatDelegation({
    id: "orbitdb-server-bot",
    check: shouldDelegateToOrbitdbServerBot,
    enhance: (systemPrompt) => systemPrompt + "\n\n" + buildOrbitdbServerBotSystemPrompt(),
    maxRounds: 12,
});
