/**
 * ActivityFeed — shared, filterable, live-tailing event stream UI.
 *
 * Sits on top of the activity bus (`@/services/activity`) and renders the
 * matching events with:
 *   • text search
 *   • source filter chips
 *   • severity filter chips
 *   • time-range dropdown (5m / 1h / 24h / all)
 *   • live-tail toggle (auto-scroll on new events)
 *   • grouped (by day) vs flat list toggle
 *   • per-row expand → renders structured `data` as JSON
 *   • export (JSON / CSV)
 *
 * Designed to be embedded inside any panel that wants to surface its
 * scope's activity. Callers seed it with a base filter; users layer
 * additional filters on top via the toolbar.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Pause, Play, Download, ChevronDown, ChevronRight,
  Activity, Filter, X, ArrowUpNarrowWide, ArrowDownWideNarrow,
} from "lucide-react";
import {
  useActivityFeed,
  KNOWN_ACTIVITY_SOURCES,
  type ActivityEvent,
  type ActivityFilter,
  type ActivitySeverity,
  type ActivitySource,
} from "@/services/activity";
import "@/styles/components/activity-feed.css";

const SEVERITIES: ActivitySeverity[] = ["debug", "info", "warn", "error"];
const SEVERITY_COLORS: Record<ActivitySeverity, string> = {
  debug: "#64748b",
  info:  "#3b82f6",
  warn:  "#f59e0b",
  error: "#ef4444",
};

type TimeRange = "5m" | "1h" | "24h" | "all";
const TIME_RANGES: { id: TimeRange; label: string; ms: number | null }[] = [
  { id: "5m",  label: "5m",  ms: 5 * 60 * 1000 },
  { id: "1h",  label: "1h",  ms: 60 * 60 * 1000 },
  { id: "24h", label: "24h", ms: 24 * 60 * 60 * 1000 },
  { id: "all", label: "All", ms: null },
];

export interface ActivityFeedProps {
  /** Filter applied at the bus level. Toolbar filters are layered on top. */
  baseFilter?: ActivityFilter;
  /** Initial source chip selection. Empty = all known sources. */
  initialSources?: ActivitySource[];
  /** Initial severity selection. Empty = all severities. */
  initialSeverities?: ActivitySeverity[];
  /** Title rendered above the toolbar. */
  title?: string;
  /** Optional empty-state copy. */
  emptyMessage?: string;
  /** Default time range. */
  defaultTimeRange?: TimeRange;
  /** Show grouped (by day) vs flat list initially. */
  defaultGrouped?: boolean;
  /** Max events kept in the in-component feed buffer (default 500). */
  bufferLimit?: number;
  /** Restrict the source chip list. Defaults to KNOWN_ACTIVITY_SOURCES. */
  sourceOptions?: ActivitySource[];
  /** Extra class names appended to the root element. */
  className?: string;
}

