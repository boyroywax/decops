
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
    <div style={{ width: "100%", boxSizing: "border-box" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 600, margin: 0 }}>
          <GradientIcon icon={Sparkles} size={16} gradient={["#fbbf24", "#fcd34d"]} /> Workspace Architect
        </h2>
        {(archPhase === "preview" || archPhase === "done") && (
          <button onClick={resetArchitect} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#71717a", padding: "6px 14px", borderRadius: 6, fontFamily: "inherit", fontSize: 10, cursor: "pointer" }}>
            New Design
          </button>
        )}
      </div>
      <div style={{ fontSize: 11, color: "#71717a", marginBottom: 24, lineHeight: 1.6 }}>
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
