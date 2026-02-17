import { useState } from "react";
import { inputStyle } from "../../shared/ui";
import { Globe, Plus, X, Sparkles } from "lucide-react";
import { GradientIcon } from "../../shared/GradientIcon";

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
      // AI-generated network with agents
      addJob({
        type: "create_network",
        request: {
          name: createName.trim() || "New Network",
          description: createDesc.trim(),
          architectPrompt: architectPrompt.trim(),
        },
      });
    } else if (createName.trim()) {
      // Create empty network container
      addJob({
        type: "create_empty_network",
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
    <div style={{
      position: "fixed",
      top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.8)",
      backdropFilter: "blur(6px)",
      zIndex: 9999,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      animation: "fadeIn 0.2s",
    }}>
      <div style={{
        width: 500,
        background: "#18181b",
        border: "1px solid rgba(56,189,248,0.15)",
        borderRadius: 18,
        padding: 32,
        boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h3 style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 600,
            color: "#e4e4e7",
            fontFamily: "'Space Grotesk', sans-serif",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            <GradientIcon icon={Globe} size={20} gradient={["#38bdf8", "#60a5fa"]} />
            Create Network
          </h3>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 6,
              color: "#52525b",
              cursor: "pointer",
              width: 28, height: 28,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, color: "#a1a1aa", marginBottom: 6, fontWeight: 500 }}>
              Network Name
            </label>
            <input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g., Research Cluster Alpha"
              autoFocus
              style={{
                width: "100%",
                padding: "12px 16px",
                background: "rgba(0,0,0,0.3)",
                border: "1px solid rgba(56,189,248,0.12)",
                borderRadius: 8,
                color: "white",
                outline: "none",
                fontSize: 13,
                fontFamily: "inherit",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 11, color: "#a1a1aa", marginBottom: 6, fontWeight: 500 }}>
              Description (Optional)
            </label>
            <input
              value={createDesc}
              onChange={(e) => setCreateDesc(e.target.value)}
              placeholder="Describe what this network does..."
              style={{
                width: "100%",
                padding: "12px 16px",
                background: "rgba(0,0,0,0.3)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 8,
                color: "white",
                outline: "none",
                fontSize: 13,
                fontFamily: "inherit",
              }}
            />
          </div>

          {/* Architect Toggle */}
          <div
            onClick={() => setCreateWithArchitect(!createWithArchitect)}
            style={{
              background: createWithArchitect ? "rgba(251,191,36,0.06)" : "rgba(255,255,255,0.02)",
              border: `1px solid ${createWithArchitect ? "rgba(251,191,36,0.2)" : "rgba(255,255,255,0.06)"}`,
              borderRadius: 10,
              padding: 14,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: createWithArchitect ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.04)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Sparkles size={16} color={createWithArchitect ? "#fbbf24" : "#52525b"} />
              </div>
              <div>
                <div style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: createWithArchitect ? "#fbbf24" : "#a1a1aa",
                }}>
                  Create with Architect
                </div>
                <div style={{ fontSize: 10, color: "#52525b" }}>
                  Describe your network and let AI generate agents, channels, and groups
                </div>
              </div>
              <div style={{
                marginLeft: "auto",
                width: 36, height: 20, borderRadius: 10,
                background: createWithArchitect ? "#fbbf24" : "rgba(255,255,255,0.08)",
                padding: 2,
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                justifyContent: createWithArchitect ? "flex-end" : "flex-start",
              }}>
                <div style={{
                  width: 16, height: 16, borderRadius: "50%",
                  background: createWithArchitect ? "#0a0a0f" : "#52525b",
                  transition: "all 0.2s",
                }} />
              </div>
            </div>
          </div>

          {/* Architect Prompt */}
          {createWithArchitect && (
            <div>
              <label style={{ display: "block", fontSize: 11, color: "#fbbf24", marginBottom: 6, fontWeight: 500 }}>
                <Sparkles size={11} style={{ marginRight: 4 }} />
                Architect Prompt
              </label>
              <textarea
                value={architectPrompt}
                onChange={(e) => setArchitectPrompt(e.target.value)}
                placeholder="e.g., Create a DeFi security audit team with 4 agents specialized in smart contract analysis, on-chain forensics, governance review, and reporting..."
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  background: "rgba(0,0,0,0.3)",
                  border: "1px solid rgba(251,191,36,0.15)",
                  borderRadius: 8,
                  color: "white",
                  outline: "none",
                  minHeight: 100,
                  resize: "none",
                  fontSize: 12,
                  fontFamily: "inherit",
                  lineHeight: 1.5,
                }}
              />
            </div>
          )}

          {/* Info notice */}
          {!createWithArchitect && (
            <div style={{
              fontSize: 10,
              color: "#52525b",
              background: "rgba(56,189,248,0.04)",
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid rgba(56,189,248,0.08)",
            }}>
              Creates an empty network. Agents, channels, and groups will be affiliated when you assign them to this network.
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <button
              onClick={onClose}
              style={{
                flex: 1,
                padding: "12px",
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#a1a1aa",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: 500,
                fontSize: 13,
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!canCreate}
              style={{
                flex: 1,
                padding: "12px",
                background: canCreate
                  ? "linear-gradient(135deg, #38bdf8 0%, #60a5fa 100%)"
                  : "rgba(255,255,255,0.06)",
                border: "none",
                color: canCreate ? "#0a0a0f" : "rgba(255,255,255,0.2)",
                fontWeight: 600,
                borderRadius: 8,
                cursor: canCreate ? "pointer" : "not-allowed",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              {createWithArchitect ? <><Sparkles size={14} /> Generate Network</> : <><Plus size={14} /> Create Network</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
