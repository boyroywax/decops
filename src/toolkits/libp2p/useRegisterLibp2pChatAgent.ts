import { useEffect, useRef } from "react";
import { Bot } from "lucide-react";
import { useChatAgentsStore } from "@/services/chat/agents";
import { useCommandCtx } from "@/context/CommandContextProvider";
import { handleLibp2pBotRequest } from "./libp2pBot";
import { Libp2pChatBanner } from "./components/Libp2pChatBanner";

export function useRegisterLibp2pChatAgent() {
    const cmdCtx = useCommandCtx();
    const cmdCtxRef = useRef(cmdCtx);
    useEffect(() => { cmdCtxRef.current = cmdCtx; }, [cmdCtx]);
    
    useEffect(() => {
        const dispose = useChatAgentsStore.getState().register({
            id: "libp2p",
            name: "libp2p Bot",
            description: "Direct line to the libp2p sub-agent — start nodes, dial peers, manage pubsub, identities.",
            icon: Bot,
            gradient: ["#38bdf8", "#a78bfa"],
            banner: Libp2pChatBanner,
            placeholder: "Tell the libp2p bot what to do (start a node, dial a peer, subscribe…)",
            toolkitIds: ["libp2p", "infrastructure", "jobs"],
            workspace: {
                view: "libp2p",
                sideChatFooterPanel: "none",
            },
            quickActions: [
                { label: "Start node", prompt: "Start the active node with default services" },
                { label: "List peers", prompt: "List connected peers" },
                { label: "Subscribe & say hi", prompt: "Subscribe to topic decops.discovery and publish hello" },
                { label: "Generate identity", prompt: "Generate a new identity and store it in the vault" },
            ],
            onSubmit: async (text, ctxIn) => {
                const ctx = cmdCtxRef.current;
                if (!ctx) return false;
                
                const stream = ctxIn.streamAssistantMessage?.();
                let header = "";
                const renderOps = (opsList: { command: string; status: string }[]): string =>
                    opsList.length === 0
                        ? ""
                        : `\n\nOperations:\n${opsList
                              .map((o) => `• \`${o.command}\`${o.status === "failed" ? " ⚠️" : o.status === "executing" ? " …" : ""}`)
                              .join("\n")}`;
                
                if (stream) {
                    header = "Planning libp2p operations…";
                    stream.set(header);
                }

                let done = false;
                const tickerStop = stream
                    ? setInterval(() => {
                          if (done) return;
                          const dots = ".".repeat(((Date.now() / 400) | 0) % 4);
                          stream.set(`${header}${dots}`);
                      }, 250)
                    : null;

                try {
                    const response = await handleLibp2pBotRequest(
                        {
                            id: `libp2p-bot-chat-${Date.now()}`,
                            instruction: text,
                            source: "user",
                            timestamp: Date.now(),
                        },
                        ctx,
                    );
                    done = true;
                    if (tickerStop) clearInterval(tickerStop);

                    const opsBlock = renderOps(
                        response.operations.map((o) => ({ command: o.command, status: o.status })),
                    );
                    const errBlock = response.error ? `\n\nError: ${response.error}` : "";
                    const final = `${response.summary}${opsBlock}${errBlock}`;

                    if (stream) {
                        stream.set("");
                        const tokens = final.match(/\S+\s*|\n+/g) ?? [final];
                        for (const tok of tokens) {
                            stream.append(tok);
                            await new Promise((r) => setTimeout(r, 12));
                        }
                        stream.done(final);
                    } else {
                        ctxIn.appendAssistantMessage?.(final);
                    }
                } catch (err) {
                    done = true;
                    if (tickerStop) clearInterval(tickerStop);
                    const msg = err instanceof Error ? err.message : String(err);
                    if (stream) stream.error(msg);
                    else ctxIn.appendAssistantMessage?.(`libp2p Bot error: ${msg}`);
                }
                return true;
            },
        });
        return dispose;
    }, []);
}