import { useState, useMemo, useRef, useEffect } from "react";
import type { NotebookEntry, NotebookCategory } from "../../types";
import { X, Zap, Download, Edit, Trash2 } from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import { ComposePanel } from "../activity/ComposePanel";
import { ActivityFilter } from "../activity/ActivityFilter";
import { ActivityList } from "../activity/ActivityList";
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

  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<Set<NotebookCategory>>(
    new Set(["action", "output", "navigation", "system", "narrative"])
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCompose, setShowCompose] = useState(false);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  const toggleFilter = (cat: NotebookCategory) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const filtered = useMemo(() => {
    return safeEntries.filter(e => {
      if (!activeFilters.has(e.category)) return false;
      if (search) {
        const q = search.toLowerCase();
        return e.title.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          (e.tags || []).some(t => t.toLowerCase().includes(q));
      }
      return true;
    });
  }, [safeEntries, activeFilters, search]);

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
              {safeEntries.length} {safeEntries.length === 1 ? "entry" : "entries"}
            </span>
          </div>
          <div className="activity-modal__header-actions">
            <button
              onClick={() => setShowCompose(!showCompose)}
              className="activity-modal__new-btn"
            >
              <Edit size={11} /> New
            </button>
            <button
              onClick={exportNotebook}
              className="activity-modal__export-btn"
            >
              <Download size={11} />
            </button>
            <button
              onClick={() => {
                if (window.confirm("Clear all activity entries?")) clearNotebook();
              }}
              className="activity-modal__clear-btn"
            >
              <Trash2 size={11} />
            </button>
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
          {/* Compose Panel */}
          {showCompose && (
            <div className="activity-modal__compose">
              <ComposePanel
                onAddEntry={(entry) => { addEntry(entry); setShowCompose(false); }}
                onCancel={() => setShowCompose(false)}
              />
            </div>
          )}

          {/* Search & filters */}
          <ActivityFilter
            search={search}
            setSearch={setSearch}
            activeFilters={activeFilters}
            toggleFilter={toggleFilter}
          />

          {/* No results */}
          {safeEntries.length > 0 && filtered.length === 0 && (
            <div className="activity-modal__no-results">
              No entries match your filters.
            </div>
          )}

          {/* Timeline */}
          <ActivityList
            entries={filtered}
            expandedId={expandedId}
            setExpandedId={setExpandedId}
            onWriteFirst={() => setShowCompose(true)}
          />

          {/* Footer stats */}
          {safeEntries.length > 0 && (
            <div className="activity-modal__footer">
              Showing {filtered.length} of {safeEntries.length} · ~{(JSON.stringify(safeEntries).length / 1024).toFixed(1)} KB
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes actFadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}
