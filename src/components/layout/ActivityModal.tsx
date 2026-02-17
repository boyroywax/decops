import { useState, useMemo, useRef, useEffect } from "react";
import type { NotebookEntry, NotebookCategory } from "../../types";
import { X, Zap, Download, Edit, Trash2 } from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import { ComposePanel } from "../activity/ComposePanel";
import { ActivityFilter } from "../activity/ActivityFilter";
import { ActivityList } from "../activity/ActivityList";

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
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: "actFadeIn 0.15s ease-out",
      }}
    >
      <div style={{
        background: "#0f0f14",
        border: "1px solid rgba(0,229,160,0.15)",
        borderRadius: 16,
        width: "min(720px, calc(100vw - 48px))",
        maxHeight: "calc(100vh - 64px)",
        overflow: "hidden",
        display: "flex", flexDirection: "column",
        boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <GradientIcon icon={Zap} size={18} gradient={["#00e5a0", "#38bdf8"]} />
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15  }}>
              Activity
            </span>
            <span style={{ fontSize: 10, color: "#52525b", fontFamily: "'DM Mono', monospace" }}>
              {safeEntries.length} {safeEntries.length === 1 ? "entry" : "entries"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => setShowCompose(!showCompose)}
              style={{
                background: "#00e5a0", color: "#0a0a0f", border: "none",
                padding: "6px 12px", borderRadius: 6, cursor: "pointer",
                fontFamily: "inherit", fontSize: 10, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 4,
              }}
            >
              <Edit size={11} /> New
            </button>
            <button
              onClick={exportNotebook}
              style={{
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                color: "#a1a1aa", padding: "6px 10px", borderRadius: 6, cursor: "pointer",
                fontFamily: "inherit", fontSize: 10, display: "flex", alignItems: "center", gap: 4,
              }}
            >
              <Download size={11} />
            </button>
            <button
              onClick={() => {
                if (window.confirm("Clear all activity entries?")) clearNotebook();
              }}
              style={{
                background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)",
                color: "#ef4444", padding: "6px 10px", borderRadius: 6, cursor: "pointer",
                fontFamily: "inherit", fontSize: 10, display: "flex", alignItems: "center", gap: 4,
              }}
            >
              <Trash2 size={11} />
            </button>
            <button
              onClick={onClose}
              style={{
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8, width: 28, height: 28, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", color: "#71717a",
                marginLeft: 4,
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div style={{ flex: 1, overflow: "auto", padding: "16px 20px 20px" }}>
          {/* Compose Panel */}
          {showCompose && (
            <div style={{ marginBottom: 16 }}>
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
            <div style={{
              textAlign: "center", padding: "30px 20px",
              color: "#71717a", fontSize: 12, fontFamily: "'DM Mono', monospace",
            }}>
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
            <div style={{
              marginTop: 20, paddingTop: 12,
              textAlign: "center",
              fontSize: 10, color: "#3f3f46",
              fontFamily: "'DM Mono', monospace",
              borderTop: "1px solid rgba(255,255,255,0.05)",
            }}>
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
