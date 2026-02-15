import { useState } from "react";
import { ROLES, CHANNEL_TYPES, GOVERNANCE_MODELS, GROUP_COLORS } from "../constants";
import { generateDID, generateKeyPair, generateGroupDID } from "../utils/identity";
import { generateMeshConfig } from "../services/ai";
import { callAgentAI } from "../services/ai";



export function useArchitect(addLog: (msg: string) => void, addJob: (job: any) => void) {
  const [archPrompt, setArchPrompt] = useState("");
  const [archGenerating, setArchGenerating] = useState(false);
  const [archPreview, setArchPreview] = useState<MeshConfig | null>(null);
  const [archError, setArchError] = useState<string | null>(null);
  const [archPhase, setArchPhase] = useState<ArchPhase>("input");
  const [deployProgress, setDeployProgress] = useState<DeployProgress>({ step: "", count: 0, total: 0 });

  const generateNetwork = async (description: string) => {
    setArchGenerating(true);
    setArchError(null);
    setArchPreview(null);
    setArchPhase("input");
    addLog(`Architect: generating mesh for "${description.slice(0, 50)}…"`);
    try {
      const config = await generateMeshConfig(description);
      if (!config.agents || !Array.isArray(config.agents) || config.agents.length === 0) {
        throw new Error("No agents in config");
      }
      if (!config.channels || !Array.isArray(config.channels)) {
        throw new Error("No channels in config");
      }
      setArchPreview(config);
      setArchPhase("preview");
      addLog(`Architect: generated ${config.agents.length} agents, ${config.channels.length} channels, ${config.groups?.length || 0} groups`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setArchError(message);
      addLog(`Architect error: ${message}`);
    }
    setArchGenerating(false);
  };

  const deployNetwork = async () => {
    if (!archPreview) return;
    setArchPhase("deploying");

    // Instead of executing logic here, queue a job!
    if (addJob) {
      addJob({
        type: "deploy_network",
        request: { config: archPreview }
      });

      // Optimistic / UI updates
      // We can mimic progress or just wait for job completion.
      // For now, let's just set phase to done after a short delay or rely on logs?
      // The original code had detailed progress updates (setDeployProgress).
      // The Job execution (in App.tsx) doesn't update 'deployProgress' state in this hook.
      // That's a trade-off. We lose granular client-side progress bars unless we wire job progress events.
      // However, the logs from the job will stream in.

      // Let's set a generic "Deploying via Job..." message.
      setDeployProgress({ step: "Queued for deployment...", count: 0, total: 100 });

      // We can reset phase to "done" immediately or after a timeout?
      // Ideally we reset when we see the job finish. But hooks are decoupled.
      // Let's just set it to done to clear the UI blocking state, assuming job handles it.
      setTimeout(() => {
        setArchPhase("done");
        setDeployProgress({ step: "Deployment Job Started", count: 100, total: 100 });
      }, 1000);

    } else {
      console.error("No addJob function provided to useArchitect");
    }
  };

  const resetArchitect = () => {
    setArchPrompt("");
    setArchPreview(null);
    setArchError(null);
    setArchPhase("input");
    setDeployProgress({ step: "", count: 0, total: 0 });
  };

  return {
    archPrompt, setArchPrompt,
    archGenerating,
    archPreview,
    archError,
    archPhase,
    deployProgress,
    generateNetwork,
    deployNetwork,
    resetArchitect,
  };
}
