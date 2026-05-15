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
import { Bot } from "lucide-react";
import { useChatAgentsStore } from "@/services/chat/agents";
import { Libp2pChatBanner } from "./libp2p/components/Libp2pChatBanner";
import { HeliaChatBanner } from "./helia/components/HeliaChatBanner";

// ── Step 1: Bot chat-delegation registration (must run before any chat) ──
import "./studio/studioBot";
import "./libp2p/libp2pBot";
import "./helia/heliaBot";

// ── Step 2: Toolkit UI registration ──
import "./studio/register";
import "./editor/register";
import "./libp2p/register";
import "./helia/register";
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
                name: "libp2p Bot",
                description:
                    "Direct line to the libp2p sub-agent — start nodes, dial peers, manage pubsub, identities.",
                icon: Bot,
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
                name: "Helia Bot",
                description:
                    "Direct line to the Helia (IPFS) sub-agent — start nodes, add/fetch CIDs, pin blocks.",
                icon: Bot,
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

        return () => {
            for (const dispose of disposers) dispose();
        };
    }, []);
}
