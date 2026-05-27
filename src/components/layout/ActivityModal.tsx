import { useState, useRef, useEffect } from "react";
import type { NotebookEntry } from "@/types";
import { X, Zap, Download, Edit, Trash2 } from "lucide-react";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { DeleteConfirmInline } from "@/components/shared/DeleteConfirmInline";
import { GradientIcon } from "@/components/shared/GradientIcon";
import { ComposePanel } from "@/components/activity/ComposePanel";
import { ActivityFeed } from "@/components/activity/ActivityFeed";
import "../../styles/components/activity-modal.css";

interface ActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: NotebookEntry[];
  clearNotebook: () => void;
  exportNotebook: () => void;
  addEntry: (entry: Omit<NotebookEntry, "id" | "timestamp">) => void;
}

export function ActivityModal({
  isOpen, onClose,
  entries, clearNotebook, exportNotebook, addEntry,
}: ActivityModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const safeEntries = Array.isArray(entries) ? entries : [];

  const [showCompose, setShowCompose] = useState(false);
  const del = useDeleteConfirm();

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
      className="activity-modal__backdrop"
    >
      <div className="activity-modal__panel">
        {/* Header */}
        <div className="activity-modal__header">
          <div className="activity-modal__header-left">
            <GradientIcon icon={Zap} size={18} gradient={["#00e5a0", "#38bdf8"]} />
            <span className="activity-modal__header-title">
              Activity
            </span>
            <span className="activity-modal__header-count">
              {safeEntries.length} notebook {safeEntries.length === 1 ? "entry" : "entries"}
            </span>
          </div>
          <div className="activity-modal__header-actions">
            <button
              onClick={() => setShowCompose(!showCompose)}
              className="activity-modal__new-btn"
              title="Add narrative notebook entry"
            >
              <Edit size={11} /> Note
            </button>
            <button
              onClick={exportNotebook}
              className="activity-modal__export-btn"
              title="Export notebook"
            >
              <Download size={11} />
            </button>
            {del.isPending("clear-all") ? (
              <DeleteConfirmInline entityName="Notebook" warning="All notebook entries will be cleared." onConfirm={() => del.confirm(clearNotebook)} onCancel={del.cancel} compact />
            ) : (
              <button
                onClick={() => del.requestDelete("clear-all")}
                className="activity-modal__clear-btn"
                title="Clear notebook"
              >
                <Trash2 size={11} />
              </button>
            )}
            <button
              onClick={onClose}
              className="activity-modal__close-btn"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="activity-modal__content">
          {/* Compose Panel (notebook-only) */}
          {showCompose && (
            <div className="activity-modal__compose">
              <ComposePanel
                onAddEntry={(entry) => { addEntry(entry); setShowCompose(false); }}
                onCancel={() => setShowCompose(false)}
              />
            </div>
          )}

          {/* Unified activity feed (live bus stream across all sources) */}
          <ActivityFeed
            title="Live activity stream"
            defaultTimeRange="1h"
            emptyMessage="No activity yet. Events will stream in here as toolkits run, jobs progress, and automations fire."
          />
        </div>
      </div>

      <style>{`
        @keyframes actFadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}
