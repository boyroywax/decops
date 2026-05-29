/**
 * Toolkit registration — single entry point.
 *
 * Importing this module triggers, in deterministic order:
 *   1. Bot chat-delegation registration (studio, libp2p)
 *   2. Toolkit UI registration (providers, views, global overlays)
 *
 * Consumers wanting to mount toolkit-provided chat agents into the
 * `useChatAgentsStore` should additionally call {@link useToolkitChatAgents}
 * from inside a React tree (typically once, near the root).
 *
 * Adding a new toolkit:
 *   1. Create `src/toolkits/<id>/register.ts` that calls the relevant
 *      `registerToolkit*` helpers from `@/services/toolkits/uiRegistry`.
 *   2. Add a side-effect import for it below.
 *   3. If the toolkit ships an AI chat agent, register it inside
 *      {@link useToolkitChatAgents}.
 *
 * This file is the *only* place that should import `register.ts` modules —
 * keeping toolkit boot order centralized prevents:
 *   - double-registration on HMR / parallel module loads
 *   - silent dropping of a toolkit because `main.tsx` forgot to import it
 *   - divergent registration styles (hook vs. side-effect vs. barrel)
 */

import { useEffect } from "react";
import { Bot, Boxes, Compass, Database, HardDrive, Network, Server, Waypoints } from "lucide-react";
import { useChatAgentsStore } from "@/services/chat/agents";
import { Libp2pChatBanner } from "./libp2p/components/Libp2pChatBanner";
import { HeliaChatBanner } from "./helia/components/HeliaChatBanner";
import { KuboChatBanner } from "./kubo/components/KuboChatBanner";
import { OrbitdbChatBanner } from "./orbitdb/components/OrbitdbChatBanner";
import { OrbitdbServerChatBanner } from "./orbitdb-server/components/OrbitdbServerChatBanner";
import { OrchestratorChatBanner } from "./orchestrator/components/OrchestratorChatBanner";
import { NavigatorChatBanner } from "./navigator/components/NavigatorChatBanner";

// ── Step 1: Bot chat-delegation registration (must run before any chat) ──
import "./studio/studioBot";
import "./libp2p/libp2pBot";
import "./helia/heliaBot";
import "./kubo/kuboBot";
import "./orbitdb/orbitdbBot";
import "./orbitdb-server/orbitdbServerBot";
import "./orchestrator/orchestratorBot";
import "./navigator/navigatorBot";

// ── Step 2: Toolkit UI registration ──
import "./studio/register";
import "./editor/register";
import "./libp2p/register";
import "./helia/register";
import "./kubo/register";
import "./orbitdb/register";
import "./orbitdb-server/register";
import "./orchestrator/register";
import "./navigator/register";
import "./architect/register";

/**
 * Mounts every toolkit-provided chat agent into the chat-agents store.
 *
 * Call once near the root of the authenticated app tree. Each registration
 * returns a dispose function; the cleanup phase deregisters them on unmount,
 * so HMR or context-tree restructuring cannot leave stale duplicates.
 */
