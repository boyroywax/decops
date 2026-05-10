import { useState } from "react";
import { Globe, Plus, X, Sparkles } from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
import "../../../styles/components/create-network-modal.css";

interface CreateNetworkModalProps {
  addJob: (job: any) => void;
  onClose: () => void;
}

export function CreateNetworkModal({
  addJob, onClose,
}: CreateNetworkModalProps) {
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createWithArchitect, setCreateWithArchitect] = useState(false);
  const [architectPrompt, setArchitectPrompt] = useState("");

  const handleCreate = () => {
    if (createWithArchitect && architectPrompt.trim()) {
      addJob({
        type: "create_network",
        request: {
          name: createName.trim() || "New Network",
          description: createDesc.trim(),
          architectPrompt: architectPrompt.trim(),
        },
      });
    } else if (createName.trim()) {
      addJob({
        type: "create_network",
        request: {
          name: createName.trim(),
          description: createDesc.trim(),
        },
      });
    }
    onClose();
  };

  const canCreate = createWithArchitect ? architectPrompt.trim() : createName.trim();

  return (
    <div className="cnm__backdrop">
      <div className="cnm__panel">
        <div className="cnm__header">
          <h3 className="cnm__title">
            <GradientIcon icon={Globe} size={20} gradient={["#38bdf8", "#60a5fa"]} />
            Create Network
          </h3>
          <button onClick={onClose} className="cnm__close-btn">
            <X size={14} />
          </button>
        </div>

        <div className="cnm__form">
          <div>
            <label className="cnm__label">Network Name</label>
            <input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g., Research Cluster Alpha"
              autoFocus
              className="cnm__input"
            />
          </div>

          <div>
            <label className="cnm__label">Description (Optional)</label>
            <input
              value={createDesc}
              onChange={(e) => setCreateDesc(e.target.value)}
              placeholder="Describe what this network does..."
              className="cnm__input cnm__input--desc"
            />
          </div>

          {/* Architect Toggle */}
          <div
            onClick={() => setCreateWithArchitect(!createWithArchitect)}
            className={`cnm__toggle${createWithArchitect ? " cnm__toggle--active" : ""}`}
          >
            <div className="cnm__toggle-row">
              <div className={`cnm__toggle-icon${createWithArchitect ? " cnm__toggle-icon--active" : ""}`}>
                <Sparkles size={16} color={createWithArchitect ? "#fbbf24" : "#52525b"} />
              </div>
              <div>
                <div className={`cnm__toggle-label${createWithArchitect ? " cnm__toggle-label--active" : ""}`}>
                  Create with Architect
                </div>
                <div className="cnm__toggle-desc">
                  Describe your network and let AI generate agents, channels, and groups
                </div>
              </div>
              <div className={`cnm__switch${createWithArchitect ? " cnm__switch--active" : ""}`}>
                <div className="cnm__switch-knob" />
              </div>
            </div>
          </div>

          {/* Architect Prompt */}
          {createWithArchitect && (
            <div>
              <label className="cnm__label cnm__label--architect">
                <Sparkles size={11} style={{ marginRight: 4 }} />
                Architect Prompt
              </label>
              <textarea
                value={architectPrompt}
                onChange={(e) => setArchitectPrompt(e.target.value)}
                placeholder="e.g., Create a DeFi security audit team with 4 agents specialized in smart contract analysis, on-chain forensics, governance review, and reporting..."
                className="cnm__textarea"
              />
            </div>
          )}

          {/* Info notice */}
          {!createWithArchitect && (
            <div className="cnm__info">
              Creates an empty network. Agents, channels, and groups will be affiliated when you assign them to this network.
            </div>
          )}

          {/* Actions */}
          <div className="cnm__actions">
            <button onClick={onClose} className="cnm__cancel-btn">
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!canCreate}
              className={`cnm__submit-btn${canCreate ? " cnm__submit-btn--enabled" : ""}`}
            >
              {createWithArchitect ? <><Sparkles size={14} /> Generate Network</> : <><Plus size={14} /> Create Network</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
