import { useState, useRef, useEffect } from "react";
import { Sparkles, ChevronLeft, ChevronRight, Hexagon } from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
import { SCENARIO_PRESETS } from "@/constants";
import type { ArchPhase, DeployProgress, ViewId, MeshConfig } from "@/types";
import { PreviewContent } from "./ArchitectPreview";
import { DoneContent } from "./ArchitectDone";
import "../styles/architect-popup.css";

interface ArchitectPopupProps {
  isOpen: boolean;
  onClose: () => void;
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

export function ArchitectPopup({
  isOpen, onClose,
  archPrompt, setArchPrompt,
  archGenerating, archPreview, archError, archPhase, deployProgress,
  generateNetwork, deployNetwork, resetArchitect, setView,
}: ArchitectPopupProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Auto-resize textarea based on content
  const autoResize = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px"; // max ~4 lines
  };

  // Focus input when popup opens
  useEffect(() => {
    if (isOpen && archPhase === "input") {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, archPhase]);

  // Auto-resize when prompt changes (e.g., preset selection)
  useEffect(() => {
    if (isOpen) setTimeout(autoResize, 0);
  }, [isOpen, archPrompt]);

  // Escape to close (unless deploying)
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && archPhase !== "deploying") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose, archPhase]);

  // Track scroll state on the card deck
  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  };

  useEffect(() => {
    if (isOpen) setTimeout(updateScrollState, 150);
  }, [isOpen]);

  const scroll = (dir: number) => {
    scrollRef.current?.scrollBy({ left: dir * 240, behavior: "smooth" });
    setTimeout(updateScrollState, 350);
  };

  const handleSubmit = () => {
    if (archPrompt.trim() && !archGenerating) {
      generateNetwork(archPrompt.trim());
    }
  };

  const handleNavigate = (v: ViewId) => {
    setView(v);
    onClose();
  };

  if (!isOpen) return null;

  // Determine if we're in a phase that needs more space
  const isExpanded = archPhase === "preview" || archPhase === "deploying" || archPhase === "done";

  return (
    <div
      ref={backdropRef}
      onClick={(e) => {
        if (e.target === backdropRef.current && archPhase !== "deploying") onClose();
      }}
      className={`architect-popup-backdrop${isExpanded ? " architect-popup-backdrop--expanded" : ""}`}
    >
      <div className={`architect-popup${isExpanded ? " architect-popup--expanded" : ""}`}>
        {/* Header bar */}
        <div className={`architect-popup__header${archPhase !== "input" ? " architect-popup__header--bordered" : ""}`}>
          <div className="architect-popup__header-left">
            <GradientIcon icon={Sparkles} size={16} gradient={["#fbbf24", "#fcd34d"]} />
            <span className="architect-popup__title">
              Architect
            </span>
            <span className="architect-popup__phase-label">
              {archPhase === "input" ? "⌘K" : archPhase === "preview" ? "Blueprint" : archPhase === "deploying" ? "Deploying…" : "Complete"}
            </span>
          </div>
          {(archPhase === "preview" || archPhase === "done") && (
            <button onClick={() => { resetArchitect(); }} className="architect-popup__new-btn">
              New Design
            </button>
          )}
        </div>

        {/* ─── INPUT PHASE ─── */}
        {archPhase === "input" && (
          <div className="architect-popup__input-phase">
            {/* Template Card Deck */}
            <div className="architect-popup__deck-wrap">
              {canScrollLeft && (
                <button onClick={() => scroll(-1)} className="architect-popup__deck-arrow architect-popup__deck-arrow--left">
                  <ChevronLeft size={14} />
                </button>
              )}
              <div
                ref={scrollRef}
                onScroll={updateScrollState}
                className="architect-popup__deck"
              >
                {SCENARIO_PRESETS.map((s) => {
                  const isSelected = archPrompt === s.desc;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setArchPrompt(s.desc)}
                      className="architect-popup__preset"
                      style={isSelected ? { background: `${s.color}10`, borderColor: `${s.color}35` } : undefined}
                    >
                      <div className="architect-popup__preset-icon">{s.icon}</div>
                      <div className="architect-popup__preset-label" style={isSelected ? { color: s.color } : undefined}>
                        {s.label}
                      </div>
                      <div className="architect-popup__preset-desc">
                        {s.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
              {canScrollRight && (
                <button onClick={() => scroll(1)} className="architect-popup__deck-arrow architect-popup__deck-arrow--right">
                  <ChevronRight size={14} />
                </button>
              )}
            </div>

            {/* Command Input Bar */}
            <div className="architect-popup__input-bar">
              <Sparkles size={14} color="#fbbf24" className={`architect-popup__input-icon${archGenerating ? " architect-popup__input-icon--generating" : ""}`} />
              <textarea
                ref={inputRef}
                value={archPrompt}
                onChange={(e) => { setArchPrompt(e.target.value); autoResize(); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="Describe a network or multi-network ecosystem to build…"
                disabled={archGenerating}
                rows={1}
                className="architect-popup__textarea"
              />
              <button
                onClick={handleSubmit}
                disabled={archGenerating || !archPrompt.trim()}
                className={`architect-popup__submit-btn ${archGenerating ? "architect-popup__submit-btn--generating" : archPrompt.trim() ? "architect-popup__submit-btn--ready" : "architect-popup__submit-btn--disabled"}`}
              >
                {archGenerating ? (
                  <span className="architect-popup__generating-text">
                    <GradientIcon icon={Sparkles} size={13} gradient={["#fbbf24", "#fcd34d"]} /> Generating…
                  </span>
                ) : (
                  <>Generate</>
                )}
              </button>
            </div>

            {archError && (
              <div className="architect-popup__error">
                {archError}
              </div>
            )}

            {/* Keyboard hint */}
            <div className="architect-popup__kbd-hints">
              <kbd className="architect-popup__kbd">Enter</kbd> generate · <kbd className="architect-popup__kbd">Shift+Enter</kbd> newline · <kbd className="architect-popup__kbd">Esc</kbd> close
            </div>
          </div>
        )}

        {/* ─── PREVIEW PHASE ─── */}
        {archPhase === "preview" && archPreview && (
          <PreviewContent preview={archPreview} deployNetwork={deployNetwork} resetArchitect={resetArchitect} />
        )}

        {/* ─── DEPLOYING PHASE ─── */}
        {archPhase === "deploying" && (
          <div className="architect-popup__deploying">
            <div className="architect-popup__deploying-icon">
              <GradientIcon icon={Hexagon} size={36} gradient={["#f472b6", "#ec4899"]} />
            </div>
            <div className="architect-popup__deploying-title">
              Deploying Ecosystem
            </div>
            <div className="architect-popup__deploying-step">{deployProgress.step}</div>
            <div className="architect-popup__progress-track">
              <div className="architect-popup__progress-bar" style={{
                width: `${deployProgress.total > 0 ? (deployProgress.count / deployProgress.total) * 100 : 0}%`,
              }} />
            </div>
            <div className="architect-popup__progress-count">{deployProgress.count} / {deployProgress.total}</div>
          </div>
        )}

        {/* ─── DONE PHASE ─── */}
        {archPhase === "done" && (
          <DoneContent onNavigate={handleNavigate} resetArchitect={resetArchitect} />
        )}
      </div>

    </div>
  );
}


