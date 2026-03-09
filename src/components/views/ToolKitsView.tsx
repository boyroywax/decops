import { useState, useMemo } from "react";
import type { Toolkit, ToolkitCategory, ViewId, NavContext } from "@/types";
import { TOOLKITS } from "@/services/toolkits";
import {
  Bot, ArrowLeftRight, MessageSquare, Globe, Network, Download,
  Zap, Vote, FileText, Clapperboard, ListChecks, Image, Settings,
  FolderOpen, Sparkles, Search, Wrench, ScanText, AudioLines, Video,
  ChevronDown, ChevronUp, Play, ExternalLink, Link2, Camera, Layers,
  Terminal, Clock, CheckCircle2, Lock, Hash, Filter, X, Package,
  Briefcase, Database, Shield, FlaskConical, BookOpen, Bell,
  GitBranch, RefreshCcw, ClipboardList, BarChart3, Activity, Plug,
} from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
import { StudioBotPanel } from "@/toolkits/studio";
import { ArchitectBotPanel } from "@/toolkits/architect";
import "../../styles/components/toolkits.css";

/** Map toolkit icon names → Lucide components */
const ICON_MAP: Record<string, any> = {
  Bot, ArrowLeftRight, MessageSquare, Globe, Network, Download,
  Zap, Vote, FileText, Clapperboard, ListChecks, Image, Settings,
  FolderOpen, Sparkles, Search, Wrench, ScanText, AudioLines, Video,
};

/** Map tool IDs → icons */
const TOOL_ICONS: Record<string, any> = {
  fetch_url: ExternalLink,
  crawl_site: Search,
  extract_links: Link2,
  screenshot_url: Camera,
  ocr_image: ScanText,
  ocr_pdf: ScanText,
  transcribe_audio: AudioLines,
  transcribe_video: Video,
  describe_frames: Layers,
};

type CategoryFilter = "all" | ToolkitCategory;

const CATEGORY_LABELS: Record<CategoryFilter, string> = {
  all: "All",
  agents: "Agents",
  infrastructure: "Infrastructure",
  data: "Data",
  ai: "AI & Intelligence",
  automation: "Automation",
  system: "System",
  media: "Media",
  "data-ingestion": "Data Ingestion",
  analysis: "Analysis",
};

interface ToolKitsViewProps {
  navigateTo: (view: ViewId, ctx: NavContext) => void;
}

