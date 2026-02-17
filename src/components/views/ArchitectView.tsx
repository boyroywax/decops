
import type { MeshConfig, ArchPhase, DeployProgress, ViewId } from "../../types";
import { Sparkles } from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import { ArchitectInput } from "./architect/ArchitectInput";
import { ArchitectPreview } from "./architect/ArchitectPreview";
import { ArchitectDeploying } from "./architect/ArchitectDeploying";
import { ArchitectDone } from "./architect/ArchitectDone";

interface ArchitectViewProps {
  archPrompt: string;
  setArchPrompt: (v: string) => void;
  archGenerating: boolean;
  archPreview: MeshConfig | null;
  archError: string | null;
  archPhase: ArchPhase;
  deployProgress: DeployProgress;
  generateNetwork: (desc: string) => void;
  deployNetwork: () => void;
  resetArchitect: () => void;
  setView: (v: ViewId) => void;
}

export function ArchitectView({
  archPrompt,
  setArchPrompt,
  archGenerating,
  archPreview,
  archError,
  archPhase,
  deployProgress,
  generateNetwork,
  deployNetwork,
  resetArchitect,
  setView,
}: ArchitectViewProps) {
  return (
    <div className="architect">
      <div className="architect__header">
        <h2 className="architect__title">
          <GradientIcon icon={Sparkles} size={16} gradient={["#fbbf24", "#fcd34d"]} /> Workspace Architect
        </h2>
        {(archPhase === "preview" || archPhase === "done") && (
          <button onClick={resetArchitect} className="btn btn-sm btn-ghost">
            New Design
          </button>
        )}
      </div>
      <div className="architect__desc">
        Describe a network and the AI architect will generate agents, channels, groups, and example conversations.
      </div>

      {archPhase === "input" && (
        <ArchitectInput
          archPrompt={archPrompt}
          setArchPrompt={setArchPrompt}
          archGenerating={archGenerating}
          archError={archError}
          generateNetwork={generateNetwork}
        />
      )}

      {archPhase === "preview" && archPreview && (
        <ArchitectPreview
          archPreview={archPreview}
          deployNetwork={deployNetwork}
          resetArchitect={resetArchitect}
        />
      )}

      {archPhase === "deploying" && (
        <ArchitectDeploying deployProgress={deployProgress} />
      )}

      {archPhase === "done" && (
        <ArchitectDone setView={setView} resetArchitect={resetArchitect} />
      )}
    </div>
  );
}
