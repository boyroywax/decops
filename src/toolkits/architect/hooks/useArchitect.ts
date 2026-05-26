import { useState, useEffect, useRef } from "react";
import type { ArchPhase, DeployProgress, MeshConfig, JobRequest, Job } from "@/types";
import { registry } from "@/services/commands/registry";
import type { CommandContext } from "@/services/commands/types";

// Shared ref so the command context can be injected from a component
// inside CommandContextProvider without changing the useArchitect signature.
let globalCommandContext: CommandContext | null = null;

/** Called by ArchitectContextBridge to wire up the command context. */
export function setArchitectCommandContext(ctx: CommandContext | null) {
  globalCommandContext = ctx;
}

export function useArchitect(
  addLog: (msg: string) => void,
  addJob: (job: JobRequest) => Job | void,
  jobs?: Job[],
) {
  const [archPrompt, setArchPrompt] = useState("");
  const [archGenerating, setArchGenerating] = useState(false);
  const [archPreview, setArchPreview] = useState<MeshConfig | null>(null);
  const [archError, setArchError] = useState<string | null>(null);
  const [archPhase, setArchPhase] = useState<ArchPhase>("input");
  const [deployProgress, setDeployProgress] = useState<DeployProgress>({ step: "", count: 0, total: 0 });
  const [archJobId, setArchJobId] = useState<string | null>(null);

  // Watch for job completion if we have an active architect job
  useEffect(() => {
    if (!archJobId || !jobs) return;

    const job = jobs.find(j => j.id === archJobId);
    if (!job) return;

    if (job.status === "completed" && job.result) {
      try {
        // The result is the config object (or stringified? JobExecutor usually stores whatever is returned)
        // If it's an object, great. If string, parse it.
        // But wait, Job result type is usually string in previous code?
        // Let's assume it might be an object if we returned it from execute.
        // Check Job type definition? assuming generic or string/object.
        // "result" in Job interface is string.
        // So execute result is probably JSON.stringified?
        // "JobExecutor" usually handles this.
        // Let's assume it is stored as is or we need to handle parsing if string.

        let config: MeshConfig;
        if (typeof job.result === 'string') {
          // Check if it looks like JSON or just a message
          if (job.result.startsWith('{')) {
            config = JSON.parse(job.result);
          } else {
            throw new Error("Invalid job result format");
          }
        } else {
          config = job.result as unknown as MeshConfig;
        }

        if (!config.agents || !config.channels) {
          throw new Error("Invalid mesh config structure");
        }

        setArchPreview(config);
        setArchPhase("preview");
        setArchGenerating(false);
        setArchJobId(null);
        addLog(`Architect: Job completed. Generated ${config.agents.length} agents.`);
      } catch (e) {
        setArchError("Failed to parse architect result");
        setArchGenerating(false);
        setArchJobId(null);
        addLog(`Architect error: Failed to parse result`);
      }
    } else if (job.status === "failed") {
      setArchError(job.result || "Job failed");
      setArchGenerating(false);
      setArchJobId(null);
      addLog(`Architect job failed: ${job.result}`);
    }
  }, [jobs, archJobId, addLog]);

  const generateNetwork = async (description: string) => {
    setArchGenerating(true);
    setArchError(null);
    setArchPreview(null);
    setArchPhase("input");
    addLog(`Architect: Queuing generation job for "${description.slice(0, 50)}…"`);

    // Create the job
    const job = addJob({
      type: "prompt_architect",
      request: { prompt: description }
    });

    if (job && typeof job === 'object' && 'id' in job) {
      setArchJobId(job.id);
    } else {
      // Fallback if addJob doesn't return ID (shouldn't happen with our fix)
      setArchError("Failed to queue architect job");
      setArchGenerating(false);
    }
  };

  const deployNetwork = async () => {
    if (!archPreview) return;
    setArchPhase("deploying");
    setDeployProgress({ step: "Deploying ecosystem...", count: 0, total: 100 });

    try {
      // Execute the deploy_network command through the registry so it
      // builds the proper multi-step job pipeline (create_network,
      // create_agent, create_channel, etc.) and queues it via addJob.
      const ctx = globalCommandContext;
      if (ctx) {
        const result = await registry.execute(
          "deploy_network",
          { config: archPreview },
          ctx,
        );
        addLog(`Architect: deploy_network executed — ${JSON.stringify(result ?? {}).slice(0, 120)}`);
      } else {
        // Fallback: no command context available — log error so the
        // user knows deployment can't proceed from the UI alone.
        addLog("Architect: deploy_network requires command context — invoke via an agent or the CLI");
        setArchError("Deployment requires an active command context. Use the Architect agent chat or CLI to deploy.");
        setArchPhase("preview");
        return;
      }

      setDeployProgress({ step: "Network Deployment Started", count: 100, total: 100 });
      setTimeout(() => {
        setArchPhase("done");
      }, 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`Architect deploy error: ${msg}`);
      setArchError(msg);
      setArchPhase("preview");
    }
  };

  const resetArchitect = () => {
    setArchPrompt("");
    setArchPreview(null);
    setArchError(null);
    setArchPhase("input");
    setDeployProgress({ step: "", count: 0, total: 0 });
    setArchJobId(null);
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

/** Inferred return type of {@link useArchitect}. Prefer this over `any`. */
export type UseArchitectReturn = ReturnType<typeof useArchitect>;
