/**
 * useChatAgentRegistrations — registers the built-in chat agents
 * (Architect, Editor, Studio) with the chat-agents store.
 *
 * Extracted from AuthenticatedApp per §3.4 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
import { useEffect, useRef } from "react";
import { Sparkles, Clapperboard, Edit3 } from "lucide-react";
import { useChatAgentsStore, type ChatAgentSubmitContext } from "@/services/chat/agents";
import { ArchitectBanner, ArchitectWelcome, type useArchitect } from "@/toolkits/architect";
import { SCENARIO_PRESETS } from "@/constants";

type Architect = ReturnType<typeof useArchitect>;

async function streamCannedReply(ctx: ChatAgentSubmitContext, text: string): Promise<void> {
  if (!ctx.streamAssistantMessage) {
    ctx.appendAssistantMessage?.(text);
    return;
  }
  const stream = ctx.streamAssistantMessage();
  const tokens = text.match(/\S+\s*/g) ?? [text];
  for (const token of tokens) {
    stream.append(token);
    await new Promise((r) => setTimeout(r, 18));
  }
  stream.done(text);
}

export function useChatAgentRegistrations(architect: Architect) {
  // Architect uses a ref so the registered onSubmit always sees the latest
  // architect closures without re-registering on every render.
  const architectRef = useRef(architect);
  useEffect(() => { architectRef.current = architect; }, [architect]);

  useEffect(() => {
    const dispose = useChatAgentsStore.getState().register({
      id: "architect",
      name: "Architect",
      description: "Describe a network and the Architect will generate a deployable mesh blueprint.",
      icon: Sparkles,
      gradient: ["#fbbf24", "#fcd34d"],
      banner: ArchitectBanner,
      welcome: ArchitectWelcome,
      preferredSideWidth: 1000,
      freshConversation: true,
      toolkitIds: [
        "ecosystem",
        "agent-management",
        "infrastructure",
        "workspace-mgmt",
        "autonomy",
        "jobs",
        "artifacts",
      ],
      placeholder: "Describe a network or multi-agent ecosystem to build…",
      workspace: {
        view: "networks",
        sideChatFooterPanel: "none",
      },
      quickActions: SCENARIO_PRESETS.slice(0, 5).map((s) => ({
        label: s.label,
        prompt: s.desc,
      })),
      onSubmit: async (text, ctx) => {
        const a = architectRef.current;
        const phase = a.archPhase;
        const trimmed = text.trim();
        const wantsGen =
          /\b(build|create|generate|design|make|spin\s*up|new\s+(network|design|blueprint|ecosystem)|another\s+(network|design|blueprint|ecosystem)|build\s+another|start\s+over)\b/i.test(
            trimmed,
          );

        if (phase === "preview" || phase === "deploying") {
          const reply =
            phase === "deploying"
              ? "Your ecosystem is deploying right now — I'll be ready for the next design once it finishes."
              : "Your blueprint is ready below. Deploy or discard it before I draft another one.";
          await streamCannedReply(ctx, reply);
          return true;
        }

        if (phase === "done" && !wantsGen) {
          const reply =
            /\b(thanks?|thank you|thx|ty|cheers|nice|great|awesome|cool|perfect)\b/i.test(trimmed)
              ? "You're welcome! Tell me when you'd like to build another network and I'll draft a fresh blueprint."
              : "Your last ecosystem is deployed. Say something like \"build a new network for…\" and I'll generate another blueprint.";
          await streamCannedReply(ctx, reply);
          return true;
        }

        a.generateNetwork(trimmed);
        await new Promise<void>((resolve) => {
          const start = Date.now();
          const tick = () => {
            const cur = architectRef.current;
            if (!cur.archGenerating) return resolve();
            if (cur.archError) return resolve();
            if (Date.now() - start > 90_000) return resolve();
            setTimeout(tick, 200);
          };
          tick();
        });
        if (architectRef.current.archError) {
          ctx.appendAssistantMessage?.(`Architect error: ${architectRef.current.archError}`);
        }
        return true;
      },
    });
    return dispose;
  }, []);

  // Editor + Studio agents. Passive registrations — onSubmit returns false
  // (default) so input falls through to existing studio/editor chat paths.
  useEffect(() => {
    const store = useChatAgentsStore.getState();
    const disposeEditor = store.register({
      id: "editor",
      name: "Editor",
      description: "Routing prompts to the editor — ask the AI to edit, refactor or explain your file.",
      icon: Edit3,
      gradient: ["#60a5fa", "#a78bfa"],
      placeholder: "Ask the AI to help edit your file…",
      toolkitIds: ["artifacts", "workspace-mgmt"],
      workspace: {
        view: "editor",
        sideChatFooterPanel: "none",
      },
    });
    const disposeStudio = store.register({
      id: "studio",
      name: "Studio",
      description: "Routing prompts to Studio — describe canvas changes, layouts, and analytics.",
      icon: Clapperboard,
      gradient: ["#f472b6", "#fb7185"],
      placeholder: "Ask the AI to build on the Studio canvas…",
      toolkitIds: ["studio", "jobs", "artifacts", "agent-management"],
      workspace: {
        view: "jobs",
        sideChatFooterPanel: "jobs",
      },
    });
    return () => { disposeEditor(); disposeStudio(); };
  }, []);
}