export function ToolKitsView({ navigateTo }: ToolKitsViewProps) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "available" | "coming-soon">("all");
  const [expandedToolkit, setExpandedToolkit] = useState<string | null>(null);
  const [quickActionToolkit, setQuickActionToolkit] = useState<string | null>(null);
  const [quickActionTool, setQuickActionTool] = useState<string | null>(null);
  const [quickActionInputs, setQuickActionInputs] = useState<Record<string, string>>({});

  // Derive available categories from actual toolkits
  const availableCategories = useMemo(() => {
    const cats = new Set<ToolkitCategory>();
    TOOLKITS.forEach(tk => cats.add(tk.category));
    return ["all" as const, ...Array.from(cats).sort()];
  }, []);

  const filtered = useMemo(() => {
    return TOOLKITS.filter(tk => {
      if (categoryFilter !== "all" && tk.category !== categoryFilter) return false;
      if (statusFilter !== "all" && tk.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          tk.name.toLowerCase().includes(q) ||
          tk.description.toLowerCase().includes(q) ||
          tk.commands.some(c => c.toLowerCase().includes(q)) ||
          tk.tools.some(t => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)) ||
          (tk.agents || []).some(a => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)) ||
          (tk.tags || []).some(t => t.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [search, categoryFilter, statusFilter]);

  const totalCommands = TOOLKITS.reduce((sum, tk) => sum + tk.commands.length, 0);
  const totalTools = TOOLKITS.reduce((sum, tk) => sum + tk.tools.length, 0);
  const totalAgents = TOOLKITS.reduce((sum, tk) => sum + (tk.agents || []).length, 0);
  const totalFacets = TOOLKITS.reduce((sum, tk) => sum + (tk.facets?.length ?? 0), 0);
  const availableCount = TOOLKITS.filter(tk => tk.status === "available").length;

  const toggleExpanded = (id: string) => {
    setExpandedToolkit(prev => prev === id ? null : id);
    setQuickActionToolkit(null);
    setQuickActionTool(null);
    setQuickActionInputs({});
  };

  const openQuickAction = (tkId: string, toolId: string) => {
    setQuickActionToolkit(tkId);
    setQuickActionTool(toolId);
    setQuickActionInputs({});
  };

  const renderToolkitIcon = (tk: Toolkit, size: number) => {
    const IconComp = ICON_MAP[tk.icon] || Wrench;
    return <GradientIcon icon={IconComp} size={size} gradient={tk.gradient} />;
  };

  const renderQuickAction = (tk: Toolkit) => {
    if (quickActionToolkit !== tk.id || !quickActionTool) return null;
    const tool = tk.tools.find(t => t.id === quickActionTool);
    if (!tool) return null;

    const schema = tool.inputSchema || {};
    const paramKeys = Object.keys(schema);

    return (
      <div className="toolkits__quick-action">
        <div className="toolkits__quick-action-header">
          <div className="toolkits__quick-action-title">
            <Play size={12} />
            <span>{tool.name}</span>
          </div>
          <button
            className="btn-ghost"
            onClick={() => { setQuickActionToolkit(null); setQuickActionTool(null); setQuickActionInputs({}); }}
          >
            <X size={12} />
          </button>
        </div>
        <p className="toolkits__quick-action-desc">{tool.description}</p>
        {paramKeys.length > 0 && (
          <div className="toolkits__quick-action-form">
            {paramKeys.map(key => {
              const param = schema[key];
              return (
                <div key={key} className="toolkits__quick-action-field">
                  <label>
                    {key}
                    {param.required && <span className="toolkits__required">*</span>}
                  </label>
                  <input
                    type={param.type === "number" ? "number" : "text"}
                    placeholder={param.default !== undefined ? `${param.default}` : param.description}
                    value={quickActionInputs[key] || ""}
                    onChange={e => setQuickActionInputs(prev => ({ ...prev, [key]: e.target.value }))}
                  />
                  {param.description && <span className="toolkits__field-hint">{param.description}</span>}
                </div>
              );
            })}
            <button className="btn-primary toolkits__run-btn">
              <Play size={12} /> Run
            </button>
          </div>
        )}
        {paramKeys.length === 0 && (
          <button className="btn-primary toolkits__run-btn">
            <Play size={12} /> Run
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="toolkits">
      {/* ── Header ── */}
      <div className="toolkits__header">
        <div className="toolkits__header-left">
          <GradientIcon icon={Wrench} size={24} gradient={["#f97316", "#fb923c"]} />
          <div>
            <h2 className="toolkits__title">Tool Kits</h2>
            <p className="toolkits__subtitle">
              {availableCount} active · {totalCommands} commands · {totalTools} tools{totalAgents > 0 ? ` · ${totalAgents} agents` : ''} · {totalFacets} facets
            </p>
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="toolkits__filters">
        <div className="toolkits__search">
          <Search size={14} />
          <input
            type="text"
            placeholder="Search toolkits, commands, tools…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="btn-ghost" onClick={() => setSearch("")}>
              <X size={12} />
            </button>
          )}
        </div>
        <div className="toolkits__filter-group">
          <Filter size={12} />
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value as CategoryFilter)}
          >
            {availableCategories.map(cat => (
              <option key={cat} value={cat}>{CATEGORY_LABELS[cat] || cat}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as "all" | "available" | "coming-soon")}
          >
            <option value="all">All Status</option>
            <option value="available">Available</option>
            <option value="coming-soon">Coming Soon</option>
          </select>
        </div>
      </div>

      {/* ── Toolkit Grid ── */}
      <div className="toolkits__grid">
        {filtered.map(tk => {
          const isExpanded = expandedToolkit === tk.id;
          const IconComp = ICON_MAP[tk.icon] || Wrench;
          const agentCount = (tk.agents || []).length;
          const itemCount = tk.commands.length + tk.tools.length + agentCount;

          return (
            <div
              key={tk.id}
              className={`toolkits__card ${isExpanded ? 'toolkits__card--expanded' : ''} ${tk.status === 'coming-soon' ? 'toolkits__card--coming-soon' : ''}`}
            >
              {/* Card header */}
              <button
                className="toolkits__card-header"
                onClick={() => toggleExpanded(tk.id)}
              >
                <div className="toolkits__card-icon" style={{ background: `linear-gradient(135deg, ${tk.gradient[0]}22, ${tk.gradient[1]}11)` }}>
                  {renderToolkitIcon(tk, 20)}
                </div>
                <div className="toolkits__card-info">
                  <div className="toolkits__card-name">
                    {tk.name}
                    {tk.builtIn && (
                      <span className="toolkits__badge toolkits__badge--builtin">
                        <Package size={9} /> Built-in
                      </span>
                    )}
                    {agentCount > 0 && (
                      <span className="toolkits__badge toolkits__badge--bot">
                        <Bot size={9} /> {agentCount} Bot{agentCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    {tk.status === "coming-soon" && (
                      <span className="toolkits__badge toolkits__badge--soon">
                        <Clock size={10} /> Soon
                      </span>
                    )}
                    {tk.status === "available" && (
                      <span className="toolkits__badge toolkits__badge--active">
                        <CheckCircle2 size={10} /> Active
                      </span>
                    )}
                  </div>
                  <p className="toolkits__card-desc">{tk.description}</p>
                  <div className="toolkits__card-meta">
                    <span className="toolkits__card-category">{CATEGORY_LABELS[tk.category] || tk.category}</span>
                    {tk.commands.length > 0 && (
                      <span className="toolkits__card-count">
                        <Terminal size={10} /> {tk.commands.length} cmd{tk.commands.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {tk.tools.length > 0 && (
                      <span className="toolkits__card-count">
                        <Wrench size={10} /> {tk.tools.length} tool{tk.tools.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {agentCount > 0 && (
                      <span className="toolkits__card-count toolkits__card-count--agent">
                        <Bot size={10} /> {agentCount} agent{agentCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    {tk.version && (
                      <span className="toolkits__card-count toolkits__card-count--version">
                        <GitBranch size={10} /> v{tk.version}
                      </span>
                    )}
                    {(tk.facets?.length ?? 0) > 3 && (
                      <span className="toolkits__card-count toolkits__card-count--facets">
                        <Package size={10} /> {tk.facets!.length} facets
                      </span>
                    )}
                  </div>
                </div>
                <div className="toolkits__card-actions">
                  <span
                    role="button"
                    tabIndex={0}
                    className="btn-ghost toolkits__details-btn"
                    onClick={(e) => { e.stopPropagation(); navigateTo("toolkits", { toolkitId: tk.id }); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); navigateTo("toolkits", { toolkitId: tk.id }); } }}
                    title="View details"
                  >
                    <ExternalLink size={12} />
                  </span>
                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="toolkits__card-body">
                  {/* Agents section */}
                  {(tk.agents || []).length > 0 && (
                    <div className="toolkits__section">
                      <h4 className="toolkits__section-title">
                        <Bot size={12} /> Agents
                      </h4>
                      {/* Studio Bot — special interactive panel */}
                      {tk.id === "studio" && <StudioBotPanel />}
                      {/* Architect Bot — network design panel */}
                      {tk.id === "ecosystem" && <ArchitectBotPanel navigateTo={navigateTo} />}
                    </div>
                  )}

                  {/* Commands section */}
                  {tk.commands.length > 0 && (
                    <div className="toolkits__section">
                      <h4 className="toolkits__section-title">
                        <Terminal size={12} /> Commands
                      </h4>
                      <div className="toolkits__command-list">
                        {tk.commands.map(cmdId => (
                          <div key={cmdId} className="toolkits__command-item">
                            <code>{cmdId}</code>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tools section (with quick actions) */}
                  {tk.tools.length > 0 && (
                    <div className="toolkits__section">
                      <h4 className="toolkits__section-title">
                        <Wrench size={12} /> Tools
                      </h4>
                      <div className="toolkits__tool-list">
                        {tk.tools.map(tool => {
                          const ToolIcon = TOOL_ICONS[tool.id] || Wrench;
                          return (
                            <div key={tool.id} className="toolkits__tool-item">
                              <div className="toolkits__tool-header">
                                <ToolIcon size={13} style={{ color: tk.color }} />
                                <span className="toolkits__tool-name">{tool.name}</span>
                                <span className="toolkits__tool-desc">{tool.description}</span>
                                {tk.status === "available" && tool.inputSchema && (
                                  <button
                                    className="btn-ghost toolkits__try-btn"
                                    onClick={() => openQuickAction(tk.id, tool.id)}
                                  >
                                    <Play size={11} /> Try
                                  </button>
                                )}
                              </div>
                              {quickActionToolkit === tk.id && quickActionTool === tool.id && renderQuickAction(tk)}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Tags */}
                  {(tk.tags || []).length > 0 && (
                    <div className="toolkits__tags">
                      {(tk.tags || []).map(tag => (
                        <span
                          key={tag}
                          className="toolkits__tag"
                          onClick={() => setSearch(tag)}
                          title={`Filter by "${tag}"`}
                        >
                          <Hash size={9} /> {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Facet Summary */}
                  {tk.facets && tk.facets.length > 3 && (
                    <div className="toolkits__facet-summary">
                      <h4 className="toolkits__section-title">
                        <Package size={12} /> Capabilities
                      </h4>
                      <div className="toolkits__facet-grid">
                        {(tk.jobTemplates?.length ?? 0) > 0 && (
                          <span className="toolkits__facet-item"><Briefcase size={10} /> {tk.jobTemplates!.length} jobs</span>
                        )}
                        {(tk.automations?.length ?? 0) > 0 && (
                          <span className="toolkits__facet-item"><RefreshCcw size={10} /> {tk.automations!.length} automations</span>
                        )}
                        {(tk.taskCount ?? 0) > 0 && (
                          <span className="toolkits__facet-item"><ClipboardList size={10} /> {tk.taskCount} tasks</span>
                        )}
                        {(tk.collectionCount ?? 0) > 0 && (
                          <span className="toolkits__facet-item"><Database size={10} /> {tk.collectionCount} collections</span>
                        )}
                        {(tk.configFieldCount ?? 0) > 0 && (
                          <span className="toolkits__facet-item"><Settings size={10} /> {tk.configFieldCount} config fields</span>
                        )}
                        {(tk.metricCount ?? 0) > 0 && (
                          <span className="toolkits__facet-item"><BarChart3 size={10} /> {tk.metricCount} metrics</span>
                        )}
                        {(tk.notificationCount ?? 0) > 0 && (
                          <span className="toolkits__facet-item"><Bell size={10} /> {tk.notificationCount} notifications</span>
                        )}
                        {(tk.permissionCount ?? 0) > 0 && (
                          <span className="toolkits__facet-item"><Shield size={10} /> {tk.permissionCount} permissions</span>
                        )}
                        {(tk.testCount ?? 0) > 0 && (
                          <span className="toolkits__facet-item"><FlaskConical size={10} /> {tk.testCount} tests</span>
                        )}
                        {(tk.docCount ?? 0) > 0 && (
                          <span className="toolkits__facet-item"><BookOpen size={10} /> {tk.docCount} docs</span>
                        )}
                        {(tk.endpointCount ?? 0) > 0 && (
                          <span className="toolkits__facet-item"><Plug size={10} /> {tk.endpointCount} endpoints</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="toolkits__empty">
          <Search size={24} />
          <p>No toolkits match your filters.</p>
          <button className="btn-ghost" onClick={() => { setSearch(""); setCategoryFilter("all"); setStatusFilter("all"); }}>
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