export function useToolkitChatAgents(): void {
    useEffect(() => {
        const disposers: Array<() => void> = [];

        // libp2p chat agent
        disposers.push(
            useChatAgentsStore.getState().register({
                id: "libp2p",
                name: "libp2p",
                description:
                    "Direct line to the libp2p sub-agent — start nodes, dial peers, manage pubsub, identities.",
                icon: Network,
                gradient: ["#38bdf8", "#a78bfa"],
                banner: Libp2pChatBanner,
                placeholder:
                    "Tell the libp2p bot what to do (start a node, dial a peer, subscribe…)",
                toolkitIds: ["libp2p", "infrastructure", "jobs"],
                workspace: {
                    view: "libp2p",
                    sideChatFooterPanel: "none",
                },
                quickActions: [
                    { label: "Start node", prompt: "Start the active node with default services" },
                    { label: "List peers", prompt: "List connected peers" },
                    {
                        label: "Subscribe & say hi",
                        prompt:
                            "Subscribe to topic decops.discovery and publish hello",
                    },
                    {
                        label: "Generate identity",
                        prompt: "Generate a new identity and store it in the vault",
                    },
                ],
            }),
        );

        // Helia (IPFS) chat agent
        disposers.push(
            useChatAgentsStore.getState().register({
                id: "helia",
                name: "Helia",
                description:
                    "Direct line to the Helia (IPFS) sub-agent — start nodes, add/fetch CIDs, pin blocks.",
                icon: Boxes,
                gradient: ["#f59e0b", "#fb923c"],
                banner: HeliaChatBanner,
                placeholder:
                    "Tell the Helia bot what to do (start, add text, fetch a CID, pin…)",
                toolkitIds: ["helia", "libp2p", "infrastructure", "jobs"],
                workspace: {
                    view: "helia",
                    sideChatFooterPanel: "none",
                },
                quickActions: [
                    { label: "Start helia", prompt: "Start the active Helia node" },
                    { label: "Add hello world", prompt: "Add the text 'hello world' to IPFS and return the CID" },
                    { label: "List entries", prompt: "List the entries currently known to this Helia node" },
                    { label: "New helia node", prompt: "Add a new Helia node bound to the currently active libp2p node" },
                ],
            }),
        );

        // Kubo (remote IPFS) chat agent
        disposers.push(
            useChatAgentsStore.getState().register({
                id: "kubo-bot",
                name: "Kubo",
                description:
                    "Direct line to the Kubo (remote IPFS) sub-agent — pin CIDs, add files, fetch content over RPC.",
                icon: Server,
                gradient: ["#06b6d4", "#0e7490"],
                banner: KuboChatBanner,
                placeholder:
                    "Tell the Kubo bot what to do (connect to a daemon, pin a CID, add text, list pins…)",
                toolkitIds: ["kubo", "infrastructure", "jobs"],
                workspace: {
                    view: "kubo",
                    sideChatFooterPanel: "none",
                },
                quickActions: [
                    { label: "Connect localhost", prompt: "Connect to the Kubo daemon at http://127.0.0.1:5001" },
                    { label: "Add hello world", prompt: "Add the text 'hello world' to the remote Kubo node and pin it" },
                    { label: "List remote pins", prompt: "List the pins currently held by the remote Kubo node" },
                    { label: "Show peers", prompt: "Show the swarm peers connected to the active Kubo node" },
                ],
            }),
        );

        // OrbitDB chat agent
        disposers.push(
            useChatAgentsStore.getState().register({
                id: "orbitdb",
                name: "OrbitDB",
                description:
                    "Direct line to the OrbitDB sub-agent — open databases, write entries, query documents.",
                icon: Database,
                gradient: ["#a855f7", "#c084fc"],
                banner: OrbitdbChatBanner,
                placeholder:
                    "Tell the OrbitDB bot what to do (open a kv db, add an event, query docs…)",
                toolkitIds: ["orbitdb", "helia", "libp2p", "infrastructure", "jobs"],
                workspace: {
                    view: "orbitdb",
                    sideChatFooterPanel: "none",
                },
                quickActions: [
                    { label: "Start orbitdb", prompt: "Start the active OrbitDB node, auto-starting helia if needed" },
                    { label: "Open KV db", prompt: 'Open a key-value database named "todos"' },
                    { label: "Add event", prompt: 'Open an events log named "audit" and add { actor: "me", action: "login" }' },
                    { label: "Query docs", prompt: 'Open a documents database named "items" and query for documents where status equals active' },
                ],
            }),
        );

        // Lagrange chat agent — remote orbitdb-server (Voyager-compatible) over HTTP RPC
        disposers.push(
            useChatAgentsStore.getState().register({
                id: "orbitdb-server",
                name: "Lagrange",
                description:
                    "Direct line to Lagrange (remote orbitdb-server) — open databases, write entries, manage pnet, dial peers.",
                icon: HardDrive,
                gradient: ["#ec4899", "#a855f7"],
                banner: OrbitdbServerChatBanner,
                placeholder:
                    "Tell Lagrange what to do (connect, open a documents db, append events, check pnet…)",
                toolkitIds: ["orbitdb-server", "libp2p", "infrastructure", "jobs"],
                workspace: {
                    view: "orbitdb-server",
                    sideChatFooterPanel: "none",
                },
                quickActions: [
                    { label: "Connect localhost", prompt: "Connect to the orbitdb-server at http://127.0.0.1:3000" },
                    { label: "Open KV db", prompt: 'Open a keyvalue database named "settings" on the remote orbitdb-server' },
                    { label: "Append event", prompt: 'Open an events log named "audit" on the orbitdb-server and append { actor: "me", action: "login" }' },
                    { label: "Pnet status", prompt: "Report the pnet status of the active orbitdb-server" },
                ],
            }),
        );

        // Orchestrator chat agent — drives the four L.O.H.K toolkits via manifests
        disposers.push(
            useChatAgentsStore.getState().register({
                id: "orchestrator-bot",
                name: "Orchestrator",
                description:
                    "Drives the four L.O.H.K toolkits toward declared desired state via manifest artifacts.",
                icon: Waypoints,
                gradient: ["#10b981", "#059669"],
                banner: OrchestratorChatBanner,
                placeholder:
                    "Tell the orchestrator what to do (apply a manifest, reconcile, snapshot current state…)",
                toolkitIds: ["orchestrator", "libp2p", "helia", "kubo", "orbitdb", "infrastructure", "jobs"],
                workspace: {
                    view: "orchestrator",
                    sideChatFooterPanel: "none",
                },
                quickActions: [
                    { label: "Apply manifest", prompt: "Apply the currently linked manifest to the active stack" },
                    { label: "Reconcile", prompt: "Reconcile the active stack against its linked manifest and report drift" },
                    { label: "Save current state", prompt: "Snapshot the current L.O.H.K state into a new manifest artifact" },
                    { label: "List manifests", prompt: "List the manifest artifacts available in the workspace" },
                ],
            }),
        );

        // Navigator chat agent — captures prompts as goals and routes them
        // across the ecosystem, summoning huddles where needed.
        disposers.push(
            useChatAgentsStore.getState().register({
                id: "navigator-bot",
                name: "Navigator",
                description:
                    "Turns a prompt into a goal, decomposes it into sub-goals, and summons cross-network huddles. Bot-to-bot traffic is wrapped in DIDComm v2.",
                icon: Compass,
                gradient: ["#22d3ee", "#6366f1"],
                banner: NavigatorChatBanner,
                placeholder:
                    "Tell the navigator what to accomplish (it will plan, route, and summon huddles)…",
                toolkitIds: ["navigator", "infrastructure", "agent-management", "ecosystem", "jobs"],
                workspace: {
                    view: "navigator",
                    sideChatFooterPanel: "none",
                },
                quickActions: [
                    { label: "Plan a goal", prompt: "Capture this goal and decompose it: investigate cross-network drift and propose corrective sub-goals." },
                    { label: "Summon a huddle", prompt: "Summon a 4-agent cross-network huddle to debate the active goal." },
                    { label: "Status", prompt: "Report the status of the active navigator goal and its huddles." },
                    { label: "Cancel active goal", prompt: "Cancel the active navigator goal." },
                ],
            }),
        );

        return () => {
            for (const dispose of disposers) dispose();
        };
    }, []);
}
