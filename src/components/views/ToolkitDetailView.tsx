import { useState } from "react";
import type { Agent, ToolkitId, ViewId, NavContext } from "@/types";
import { TOOLKITS } from "@/services/toolkits";
import { registry } from "@/services/commands/registry";
import { toolkitRegistry } from "@/services/toolkits";
import {
  Globe, ScanText, AudioLines, Video, Bot, ArrowLeftRight,
  MessageSquare, Network, Download, Zap, Vote, FileText,
  Clapperboard, ListChecks, Image, Settings, FolderOpen,
  Sparkles, Wrench, Terminal, Hash, Shield,
  ExternalLink, Play, Link2, Search, Camera,
  Layers, Clock, CheckCircle2, AlertCircle,
  ChevronDown, ChevronUp,
  Briefcase, RefreshCcw, ClipboardList, Database, Bell,
  BarChart3, FlaskConical, BookOpen, Plug, Package,
  Activity, User, GitBranch, Lock, Eye, Tag,
  FileCode, Server, Workflow,
} from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
import { ArchitectBotPanel } from "@/toolkits/architect";
import "../../styles/components/toolkit-detail.css";

/** Map toolkit icon names to actual Lucide components */
const ICON_MAP: Record<string, any> = {
  Globe, ScanText, AudioLines, Video, Bot, ArrowLeftRight,
  MessageSquare, Network, Download, Zap, Vote, FileText,
  Clapperboard, ListChecks, Image, Settings, FolderOpen,
  Sparkles, Search, Wrench,
};

interface ToolkitDetailViewProps {
  toolkitId: ToolkitId;
  agent?: Agent;
  updateAgent?: (id: string, patch: Partial<Agent>) => void;
  navigateTo: (view: ViewId, ctx: NavContext) => void;
}

/** Map tool IDs to icons */
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

