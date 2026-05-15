import { Sparkles, Hexagon, RefreshCw } from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
import type { ArchPhase, DeployProgress, ViewId, MeshConfig } from "@/types";
import { PreviewContent } from "./ArchitectPreview";
import { DoneContent } from "./ArchitectDone";

interface ArchitectInlinePanelProps {
  archPrompt?: string;
  archPreview: MeshConfig | null;
  archPhase: ArchPhase;
  deployProgress: DeployProgress;
  deployNetwork: () => void;
  resetArchitect: () => void;
  generateNetwork?: (desc: string) => void;
  setView: (v: ViewId) => void;
  showActions?: boolean;
}

/**
 * Inline (non-modal) variant of `ArchitectPopup`. Renders preview / deploying /
 * done phases as a normal block so the Architect blueprint flows in the chat
 * column instead of opening a backdrop. The "input" phase is omitted — chat
 * input drives generation when the Architect agent is active.
 */
export function ArchitectInlinePanel({
  archPrompt, archPreview, archPhase, deployProgress,
  deployNetwork, resetArchitect, generateNetwork, setView, showActions = true,
}: ArchitectInlinePanelProps) {
  if (archPhase === "input") return null;

  const handleNavigate = (v: ViewId) => setView(v);
  const canRegenerate = showActions && archPhase === "preview" && !!archPrompt && !!generateNetwork;

  return (
    <div className="architect-inline">
      <div className="architect-popup__header architect-popup__header--bordered">
        <div className="architect-popup__header-left">
          <GradientIcon icon={Sparkles} size={16} gradient={["#fbbf24", "#fcd34d"]} />
          <span className="architect-popup__title">Architect</span>
          <span className="architect-popup__phase-label">
            {archPhase === "preview" ? "Blueprint" : archPhase === "deploying" ? "Deploying…" : "Complete"}
          </span>
        </div>
        {showActions && (
          <div className="architect-inline__actions">
            {canRegenerate && (
              <button
                onClick={() => generateNetwork!(archPrompt!)}
                className="architect-popup__new-btn"
                title="Regenerate with the same prompt"
              >
                <RefreshCw size={11} /> Regenerate
              </button>
            )}
            {(archPhase === "preview" || archPhase === "done") && (
              <button onClick={resetArchitect} className="architect-popup__new-btn">
                New Design
              </button>
            )}
          </div>
        )}
      </div>

      {archPhase === "preview" && archPreview && (
        <PreviewContent preview={archPreview} deployNetwork={deployNetwork} resetArchitect={resetArchitect} showActions={showActions} />
      )}

      {archPhase === "deploying" && (
        <div className="architect-popup__deploying">
          <div className="architect-popup__deploying-icon">
            <GradientIcon icon={Hexagon} size={36} gradient={["#f472b6", "#ec4899"]} />
          </div>
          <div className="architect-popup__deploying-title">Deploying Ecosystem</div>
          <div className="architect-popup__deploying-step">{deployProgress.step}</div>
          <div className="architect-popup__progress-track">
            <div
              className="architect-popup__progress-bar"
              style={{ width: `${deployProgress.total > 0 ? (deployProgress.count / deployProgress.total) * 100 : 0}%` }}
            />
          </div>
          <div className="architect-popup__progress-count">{deployProgress.count} / {deployProgress.total}</div>
        </div>
      )}

      {archPhase === "done" && (
        <DoneContent onNavigate={handleNavigate} resetArchitect={resetArchitect} showActions={showActions} />
      )}
    </div>
  );
}