export function ActivityFeed({
  baseFilter,
  initialSources = [],
  initialSeverities = [],
  title = "Activity",
  emptyMessage = "No activity yet. Events will stream in here as they happen.",
  defaultTimeRange = "1h",
  defaultGrouped = false,
  bufferLimit = 500,
  sourceOptions,
  className,
}: ActivityFeedProps) {
  const [search, setSearch] = useState("");
  const [selectedSources, setSelectedSources] = useState<Set<ActivitySource>>(new Set(initialSources));
  const [selectedSeverities, setSelectedSeverities] = useState<Set<ActivitySeverity>>(new Set(initialSeverities));
  const [timeRange, setTimeRange] = useState<TimeRange>(defaultTimeRange);
  const [liveTail, setLiveTail] = useState(true);
  const [grouped, setGrouped] = useState(defaultGrouped);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const events = useActivityFeed({ ...baseFilter, limit: bufferLimit });

  const filteredEvents = useMemo(() => {
    const range = TIME_RANGES.find((r) => r.id === timeRange);
    const cutoff = range?.ms !== null && range?.ms !== undefined ? Date.now() - range.ms : null;
    const q = search.trim().toLowerCase();

    const filtered = events.filter((e) => {
      if (selectedSources.size > 0 && !selectedSources.has(e.source)) return false;
      if (selectedSeverities.size > 0 && !selectedSeverities.has(e.severity)) return false;
      if (cutoff !== null && e.timestamp < cutoff) return false;
      if (q) {
        const hay = [e.title, e.message ?? "", e.channel, (e.tags ?? []).join(" "), e.source].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // Bus delivers ascending (oldest → newest). Reverse for desc.
    return sortDir === "asc" ? filtered : [...filtered].reverse();
  }, [events, search, selectedSources, selectedSeverities, timeRange, sortDir]);

  // Live tail: scroll to the newest row when new events arrive. The
  // newest row is at the bottom when ascending and at the top when
  // descending.
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!liveTail) return;
    const el = listRef.current;
    if (!el) return;
    if (sortDir === "asc") el.scrollTop = el.scrollHeight;
    else el.scrollTop = 0;
  }, [filteredEvents.length, liveTail, sortDir]);

  const toggleSource = (s: ActivitySource) => {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };
  const toggleSeverity = (s: ActivitySeverity) => {
    setSelectedSeverities((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };
  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const clearFilters = () => {
    setSearch("");
    setSelectedSources(new Set());
    setSelectedSeverities(new Set());
    setTimeRange("all");
  };

  const handleExportJson = () => downloadFile(
    `activity-${Date.now()}.json`,
    "application/json",
    JSON.stringify(filteredEvents, null, 2),
  );
  const handleExportCsv = () => downloadFile(
    `activity-${Date.now()}.csv`,
    "text/csv",
    toCsv(filteredEvents),
  );

  const visibleSources = sourceOptions
    ? KNOWN_ACTIVITY_SOURCES.filter((s) => sourceOptions.includes(s.id))
    : KNOWN_ACTIVITY_SOURCES;

  const hasFiltersActive =
    search !== "" ||
    selectedSources.size > 0 ||
    selectedSeverities.size > 0 ||
    timeRange !== defaultTimeRange;

  const grouping = useMemo(() => {
    if (!grouped) return null;
    const groups: { day: string; items: ActivityEvent[] }[] = [];
    for (const evt of filteredEvents) {
      const day = formatDay(evt.timestamp);
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.items.push(evt);
      else groups.push({ day, items: [evt] });
    }
    return groups;
  }, [filteredEvents, grouped]);

  return (
    <div className={`activity-feed${className ? ` ${className}` : ""}`}>
      <div className="activity-feed__toolbar">
        <div className="activity-feed__toolbar-row activity-feed__toolbar-row--primary">
          <div className="activity-feed__title">
            <Activity size={13} />
            <span>{title}</span>
            <span className="activity-feed__count">{filteredEvents.length}</span>
          </div>

          <div className="activity-feed__search">
            <Search size={12} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, message, channel, tag…"
              className="activity-feed__search-input"
              aria-label="Search activity"
            />
          </div>

          <div className="activity-feed__time-range" role="radiogroup" aria-label="Time range">
            {TIME_RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setTimeRange(r.id)}
                className={`activity-feed__chip activity-feed__chip--time ${timeRange === r.id ? "activity-feed__chip--active" : ""}`}
                role="radio"
                aria-checked={timeRange === r.id}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="activity-feed__toolbar-actions">
            <button
              onClick={() => setLiveTail((v) => !v)}
              className={`activity-feed__icon-btn ${liveTail ? "activity-feed__icon-btn--on" : ""}`}
              title={liveTail ? "Pause live tail" : "Resume live tail"}
              aria-pressed={liveTail}
            >
              {liveTail ? <Pause size={12} /> : <Play size={12} />}
              <span>{liveTail ? "Live" : "Paused"}</span>
            </button>
            <button
              onClick={() => setGrouped((v) => !v)}
              className={`activity-feed__icon-btn ${grouped ? "activity-feed__icon-btn--on" : ""}`}
              title={grouped ? "Switch to flat list" : "Group by day"}
              aria-pressed={grouped}
            >
              <Filter size={12} />
              <span>{grouped ? "Grouped" : "Flat"}</span>
            </button>
            <button
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              className="activity-feed__icon-btn"
              title={sortDir === "asc" ? "Sort newest first" : "Sort oldest first"}
              aria-label={`Sort ${sortDir === "asc" ? "oldest to newest" : "newest to oldest"} — click to reverse`}
            >
              {sortDir === "asc" ? <ArrowUpNarrowWide size={12} /> : <ArrowDownWideNarrow size={12} />}
              <span>{sortDir === "asc" ? "Oldest" : "Newest"}</span>
            </button>
            <button
              onClick={handleExportJson}
              className="activity-feed__icon-btn"
              title="Export filtered events as JSON"
            >
              <Download size={12} />
              <span>JSON</span>
            </button>
            <button
              onClick={handleExportCsv}
              className="activity-feed__icon-btn"
              title="Export filtered events as CSV"
            >
              <Download size={12} />
              <span>CSV</span>
            </button>
            {hasFiltersActive && (
              <button
                onClick={clearFilters}
                className="activity-feed__icon-btn"
                title="Clear all filters"
              >
                <X size={12} />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>

        <div className="activity-feed__toolbar-row activity-feed__toolbar-row--chips">
          <div className="activity-feed__chip-group" aria-label="Source filter">
            {visibleSources.map((s) => {
              const active = selectedSources.has(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggleSource(s.id)}
                  className={`activity-feed__chip ${active ? "activity-feed__chip--active" : ""}`}
                  style={active ? { borderColor: s.accent, color: s.accent } : undefined}
                  aria-pressed={active}
                >
                  <span className="activity-feed__chip-dot" style={{ background: s.accent }} />
                  {s.label}
                </button>
              );
            })}
          </div>
          <div className="activity-feed__chip-group" aria-label="Severity filter">
            {SEVERITIES.map((s) => {
              const active = selectedSeverities.has(s);
              return (
                <button
                  key={s}
                  onClick={() => toggleSeverity(s)}
                  className={`activity-feed__chip ${active ? "activity-feed__chip--active" : ""}`}
                  style={active ? { borderColor: SEVERITY_COLORS[s], color: SEVERITY_COLORS[s] } : undefined}
                  aria-pressed={active}
                >
                  <span className="activity-feed__chip-dot" style={{ background: SEVERITY_COLORS[s] }} />
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div ref={listRef} className="activity-feed__list">
        {filteredEvents.length === 0 ? (
          <div className="activity-feed__empty">{emptyMessage}</div>
        ) : grouped && grouping ? (
          grouping.map((g) => (
            <React.Fragment key={g.day}>
              <div className="activity-feed__day-header">
                <span className="activity-feed__day-label">{g.day}</span>
                <span className="activity-feed__day-count">{g.items.length}</span>
              </div>
              {g.items.map((evt) => (
                <ActivityRow
                  key={evt.id}
                  event={evt}
                  expanded={expandedIds.has(evt.id)}
                  onToggle={() => toggleExpanded(evt.id)}
                />
              ))}
            </React.Fragment>
          ))
        ) : (
          filteredEvents.map((evt) => (
            <ActivityRow
              key={evt.id}
              event={evt}
              expanded={expandedIds.has(evt.id)}
              onToggle={() => toggleExpanded(evt.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface ActivityRowProps {
  event: ActivityEvent;
  expanded: boolean;
  onToggle: () => void;
}

function ActivityRow({ event, expanded, onToggle }: ActivityRowProps) {
  const accent = KNOWN_ACTIVITY_SOURCES.find((s) => s.id === event.source)?.accent ?? "#64748b";
  const hasDetail = event.message || event.data !== undefined || (event.tags && event.tags.length > 0);

  return (
    <div className={`activity-feed__row activity-feed__row--${event.severity}`}>
      <button
        className="activity-feed__row-main"
        onClick={hasDetail ? onToggle : undefined}
        disabled={!hasDetail}
        type="button"
      >
        <span className="activity-feed__row-toggle" aria-hidden="true">
          {hasDetail ? (expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />) : null}
        </span>
        <span className="activity-feed__row-time">{formatTime(event.timestamp)}</span>
        <span className="activity-feed__row-source" style={{ color: accent }}>{event.source}</span>
        <span className="activity-feed__row-channel">{event.channel}</span>
        <span
          className="activity-feed__row-severity"
          style={{ color: SEVERITY_COLORS[event.severity] }}
        >
          {event.severity}
        </span>
        <span className="activity-feed__row-title">{event.title}</span>
      </button>
      {expanded && hasDetail && (
        <div className="activity-feed__row-detail">
          {event.message && <div className="activity-feed__row-message">{event.message}</div>}
          {event.tags && event.tags.length > 0 && (
            <div className="activity-feed__row-tags">
              {event.tags.map((t) => (
                <span key={t} className="activity-feed__row-tag">{t}</span>
              ))}
            </div>
          )}
          {event.data !== undefined && (
            <pre className="activity-feed__row-data">{JSON.stringify(event.data, null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  );
}

// ─── utilities ──────────────────────────────────────────────────────────

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDay(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function downloadFile(name: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toCsv(events: ActivityEvent[]): string {
  const headers = ["id", "timestamp", "source", "channel", "kind", "severity", "title", "message", "tags", "jobId"];
  const escape = (v: unknown) => {
    const s = v === undefined || v === null ? "" : typeof v === "string" ? v : JSON.stringify(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = events.map((e) => [
    e.id,
    new Date(e.timestamp).toISOString(),
    e.source,
    e.channel,
    e.kind,
    e.severity,
    e.title,
    e.message ?? "",
    (e.tags ?? []).join(";"),
    e.jobId ?? "",
  ].map(escape).join(","));
  return [headers.join(","), ...rows].join("\n");
}
