import { useState } from "react";
import type { Agent, ToolkitId, ViewId, NavContext } from "@/types";
import { TOOLKITS } from "@/constants";
import { registry } from "@/services/commands/registry";
import {
  Globe, ScanText, AudioLines, Video, Bot, ArrowLeftRight,
  MessageSquare, Network, Download, Zap, Vote, FileText,
  Clapperboard, ListChecks, Image, Settings, FolderOpen,
  Sparkles, Wrench, Terminal, Hash, Shield,
  ExternalLink, Play, Link2, Search, Camera,
  Layers, Clock, CheckCircle2, AlertCircle,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
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
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [expandedCommand, setExpandedCommand] = useState<string | null>(null);
  const [crawlUrl, setCrawlUrl] = useState("");
  const [crawlDepth, setCrawlDepth] = useState(2);
  const [crawlMaxPages, setCrawlMaxPages] = useState(10);
  const [crawlFormat, setCrawlFormat] = useState<"markdown" | "text" | "html">("markdown");

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