export function ToolkitDetailView({ toolkitId, agent, updateAgent, navigateTo }: ToolkitDetailViewProps) {
  const toolkit = TOOLKITS.find(t => t.id === toolkitId);
  const module = toolkitRegistry.get(toolkitId);
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [expandedCommand, setExpandedCommand] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [crawlUrl, setCrawlUrl] = useState("");
  const [crawlDepth, setCrawlDepth] = useState(2);
  const [crawlMaxPages, setCrawlMaxPages] = useState(10);
  const [crawlFormat, setCrawlFormat] = useState<"markdown" | "text" | "html">("markdown");
  const toggleSection = (id: string) => setExpandedSection(prev => prev === id ? null : id);

  const PRIORITY_COLORS: Record<string, string> = {
    low: "#94a3b8", medium: "#fbbf24", high: "#f97316", critical: "#ef4444",
  };
  const METHOD_COLORS: Record<string, string> = {
    GET: "#22c55e", POST: "#3b82f6", PUT: "#f97316", PATCH: "#a855f7", DELETE: "#ef4444",
  };

  if (!toolkit) {
    return (
      <div className="toolkit-detail__empty">
        Toolkit not found.
      </div>
    );
  }

  const isEnabled = agent?.toolkits?.some(t => t.toolkitId === toolkitId) ?? false;
  const binding = agent?.toolkits?.find(t => t.toolkitId === toolkitId);
  const IconComponent = ICON_MAP[toolkit.icon] || Globe;
  const isComingSoon = toolkit.status === "coming-soon";

  const handleToggleToolkit = () => {
    if (!updateAgent || !agent) return;
    if (isEnabled) {
      // Remove toolkit
      updateAgent(agent.id, {
        toolkits: (agent.toolkits || []).filter(t => t.toolkitId !== toolkitId),
      });
    } else {
      // Enable toolkit
      updateAgent(agent.id, {
        toolkits: [...(agent.toolkits || []), {
          toolkitId,
          enabledAt: new Date().toISOString(),
          config: {},
        }],
      });
    }
  };

  return (
    <div className="toolkit-detail">
      {/* Header */}
      <div className="toolkit-detail__header">
        <div className="toolkit-detail__header-left">
          <div className="toolkit-detail__icon" style={{ background: `${toolkit.color}15`, border: `1px solid ${toolkit.color}25` }}>
            <GradientIcon icon={IconComponent} size={28} gradient={toolkit.gradient} />
          </div>
          <div>
            <h2 className="toolkit-detail__title">{toolkit.name}</h2>
            <p className="toolkit-detail__desc">{toolkit.description}</p>
            <div className="toolkit-detail__meta">
              <span className="toolkit-detail__category">
                {toolkit.category.replace("-", " ")}
              </span>
              <span className={`toolkit-detail__status toolkit-detail__status--${toolkit.status}`}>
                {toolkit.status === "available" ? (
                  <><CheckCircle2 size={10} /> Available</>
                ) : (
                  <><Clock size={10} /> Coming Soon</>
                )}
              </span>
              <span className="toolkit-detail__tool-count">
                <Layers size={10} /> {toolkit.tools.length} tools
              </span>
              {toolkit.version && (
                <span className="toolkit-detail__version-badge">
                  <GitBranch size={10} /> v{toolkit.version}
                </span>
              )}
              {toolkit.author && (
                <span className="toolkit-detail__author-badge">
                  <User size={10} /> {typeof toolkit.author === 'string' ? toolkit.author : toolkit.author.name}
                </span>
              )}
              {toolkit.license && (
                <span className="toolkit-detail__license-badge">
                  <FileCode size={10} /> {toolkit.license}
                </span>
              )}
            </div>
          </div>
        </div>
        {!isComingSoon && agent && (
          <button
            className={`toolkit-detail__toggle ${isEnabled ? "toolkit-detail__toggle--active" : ""}`}
            onClick={handleToggleToolkit}
          >
            {isEnabled ? "Enabled" : "Enable"}
          </button>
        )}
      </div>

      {/* Enabled status */}
      {isEnabled && binding && agent && (
        <div className="toolkit-detail__enabled-bar" style={{ borderColor: `${toolkit.color}30` }}>
          <CheckCircle2 size={12} style={{ color: toolkit.color }} />
          <span>Enabled for <strong>{agent.name}</strong></span>
          <span className="toolkit-detail__enabled-date">
            since {new Date(binding.enabledAt).toLocaleDateString()}
          </span>
        </div>
      )}

      {/* Facet Overview Strip */}
      {toolkit.facets && toolkit.facets.length > 0 && (
        <div className="toolkit-detail__facets-strip">
          <div className="toolkit-detail__facets-label">
            <Package size={10} /> {toolkit.facets.length} Facets
          </div>
          <div className="toolkit-detail__facets-badges">
            {toolkit.facets.map(facet => (
              <span
                key={facet}
                className="toolkit-detail__facet-badge"
                onClick={() => {
                  const el = document.getElementById(`facet-${facet}`);
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                {facet === 'commands' && <Terminal size={9} />}
                {facet === 'tools' && <Wrench size={9} />}
                {facet === 'agents' && <Bot size={9} />}
                {facet === 'jobs' && <Briefcase size={9} />}
                {facet === 'automations' && <RefreshCcw size={9} />}
                {facet === 'tasks' && <ClipboardList size={9} />}
                {facet === 'collections' && <Database size={9} />}
                {facet === 'ui' && <Eye size={9} />}
                {facet === 'configuration' && <Settings size={9} />}
                {facet === 'logging' && <Activity size={9} />}
                {facet === 'notifications' && <Bell size={9} />}
                {facet === 'metrics' && <BarChart3 size={9} />}
                {facet === 'rbac' && <Shield size={9} />}
                {facet === 'tests' && <FlaskConical size={9} />}
                {facet === 'docs' && <BookOpen size={9} />}
                {facet === 'api' && <Plug size={9} />}
                {facet === 'metadata' && <Tag size={9} />}
                {facet}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Commands List */}
      {toolkit.commands.length > 0 && (
        <div className="toolkit-detail__section">
          <div className="toolkit-detail__section-title">
            <Terminal size={12} style={{ display: "inline", verticalAlign: "middle" }} /> Commands ({toolkit.commands.length})
          </div>
          <div className="toolkit-detail__tools">
            {toolkit.commands.map(cmdId => {
              const cmdDef = registry.get(cmdId);
              const isExpanded = expandedCommand === cmdId;
              const args = cmdDef ? Object.entries(cmdDef.args) : [];
              return (
                <div
                  key={cmdId}
                  className={`toolkit-detail__tool ${isExpanded ? "toolkit-detail__tool--expanded" : ""}`}
                >
                  <button
                    className="toolkit-detail__tool-header"
                    onClick={() => setExpandedCommand(isExpanded ? null : cmdId)}
                  >
                    <div className="toolkit-detail__tool-info">
                      <span className="toolkit-detail__tool-icon" style={{ color: toolkit.color }}>
                        <Terminal size={14} />
                      </span>
                      <div>
                        <div className="toolkit-detail__tool-name">
                          <code style={{ fontSize: "inherit", background: "none", padding: 0, border: "none" }}>{cmdId}</code>
                          {cmdDef?.usesAI && (
                            <span className="toolkit-detail__ai-badge">
                              <Sparkles size={9} /> AI
                            </span>
                          )}
                        </div>
                        <div className="toolkit-detail__tool-desc">
                          {cmdDef?.description || ""}
                        </div>
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {isExpanded && cmdDef && (
                    <div className="toolkit-detail__tool-schema">
                      {args.length > 0 && (
                        <>
                          <div className="toolkit-detail__schema-title">Parameters</div>
                          {args.map(([key, arg]) => (
                            <div key={key} className="toolkit-detail__schema-row">
                              <code className="toolkit-detail__schema-key">{arg.name}</code>
                              <span className="toolkit-detail__schema-type">{arg.type}</span>
                              <span className="toolkit-detail__schema-desc">{arg.description}</span>
                              {(arg.required !== false) && <span className="toolkit-detail__schema-required">required</span>}
                              {arg.defaultValue !== undefined && (
                                <span className="toolkit-detail__schema-default">default: {String(arg.defaultValue)}</span>
                              )}
                              {arg.enum && (
                                <span className="toolkit-detail__schema-default">options: {arg.enum.join(", ")}</span>
                              )}
                            </div>
                          ))}
                        </>
                      )}
                      {args.length === 0 && (
                        <div className="toolkit-detail__schema-empty">No parameters required</div>
                      )}
                      <div className="toolkit-detail__cmd-footer">
                        {cmdDef.output && (
                          <div className="toolkit-detail__cmd-output">
                            <span className="toolkit-detail__schema-type">output</span>
                            <span className="toolkit-detail__schema-desc">{cmdDef.output}</span>
                          </div>
                        )}
                        {cmdDef.tags.length > 0 && (
                          <div className="toolkit-detail__cmd-tags">
                            {cmdDef.tags.map(tag => (
                              <span key={tag} className="toolkit-detail__cmd-tag">
                                <Hash size={8} /> {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="toolkit-detail__cmd-roles">
                          <Shield size={10} />
                          {cmdDef.rbac.map(r => (
                            <span key={r} className="toolkit-detail__cmd-role">{r}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Agents List */}
      {toolkit.agents && toolkit.agents.length > 0 && (
        <div className="toolkit-detail__section">
          <div className="toolkit-detail__section-title">
            <Bot size={12} style={{ display: "inline", verticalAlign: "middle" }} /> Agents ({toolkit.agents.length})
          </div>

          {/* Architect Bot — rich interactive panel */}
          {toolkitId === "ecosystem" && (
            <ArchitectBotPanel navigateTo={navigateTo} />
          )}

          {/* Generic agent cards for other toolkits */}
          {toolkitId !== "ecosystem" && (
            <div className="toolkit-detail__tools">
              {toolkit.agents.map(ag => (
                <div key={ag.id} className="toolkit-detail__tool toolkit-detail__tool--expanded">
                  <div className="toolkit-detail__tool-header" style={{ cursor: "default" }}>
                    <div className="toolkit-detail__tool-info">
                      <span className="toolkit-detail__tool-icon" style={{ color: toolkit.color }}>
                        <Bot size={14} />
                      </span>
                      <div>
                        <div className="toolkit-detail__tool-name">
                          {ag.name}
                          {ag.status && (
                            <span
                              className="toolkit-detail__ai-badge"
                              style={ag.status === "active" ? { background: "color-mix(in srgb, var(--color-researcher) 12%, transparent)", color: "var(--color-researcher)" } : undefined}
                            >
                              {ag.status === "active" ? <><CheckCircle2 size={9} /> Active</> : ag.status}
                            </span>
                          )}
                          {ag.aieos && (
                            <span className="toolkit-detail__ai-badge">
                              <Sparkles size={9} /> AIEOS
                            </span>
                          )}
                        </div>
                        <div className="toolkit-detail__tool-desc">{ag.description}</div>
                      </div>
                    </div>
                  </div>
                  {ag.capabilities && ag.capabilities.length > 0 && (
                    <div className="toolkit-detail__tool-schema">
                      <div className="toolkit-detail__schema-title">Capabilities</div>
                      {ag.capabilities.map(cap => (
                        <div key={cap} className="toolkit-detail__schema-row">
                          <Zap size={10} style={{ color: toolkit.color, flexShrink: 0 }} />
                          <span className="toolkit-detail__schema-desc">{cap}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tools List */}
      <div className="toolkit-detail__section">
        <div className="toolkit-detail__section-title">
          Tools ({toolkit.tools.length})
        </div>
        <div className="toolkit-detail__tools">
          {toolkit.tools.map((tool) => {
            const ToolIcon = TOOL_ICONS[tool.id] || Globe;
            const isExpanded = expandedTool === tool.id;
            return (
              <div
                key={tool.id}
                className={`toolkit-detail__tool ${isExpanded ? "toolkit-detail__tool--expanded" : ""}`}
              >
                <button
                  className="toolkit-detail__tool-header"
                  onClick={() => setExpandedTool(isExpanded ? null : tool.id)}
                >
                  <div className="toolkit-detail__tool-info">
                    <span className="toolkit-detail__tool-icon" style={{ color: toolkit.color }}>
                      <ToolIcon size={14} />
                    </span>
                    <div>
                      <div className="toolkit-detail__tool-name">{tool.name}</div>
                      <div className="toolkit-detail__tool-desc">{tool.description}</div>
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {isExpanded && tool.inputSchema && (
                  <div className="toolkit-detail__tool-schema">
                    <div className="toolkit-detail__schema-title">Parameters</div>
                    {Object.entries(tool.inputSchema).map(([key, schema]: [string, any]) => (
                      <div key={key} className="toolkit-detail__schema-row">
                        <code className="toolkit-detail__schema-key">{key}</code>
                        <span className="toolkit-detail__schema-type">{schema.type || "string"}</span>
                        <span className="toolkit-detail__schema-desc">{schema.description}</span>
                        {schema.required && <span className="toolkit-detail__schema-required">required</span>}
                        {schema.default !== undefined && (
                          <span className="toolkit-detail__schema-default">default: {String(schema.default)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── NEW FACET SECTIONS ── */}

      {/* Jobs */}
      {module?.jobs && module.jobs.length > 0 && (
        <div className="toolkit-detail__section" id="facet-jobs">
          <button className="toolkit-detail__section-toggle" onClick={() => toggleSection('jobs')}>
            <div className="toolkit-detail__section-title">
              <Briefcase size={12} style={{ display: "inline", verticalAlign: "middle" }} /> Job Templates ({module.jobs.length})
            </div>
            {expandedSection === 'jobs' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {expandedSection === 'jobs' && (
            <div className="toolkit-detail__tools">
              {module.jobs.map(job => (
                <div key={job.id} className="toolkit-detail__tool toolkit-detail__tool--expanded">
                  <div className="toolkit-detail__facet-card">
                    <div className="toolkit-detail__facet-card-header">
                      <Briefcase size={14} style={{ color: toolkit.color }} />
                      <div>
                        <div className="toolkit-detail__tool-name">{job.name}</div>
                        <div className="toolkit-detail__tool-desc">{job.description}</div>
                      </div>
                    </div>
                    {(job.steps?.length ?? 0) > 0 && (
                      <div className="toolkit-detail__facet-steps">
                        <div className="toolkit-detail__schema-title">Steps ({job.steps!.length})</div>
                        {job.steps!.map((step, i) => (
                          <div key={step.id} className="toolkit-detail__step-row">
                            <span className="toolkit-detail__step-num">{i + 1}</span>
                            <span className="toolkit-detail__step-name">{step.name}</span>
                            {step.commandId && <code className="toolkit-detail__step-cmd">{step.commandId}</code>}
                            {step.toolId && <code className="toolkit-detail__step-cmd">{step.toolId}</code>}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="toolkit-detail__facet-meta">
                      {job.inputs && job.inputs.length > 0 && (
                        <span className="toolkit-detail__facet-chip"><Download size={9} /> {job.inputs.length} inputs</span>
                      )}
                      {job.outputs && job.outputs.length > 0 && (
                        <span className="toolkit-detail__facet-chip"><ExternalLink size={9} /> {job.outputs.length} outputs</span>
                      )}
                      {job.retries !== undefined && (
                        <span className="toolkit-detail__facet-chip"><RefreshCcw size={9} /> {job.retries} retries</span>
                      )}
                      {job.timeout !== undefined && (
                        <span className="toolkit-detail__facet-chip"><Clock size={9} /> {job.timeout}ms timeout</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Automations */}
      {module?.automations && module.automations.length > 0 && (
        <div className="toolkit-detail__section" id="facet-automations">
          <button className="toolkit-detail__section-toggle" onClick={() => toggleSection('automations')}>
            <div className="toolkit-detail__section-title">
              <RefreshCcw size={12} style={{ display: "inline", verticalAlign: "middle" }} /> Automations ({module.automations.length})
            </div>
            {expandedSection === 'automations' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {expandedSection === 'automations' && (
            <div className="toolkit-detail__tools">
              {module.automations.map(auto => (
                <div key={auto.id} className="toolkit-detail__tool toolkit-detail__tool--expanded">
                  <div className="toolkit-detail__facet-card">
                    <div className="toolkit-detail__facet-card-header">
                      <RefreshCcw size={14} style={{ color: toolkit.color }} />
                      <div style={{ flex: 1 }}>
                        <div className="toolkit-detail__tool-name">
                          {auto.name}
                          <span className={`toolkit-detail__ai-badge ${auto.enabled ? '' : 'toolkit-detail__ai-badge--disabled'}`}
                            style={auto.enabled ? { background: 'rgba(34,197,94,.12)', color: '#22c55e' } : { background: 'rgba(148,163,184,.12)', color: '#94a3b8' }}>
                            {auto.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                        <div className="toolkit-detail__tool-desc">{auto.description}</div>
                      </div>
                    </div>
                    <div className="toolkit-detail__facet-detail-row">
                      <span className="toolkit-detail__facet-label">Trigger</span>
                      <span className="toolkit-detail__facet-value">
                        <Zap size={10} /> {auto.trigger.type}
                        {auto.trigger.event && `: ${auto.trigger.event}`}
                        {auto.trigger.cron && `: ${auto.trigger.cron}`}
                      </span>
                    </div>
                    <div className="toolkit-detail__facet-detail-row">
                      <span className="toolkit-detail__facet-label">Actions</span>
                      <div className="toolkit-detail__facet-chips">
                        {auto.actions.map((action, i) => (
                          <span key={i} className="toolkit-detail__facet-chip">
                            {action.type}: {action.target}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tasks */}
      {module?.tasks && module.tasks.length > 0 && (
        <div className="toolkit-detail__section" id="facet-tasks">
          <button className="toolkit-detail__section-toggle" onClick={() => toggleSection('tasks')}>
            <div className="toolkit-detail__section-title">
              <ClipboardList size={12} style={{ display: "inline", verticalAlign: "middle" }} /> Tasks ({module.tasks.length})
            </div>
            {expandedSection === 'tasks' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {expandedSection === 'tasks' && (
            <div className="toolkit-detail__tools">
              {module.tasks.map(task => (
                <div key={task.id} className="toolkit-detail__tool toolkit-detail__tool--expanded">
                  <div className="toolkit-detail__facet-card">
                    <div className="toolkit-detail__facet-card-header">
                      <ClipboardList size={14} style={{ color: toolkit.color }} />
                      <div style={{ flex: 1 }}>
                        <div className="toolkit-detail__tool-name">
                          {task.name}
                          {task.priority && (
                            <span className="toolkit-detail__priority-badge" style={{ color: PRIORITY_COLORS[task.priority] || '#94a3b8', background: `${PRIORITY_COLORS[task.priority] || '#94a3b8'}15` }}>
                              {task.priority}
                            </span>
                          )}
                          {task.assignableToAgents && (
                            <span className="toolkit-detail__status-chip">agent-assignable</span>
                          )}
                        </div>
                        <div className="toolkit-detail__tool-desc">{task.description}</div>
                      </div>
                    </div>
                    {task.checklist && task.checklist.length > 0 && (
                      <div className="toolkit-detail__checklist">
                        {task.checklist.map(item => (
                          <div key={item.id} className="toolkit-detail__checklist-item">
                            <CheckCircle2 size={10} style={{ color: '#475569' }} />
                            <span>{item.label}</span>
                            {item.required && <span className="toolkit-detail__schema-required">required</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="toolkit-detail__facet-meta">
                      {task.assignableToUsers && <span className="toolkit-detail__facet-chip"><User size={9} /> user-assignable</span>}
                      {task.assignableToAgents && <span className="toolkit-detail__facet-chip"><Bot size={9} /> agent-assignable</span>}
                      {task.tags && task.tags.map(t => (
                        <span key={t} className="toolkit-detail__facet-chip"><Tag size={9} /> {t}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Collections */}
      {module?.collections && module.collections.length > 0 && (
        <div className="toolkit-detail__section" id="facet-collections">
          <button className="toolkit-detail__section-toggle" onClick={() => toggleSection('collections')}>
            <div className="toolkit-detail__section-title">
              <Database size={12} style={{ display: "inline", verticalAlign: "middle" }} /> Collections ({module.collections.length})
            </div>
            {expandedSection === 'collections' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {expandedSection === 'collections' && (
            <div className="toolkit-detail__tools">
              {module.collections.map(col => (
                <div key={col.id} className="toolkit-detail__tool toolkit-detail__tool--expanded">
                  <div className="toolkit-detail__facet-card">
                    <div className="toolkit-detail__facet-card-header">
                      <Database size={14} style={{ color: toolkit.color }} />
                      <div>
                        <div className="toolkit-detail__tool-name">{col.name}</div>
                        <div className="toolkit-detail__tool-desc">{col.description}</div>
                      </div>
                    </div>
                    <div className="toolkit-detail__collection-fields">
                      <div className="toolkit-detail__schema-title">Schema ({col.schema.length} fields)</div>
                      <div className="toolkit-detail__field-grid">
                        {col.schema.map(field => (
                          <div key={field.name} className="toolkit-detail__field-row">
                            <code className="toolkit-detail__schema-key">{field.name}</code>
                            <span className="toolkit-detail__schema-type">{field.type}</span>
                            {field.required && <span className="toolkit-detail__schema-required">required</span>}
                            {field.description && <span className="toolkit-detail__schema-desc">{field.description}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="toolkit-detail__facet-meta">
                      {col.indexes && col.indexes.length > 0 && (
                        <span className="toolkit-detail__facet-chip"><Search size={9} /> {col.indexes.length} indexes</span>
                      )}
                      {col.retention && (
                        <span className="toolkit-detail__facet-chip"><Clock size={9} /> {col.retention.policy} retention</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Configuration */}
      {module?.configuration && module.configuration.fields.length > 0 && (
        <div className="toolkit-detail__section" id="facet-configuration">
          <button className="toolkit-detail__section-toggle" onClick={() => toggleSection('config')}>
            <div className="toolkit-detail__section-title">
              <Settings size={12} style={{ display: "inline", verticalAlign: "middle" }} /> Configuration ({module.configuration.fields.length} fields)
            </div>
            {expandedSection === 'config' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {expandedSection === 'config' && (
            <div className="toolkit-detail__tools">
              {module.configuration.fields.map(field => (
                <div key={field.key} className="toolkit-detail__schema-row" style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <code className="toolkit-detail__schema-key">{field.key}</code>
                  <span className="toolkit-detail__schema-type">{field.type}</span>
                  <span className="toolkit-detail__schema-desc">{field.label}</span>
                  {field.required && <span className="toolkit-detail__schema-required">required</span>}
                  {field.defaultValue !== undefined && (
                    <span className="toolkit-detail__schema-default">default: {String(field.defaultValue)}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Logging */}
      {module?.logging && (module.logging.channels?.length ?? 0) > 0 && (
        <div className="toolkit-detail__section" id="facet-logging">
          <button className="toolkit-detail__section-toggle" onClick={() => toggleSection('logging')}>
            <div className="toolkit-detail__section-title">
              <Activity size={12} style={{ display: "inline", verticalAlign: "middle" }} /> Logging ({module.logging.channels!.length} channels)
            </div>
            {expandedSection === 'logging' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {expandedSection === 'logging' && (
            <div className="toolkit-detail__tools">
              {module.logging.channels!.map(ch => (
                <div key={ch.id} className="toolkit-detail__tool">
                  <div className="toolkit-detail__facet-card" style={{ padding: '10px 14px' }}>
                    <div className="toolkit-detail__facet-card-header">
                      <Activity size={14} style={{ color: toolkit.color }} />
                      <div style={{ flex: 1 }}>
                        <div className="toolkit-detail__tool-name">
                          {ch.name}
                          {ch.subscribers && ch.subscribers.length > 0 && (
                            <span className="toolkit-detail__facet-chip" style={{ marginLeft: 4 }}><Eye size={9} /> {ch.subscribers.length} subscribers</span>
                          )}
                        </div>
                        {ch.description && <div className="toolkit-detail__tool-desc">{ch.description}</div>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Notifications */}
      {module?.notifications && module.notifications.templates.length > 0 && (
        <div className="toolkit-detail__section" id="facet-notifications">
          <button className="toolkit-detail__section-toggle" onClick={() => toggleSection('notifications')}>
            <div className="toolkit-detail__section-title">
              <Bell size={12} style={{ display: "inline", verticalAlign: "middle" }} /> Notifications ({module.notifications.templates.length} templates)
            </div>
            {expandedSection === 'notifications' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {expandedSection === 'notifications' && (
            <div className="toolkit-detail__tools">
              {module.notifications.templates.map(tmpl => (
                <div key={tmpl.id} className="toolkit-detail__tool">
                  <div className="toolkit-detail__facet-card" style={{ padding: '10px 14px' }}>
                    <div className="toolkit-detail__facet-card-header">
                      <Bell size={14} style={{ color: toolkit.color }} />
                      <div style={{ flex: 1 }}>
                        <div className="toolkit-detail__tool-name">
                          {tmpl.name}
                          {tmpl.priority && (
                            <span className="toolkit-detail__priority-badge" style={{ color: PRIORITY_COLORS[tmpl.priority] || '#94a3b8', background: `${PRIORITY_COLORS[tmpl.priority] || '#94a3b8'}15` }}>
                              {tmpl.priority}
                            </span>
                          )}
                        </div>
                        <div className="toolkit-detail__tool-desc">{tmpl.description}</div>
                      </div>
                    </div>
                    <div className="toolkit-detail__facet-meta">
                      <span className="toolkit-detail__facet-chip"><MessageSquare size={9} /> {tmpl.channel}</span>
                      {tmpl.event && (
                        <span className="toolkit-detail__facet-chip"><Zap size={9} /> {tmpl.event}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Metrics */}
      {module?.metrics && module.metrics.definitions.length > 0 && (
        <div className="toolkit-detail__section" id="facet-metrics">
          <button className="toolkit-detail__section-toggle" onClick={() => toggleSection('metrics')}>
            <div className="toolkit-detail__section-title">
              <BarChart3 size={12} style={{ display: "inline", verticalAlign: "middle" }} /> Metrics ({module.metrics.definitions.length})
            </div>
            {expandedSection === 'metrics' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {expandedSection === 'metrics' && (
            <div className="toolkit-detail__tools">
              {module.metrics.definitions.map(metric => (
                <div key={metric.name} className="toolkit-detail__schema-row" style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <code className="toolkit-detail__schema-key">{metric.name}</code>
                  <span className="toolkit-detail__schema-type">{metric.type}</span>
                  <span className="toolkit-detail__schema-desc">{metric.description}</span>
                  {metric.unit && <span className="toolkit-detail__schema-default">{metric.unit}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* RBAC */}
      {module?.rbac && (module.rbac.permissions.length > 0 || module.rbac.roles.length > 0) && (
        <div className="toolkit-detail__section" id="facet-rbac">
          <button className="toolkit-detail__section-toggle" onClick={() => toggleSection('rbac')}>
            <div className="toolkit-detail__section-title">
              <Shield size={12} style={{ display: "inline", verticalAlign: "middle" }} /> RBAC ({module.rbac.permissions.length} permissions · {module.rbac.roles.length} roles)
            </div>
            {expandedSection === 'rbac' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {expandedSection === 'rbac' && (
            <div className="toolkit-detail__rbac-content">
              {module.rbac.permissions.length > 0 && (
                <div className="toolkit-detail__rbac-group">
                  <div className="toolkit-detail__schema-title"><Lock size={10} /> Permissions</div>
                  <div className="toolkit-detail__tools">
                    {module.rbac.permissions.map(perm => (
                      <div key={perm.id} className="toolkit-detail__schema-row" style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <code className="toolkit-detail__schema-key">{perm.id}</code>
                        <span className="toolkit-detail__schema-desc">{perm.description}</span>
                        <div className="toolkit-detail__perm-actions">
                          {perm.actions.map(a => (
                            <span key={a} className="toolkit-detail__perm-action">{a}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {module.rbac.roles.length > 0 && (
                <div className="toolkit-detail__rbac-group">
                  <div className="toolkit-detail__schema-title"><User size={10} /> Roles</div>
                  <div className="toolkit-detail__tools">
                    {module.rbac.roles.map(role => (
                      <div key={role.id} className="toolkit-detail__tool toolkit-detail__tool--expanded">
                        <div className="toolkit-detail__facet-card" style={{ padding: '10px 14px' }}>
                          <div className="toolkit-detail__tool-name">{role.name}</div>
                          <div className="toolkit-detail__tool-desc">{role.description}</div>
                          <div className="toolkit-detail__facet-meta" style={{ marginTop: 6 }}>
                            {role.permissions.map(p => (
                              <span key={p} className="toolkit-detail__facet-chip"><Shield size={9} /> {p}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tests */}
      {module?.tests && module.tests.tests.length > 0 && (
        <div className="toolkit-detail__section" id="facet-tests">
          <button className="toolkit-detail__section-toggle" onClick={() => toggleSection('tests')}>
            <div className="toolkit-detail__section-title">
              <FlaskConical size={12} style={{ display: "inline", verticalAlign: "middle" }} /> Tests ({module.tests.tests.length})
            </div>
            {expandedSection === 'tests' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {expandedSection === 'tests' && (
            <div className="toolkit-detail__tools">
              {module.tests.tests.map(test => (
                <div key={test.id} className="toolkit-detail__tool">
                  <div className="toolkit-detail__facet-card" style={{ padding: '10px 14px' }}>
                    <div className="toolkit-detail__facet-card-header">
                      <FlaskConical size={14} style={{ color: toolkit.color }} />
                      <div style={{ flex: 1 }}>
                        <div className="toolkit-detail__tool-name">
                          {test.name}
                          <span className="toolkit-detail__test-type">{test.type}</span>
                        </div>
                        <div className="toolkit-detail__tool-desc">{test.description}</div>
                      </div>
                    </div>
                    <div className="toolkit-detail__facet-meta">
                      <span className="toolkit-detail__facet-chip">{test.assertions?.length ?? 0} assertions</span>
                      {test.timeout && <span className="toolkit-detail__facet-chip"><Clock size={9} /> {test.timeout}ms</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Documentation */}
      {module?.docs && module.docs.documents.length > 0 && (
        <div className="toolkit-detail__section" id="facet-docs">
          <button className="toolkit-detail__section-toggle" onClick={() => toggleSection('docs')}>
            <div className="toolkit-detail__section-title">
              <BookOpen size={12} style={{ display: "inline", verticalAlign: "middle" }} /> Documentation ({module.docs.documents.length})
            </div>
            {expandedSection === 'docs' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {expandedSection === 'docs' && (
            <div className="toolkit-detail__tools">
              {module.docs.documents.map(doc => (
                <div key={doc.id} className="toolkit-detail__tool">
                  <div className="toolkit-detail__facet-card" style={{ padding: '10px 14px' }}>
                    <div className="toolkit-detail__facet-card-header">
                      <BookOpen size={14} style={{ color: toolkit.color }} />
                      <div style={{ flex: 1 }}>
                        <div className="toolkit-detail__tool-name">
                          {doc.title}
                          <span className="toolkit-detail__test-type">{doc.type}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* API Endpoints */}
      {module?.api && module.api.endpoints.length > 0 && (
        <div className="toolkit-detail__section" id="facet-api">
          <button className="toolkit-detail__section-toggle" onClick={() => toggleSection('api')}>
            <div className="toolkit-detail__section-title">
              <Plug size={12} style={{ display: "inline", verticalAlign: "middle" }} /> API Endpoints ({module.api.endpoints.length})
            </div>
            {expandedSection === 'api' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {expandedSection === 'api' && (
            <div className="toolkit-detail__tools">
              <div className="toolkit-detail__api-base">
                <Server size={10} /> Base: <code>{module.api.basePath}</code>
                {module.api.version && (
                  <span className="toolkit-detail__facet-chip"><GitBranch size={9} /> {module.api.version}</span>
                )}
              </div>
              {module.api.endpoints.map((ep, i) => (
                <div key={i} className="toolkit-detail__tool">
                  <div className="toolkit-detail__facet-card" style={{ padding: '10px 14px' }}>
                    <div className="toolkit-detail__api-endpoint">
                      <span className="toolkit-detail__http-method" style={{ color: METHOD_COLORS[ep.method] || '#94a3b8', background: `${METHOD_COLORS[ep.method] || '#94a3b8'}15` }}>
                        {ep.method}
                      </span>
                      <code className="toolkit-detail__api-path">{ep.path}</code>
                      <span className="toolkit-detail__tool-desc">{ep.description}</span>
                      {ep.auth && <Lock size={10} style={{ color: '#fbbf24', flexShrink: 0 }} />}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* UI Contributions */}
      {module?.ui && module.ui.contributions && module.ui.contributions.length > 0 && (
        <div className="toolkit-detail__section" id="facet-ui">
          <button className="toolkit-detail__section-toggle" onClick={() => toggleSection('ui')}>
            <div className="toolkit-detail__section-title">
              <Eye size={12} style={{ display: "inline", verticalAlign: "middle" }} /> UI Contributions ({module.ui.contributions.length})
            </div>
            {expandedSection === 'ui' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {expandedSection === 'ui' && (
            <div className="toolkit-detail__tools">
              {module.ui.contributions.map(contrib => (
                <div key={contrib.id} className="toolkit-detail__schema-row" style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <span className="toolkit-detail__ui-type">{contrib.type}</span>
                  <span className="toolkit-detail__schema-desc">{contrib.label}</span>
                  {contrib.route && <code className="toolkit-detail__schema-key">{contrib.route}</code>}
                  {contrib.requiredPermission && <span className="toolkit-detail__facet-chip"><Lock size={9} /> {contrib.requiredPermission}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* OCI / Packaging Info */}
      {toolkit.version && (
        <div className="toolkit-detail__section" id="facet-metadata">
          <button className="toolkit-detail__section-toggle" onClick={() => toggleSection('oci')}>
            <div className="toolkit-detail__section-title">
              <Package size={12} style={{ display: "inline", verticalAlign: "middle" }} /> Packaging & Metadata
            </div>
            {expandedSection === 'oci' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {expandedSection === 'oci' && (
            <div className="toolkit-detail__oci-info">
              <div className="toolkit-detail__oci-grid">
                {toolkit.version && (
                  <div className="toolkit-detail__oci-field">
                    <span className="toolkit-detail__facet-label"><GitBranch size={10} /> Version</span>
                    <span className="toolkit-detail__facet-value">{toolkit.version}</span>
                  </div>
                )}
                {toolkit.author && (
                  <div className="toolkit-detail__oci-field">
                    <span className="toolkit-detail__facet-label"><User size={10} /> Author</span>
                    <span className="toolkit-detail__facet-value">{typeof toolkit.author === 'string' ? toolkit.author : toolkit.author.name}</span>
                  </div>
                )}
                {toolkit.license && (
                  <div className="toolkit-detail__oci-field">
                    <span className="toolkit-detail__facet-label"><FileCode size={10} /> License</span>
                    <span className="toolkit-detail__facet-value">{toolkit.license}</span>
                  </div>
                )}
                {toolkit.createdAt && (
                  <div className="toolkit-detail__oci-field">
                    <span className="toolkit-detail__facet-label"><Clock size={10} /> Created</span>
                    <span className="toolkit-detail__facet-value">{new Date(toolkit.createdAt).toLocaleDateString()}</span>
                  </div>
                )}
                {toolkit.updatedAt && (
                  <div className="toolkit-detail__oci-field">
                    <span className="toolkit-detail__facet-label"><Clock size={10} /> Updated</span>
                    <span className="toolkit-detail__facet-value">{new Date(toolkit.updatedAt).toLocaleDateString()}</span>
                  </div>
                )}
                {toolkit.digest && (
                  <div className="toolkit-detail__oci-field" style={{ gridColumn: '1 / -1' }}>
                    <span className="toolkit-detail__facet-label"><Hash size={10} /> Digest</span>
                    <code className="toolkit-detail__digest">{toolkit.digest}</code>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Web Crawler Quick Actions */}
      {toolkitId === "web-crawler" && isEnabled && (
        <div className="toolkit-detail__section">
          <div className="toolkit-detail__section-title">
            Quick Actions
          </div>
          <div className="toolkit-detail__quick-actions">
            <div className="toolkit-detail__action-card">
              <div className="toolkit-detail__action-header">
                <GradientIcon icon={ExternalLink} size={16} gradient={toolkit.gradient} />
                <span>Fetch URL</span>
              </div>
              <div className="toolkit-detail__action-form">
                <input
                  className="toolkit-detail__input"
                  type="text"
                  placeholder="https://example.com"
                  value={crawlUrl}
                  onChange={e => setCrawlUrl(e.target.value)}
                />
                <div className="toolkit-detail__action-row">
                  <label className="toolkit-detail__label">Format</label>
                  <div className="toolkit-detail__pills">
                    {(["markdown", "text", "html"] as const).map(f => (
                      <button
                        key={f}
                        className={`toolkit-detail__pill ${crawlFormat === f ? "toolkit-detail__pill--active" : ""}`}
                        onClick={() => setCrawlFormat(f)}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  className="toolkit-detail__run-btn"
                  disabled={!crawlUrl.trim()}
                  onClick={() => {
                    // TODO: Wire to job executor
                    alert(`Would fetch: ${crawlUrl} as ${crawlFormat}`);
                  }}
                >
                  <Play size={12} /> Fetch
                </button>
              </div>
            </div>

            <div className="toolkit-detail__action-card">
              <div className="toolkit-detail__action-header">
                <GradientIcon icon={Search} size={16} gradient={toolkit.gradient} />
                <span>Crawl Site</span>
              </div>
              <div className="toolkit-detail__action-form">
                <input
                  className="toolkit-detail__input"
                  type="text"
                  placeholder="https://example.com"
                  value={crawlUrl}
                  onChange={e => setCrawlUrl(e.target.value)}
                />
                <div className="toolkit-detail__action-row">
                  <label className="toolkit-detail__label">Max depth</label>
                  <input
                    className="toolkit-detail__input toolkit-detail__input--small"
                    type="number"
                    min={1}
                    max={5}
                    value={crawlDepth}
                    onChange={e => setCrawlDepth(Number(e.target.value))}
                  />
                </div>
                <div className="toolkit-detail__action-row">
                  <label className="toolkit-detail__label">Max pages</label>
                  <input
                    className="toolkit-detail__input toolkit-detail__input--small"
                    type="number"
                    min={1}
                    max={100}
                    value={crawlMaxPages}
                    onChange={e => setCrawlMaxPages(Number(e.target.value))}
                  />
                </div>
                <button
                  className="toolkit-detail__run-btn"
                  disabled={!crawlUrl.trim()}
                  onClick={() => {
                    // TODO: Wire to job executor
                    alert(`Would crawl: ${crawlUrl} depth=${crawlDepth} maxPages=${crawlMaxPages}`);
                  }}
                >
                  <Play size={12} /> Crawl
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Coming soon overlay */}
      {isComingSoon && (
        <div className="toolkit-detail__coming-soon">
          <AlertCircle size={20} style={{ color: toolkit.color }} />
          <div>
            <strong>{toolkit.name}</strong> is coming soon. This toolkit will be available in a future update.
          </div>
        </div>
      )}
    </div>
  );
}
